"""Orchestrator Chat Controller — single conversational endpoint.

Instead of separate /start, /continue, /save endpoints, this provides
a single ``POST /orchestrator/chat`` that feels like a real conversation:

  1. User sends their first message → orchestrator asks clarification questions
  2. User answers → orchestrator builds, reviews, finalises the blueprint
  3. Orchestrator asks "Want to save? Give me a name" → user says "yes, call it X"
  4. Agent is saved internally, assistant_id returned — no separate /save call

Also supports ``model_provider: "mistral"`` so this can be driven by the
Mistral chat interface too.

Endpoints:
  POST /orchestrator/chat                — The unified conversation endpoint
  GET  /orchestrator/chat/{thread_id}    — Get conversation history
  GET  /orchestrator/tools               — List the 12 universal tools
  GET  /orchestrator/use-cases           — List available use-case domains
  GET  /orchestrator/use-cases/{id}      — Use-case detail
"""

from __future__ import annotations

import asyncio
import json
import logging
import re
import traceback
from uuid import uuid4
from datetime import datetime

from pytz import UTC
from fastapi import APIRouter, Depends, Header, HTTPException
from fastapi.responses import StreamingResponse
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, Dict, Optional

from src.core.sse import format_sse_message, get_sse_headers

from src.core.models.orchestrator import (
    GeneratedBlueprint,
    OrchestratorPhase,
)
from src.core.orm import (
    Assistant as AssistantORM,
    KnowledgeBase as KnowledgeBaseORM,
    OrchestrationMessage,
    Thread as ThreadORM,
    get_session,
)
from src.services.orchestrator_agent import (
    OrchestratorState,
    build_orchestrator_graph,
)

logger = logging.getLogger(__name__)

orchestrator_chat_router = APIRouter(prefix="/orchestrator", tags=["orchestrator-chat"])

# ── In-memory state cache ────────────────────────────────────────────
_sessions: Dict[str, OrchestratorState] = {}
# Extra metadata per thread (phase tracking beyond the graph state)
_thread_meta: Dict[str, dict] = {}


# ── Request / Response models ────────────────────────────────────────


class ChatRequest(BaseModel):
    """Single unified request — just send a message."""

    message: str = Field(..., min_length=1, description="Your message")
    thread_id: Optional[str] = Field(
        None,
        description="Thread ID to continue a conversation. Omit to start a new one.",
    )
    use_case: Optional[str] = Field(
        None,
        description="Optional use-case domain: housing_crisis, legal_aid, healthcare, crisis_support",
    )
    model_provider: str = Field(
        "mistral",
        description="LLM provider: 'mistral' (Mistral AI cloud) or 'ollama' (local)",
    )
    model_name: str = Field(
        "mistral-large-latest",
        description="Model name, e.g. 'mistral-large-latest' for Mistral or 'qwen2.5:3b' for Ollama",
    )


class ChatMessage(BaseModel):
    """A single message in the conversation."""

    role: str = Field(..., description="'human' or 'ai'")
    content: str


class ChatResponse(BaseModel):
    """Unified response — always the same shape."""

    thread_id: str
    phase: str = Field(..., description="Current conversation phase")
    message: str = Field("", description="The assistant's response")
    blueprint: Optional[dict] = Field(None, description="The blueprint (when ready)")
    assistant_id: Optional[str] = Field(None, description="Set once the agent is saved")
    kb_id: Optional[str] = Field(None, description="Knowledge base ID if created")
    agent_chat_url: Optional[str] = Field(
        None, description="URL to chat with the saved agent"
    )
    next_action: str = Field(
        "",
        description="Hint for the frontend: 'reply' (send thread_id + message), 'confirm_save', 'name_agent', 'chat_with_agent', 'done'",
    )


# ── State helpers (same as original controller) ──────────────────────


def _serialise_state(state: OrchestratorState) -> dict:
    messages_ser = []
    for m in state.get("messages", []):
        if isinstance(m, HumanMessage):
            messages_ser.append({"role": "human", "content": m.content})
        elif isinstance(m, AIMessage):
            messages_ser.append({"role": "ai", "content": m.content})
        else:
            messages_ser.append({"role": "unknown", "content": str(m.content)})
    return {
        "messages": messages_ser,
        "user_request": state.get("user_request", ""),
        "model_provider": state.get("model_provider", "mistral"),
        "model_name": state.get("model_name", "mistral-large-latest"),
        "use_case": state.get("use_case", ""),
        "skip_clarification": state.get("skip_clarification", False),
        "phase": state.get("phase", ""),
        "clarification_questions": state.get("clarification_questions", []),
        "research_notes": state.get("research_notes", ""),
        "blueprint_json": state.get("blueprint_json", ""),
        "review_feedback": state.get("review_feedback", ""),
        "review_loop": state.get("review_loop", 0),
        "is_approved": state.get("is_approved", False),
        "final_blueprint": state.get("final_blueprint", ""),
    }


def _deserialise_state(data: dict) -> OrchestratorState:
    messages = []
    for m in data.get("messages", []):
        if m["role"] == "human":
            messages.append(HumanMessage(content=m["content"]))
        else:
            messages.append(AIMessage(content=m["content"]))
    return OrchestratorState(
        messages=messages,
        user_request=data.get("user_request", ""),
        model_provider=data.get("model_provider", "mistral"),
        model_name=data.get("model_name", "mistral-large-latest"),
        use_case=data.get("use_case", ""),
        skip_clarification=data.get("skip_clarification", False),
        phase=data.get("phase", ""),
        clarification_questions=data.get("clarification_questions", []),
        research_notes=data.get("research_notes", ""),
        blueprint_json=data.get("blueprint_json", ""),
        review_feedback=data.get("review_feedback", ""),
        review_loop=data.get("review_loop", 0),
        is_approved=data.get("is_approved", False),
        final_blueprint=data.get("final_blueprint", ""),
    )


async def _next_seq(thread_id: str, session: AsyncSession) -> int:
    result = await session.execute(
        select(OrchestrationMessage.seq)
        .where(OrchestrationMessage.thread_id == thread_id)
        .order_by(OrchestrationMessage.seq.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    return (row or 0) + 1


async def _save_message(
    *,
    session: AsyncSession,
    thread_id: str,
    role: str,
    content: str,
    phase: str,
    seq: int,
    metadata: dict | None = None,
    state_snapshot: dict | None = None,
) -> OrchestrationMessage:
    msg = OrchestrationMessage(
        id=str(uuid4()),
        thread_id=thread_id,
        seq=seq,
        role=role,
        content=content,
        phase=phase,
        metadata_json=metadata or {},
        state_snapshot=state_snapshot,
        created_at=datetime.now(UTC),
    )
    session.add(msg)
    return msg


async def _restore_state_from_db(
    thread_id: str, session: AsyncSession
) -> OrchestratorState | None:
    result = await session.execute(
        select(OrchestrationMessage)
        .where(
            OrchestrationMessage.thread_id == thread_id,
            OrchestrationMessage.state_snapshot.isnot(None),
        )
        .order_by(OrchestrationMessage.seq.desc())
        .limit(1)
    )
    row = result.scalar_one_or_none()
    if row and row.state_snapshot:
        return _deserialise_state(row.state_snapshot)
    return None


async def _run_orchestrator(initial_state: OrchestratorState) -> OrchestratorState:
    graph = build_orchestrator_graph()
    last_state = initial_state.copy()
    async for event in graph.astream(initial_state, stream_mode="updates"):
        for node_name, node_output in event.items():
            for k, v in node_output.items():
                if k in last_state:
                    last_state[k] = v
    return last_state


# ── Intent detection helpers ─────────────────────────────────────────

_YES_PATTERNS = re.compile(
    r"^\s*(yes|yeah|yep|sure|ok|okay|go ahead|do it|save|create|let'?s go|confirm|absolutely|please)\s*$",
    re.IGNORECASE,
)
_NO_PATTERNS = re.compile(
    r"^\s*(no+|nah+|nope|skip|later|not\s*now|cancel|don'?t|nah+\s+later|no\s+thanks?|not\s+yet|maybe\s+later|skip\s+it)\s*[.!]?\s*$",
    re.IGNORECASE,
)


async def _extract_agent_name(message: str) -> str | None:
    """Extract an agent name from user message using an LLM.

    Handles natural language like:
      - "call it Customer Bot"
      - "yes, call it Housing Bot"
      - "My Helper Agent"
      - Just a plain name string

    Returns None for rejection phrases like "nah later", "no thanks", etc.
    """
    # Fast pre-check: reject phrases never contain a name
    if _is_rejection(message):
        return None

    try:
        from langchain_mistralai import ChatMistralAI
        from langchain_core.messages import SystemMessage, HumanMessage as HMsg

        llm = ChatMistralAI(model="mistral-small-latest", temperature=0.0)
        response = await llm.ainvoke([
            SystemMessage(content=(
                "You are a name extractor. The user has been asked to provide a name for their AI agent.\n"
                "Extract ONLY the agent name from their message. Rules:\n"
                "- Return ONLY the name, nothing else — no quotes, no explanation.\n"
                "- If the user says something like 'call it X' or 'name it X' or 'yes, X', extract X.\n"
                "- If the entire message IS a name (e.g. 'Support Bot'), return it as-is.\n"
                "- If the user is declining/rejecting (e.g. 'no', 'nah', 'skip'), return exactly: NONE\n"
                "- If you cannot find a clear name, return exactly: NONE\n"
                "- The name should be 1-100 characters.\n"
            )),
            HMsg(content=message.strip()),
        ])
        extracted = response.content.strip().strip("\"'")
        if not extracted or extracted.upper() == "NONE" or len(extracted) > 100:
            return None
        logger.info("🏷️  LLM extracted agent name: '%s' from '%s'", extracted, message[:80])
        return extracted
    except Exception as e:
        logger.error("❌ LLM name extraction failed: %s — falling back to raw message", e)
        # Simple fallback: just return the message itself if it's short enough
        cleaned = message.strip().strip("\"'")
        if cleaned and len(cleaned) <= 100 and not _is_rejection(cleaned):
            return cleaned
        return None


def _is_confirmation(msg: str) -> bool:
    return bool(_YES_PATTERNS.match(msg.strip()))


def _is_rejection(msg: str) -> bool:
    return bool(_NO_PATTERNS.match(msg.strip()))


# ── Save logic (internal tool call) ──────────────────────────────────


async def _internal_save_agent(
    *,
    thread_id: str,
    state: OrchestratorState,
    name: str,
    description: str | None = None,
    session: AsyncSession,
    user_id: str = "system",
) -> dict:
    """Save the blueprint as an assistant — the 'internal tool call'."""
    bp_json = state.get("final_blueprint", "")
    bp_data = json.loads(bp_json)
    blueprint = GeneratedBlueprint.model_validate(bp_data)

    agent_name = name
    agent_desc = description or blueprint.description
    assistant_id = str(uuid4())
    now = datetime.now(UTC)

    config: dict[str, Any] = {
        "model_provider": state.get("model_provider", "mistral"),
        "model_name": state.get("model_name", "mistral-large-latest"),
        "system_prompt": f"You are {agent_name}. {agent_desc}",
        "temperature": 0.7,
        "max_tokens": 4096,
        "tools": [],
        "tool_reasons": {},
        "blueprint": bp_data,
    }

    for node in blueprint.nodes:
        for ts in node.tools:
            if ts.name not in config["tools"]:
                config["tools"].append(ts.name)
                config["tool_reasons"][ts.name] = ts.reason

    # ── Knowledge Base ───────────────────────────────────────────────
    kb_id: str | None = None
    if blueprint.knowledge_bases:
        kb_id = str(uuid4())
        all_kb_names = [kb.name for kb in blueprint.knowledge_bases]
        all_kb_descs = [kb.description for kb in blueprint.knowledge_bases]
        merged_description = "; ".join(all_kb_descs) if all_kb_descs else agent_desc
        merged_name = f"{agent_name} Knowledge Base"

        first_kb = blueprint.knowledge_bases[0]
        kb_config = {
            "chunk_size": first_kb.chunk_size,
            "chunk_overlap": first_kb.chunk_overlap,
            "source_types": list({kb.source_type for kb in blueprint.knowledge_bases}),
            "original_kb_specs": [kb.model_dump() for kb in blueprint.knowledge_bases],
        }

        kb_orm = KnowledgeBaseORM(
            kb_id=kb_id,
            assistant_id=assistant_id,
            name=merged_name,
            description=merged_description,
            status="pending",
            config=kb_config,
            metadata_json={
                "merged_from": all_kb_names,
                "orchestrator_thread_id": thread_id,
            },
            document_count=0,
            user_id=user_id,
            created_at=now,
            updated_at=now,
        )
        session.add(kb_orm)
        config["kb_id"] = kb_id
        logger.info("📚 KB created: id=%s name='%s'", kb_id, merged_name)

    # ── Create Assistant ─────────────────────────────────────────────
    assistant = AssistantORM(
        assistant_id=assistant_id,
        name=agent_name,
        description=agent_desc,
        config=config,
        metadata_json={
            "orchestrator_thread_id": thread_id,
            "agent_type": blueprint.agent_type,
            "node_count": len(blueprint.nodes),
            "edge_count": len(blueprint.edges),
            "kb_id": kb_id,
            "knowledge_bases": [kb.model_dump() for kb in blueprint.knowledge_bases],
        },
        version=1,
        user_id=user_id,
        created_at=now,
        updated_at=now,
    )
    session.add(assistant)
    await session.commit()

    logger.info("💾 Agent saved: id=%s name='%s'", assistant_id, agent_name)

    # Update thread
    thread = await session.get(ThreadORM, thread_id)
    if thread:
        thread.status = "saved"
        thread.metadata_json = {
            **(thread.metadata_json or {}),
            "assistant_id": assistant_id,
            "kb_id": kb_id,
        }
        thread.updated_at = datetime.now(UTC)
        await session.commit()

    return {
        "assistant_id": assistant_id,
        "name": agent_name,
        "description": agent_desc,
        "kb_id": kb_id,
        "tools": config["tools"],
        "tool_reasons": config["tool_reasons"],
    }


# ── POST /orchestrator/chat ─────────────────────────────────────────


@orchestrator_chat_router.post("/chat", response_model=ChatResponse)
async def orchestrator_chat(
    req: ChatRequest,
    session: AsyncSession = Depends(get_session),
    user_id: str = Header("system", alias="X-User-Id"),
):
    """Unified conversational endpoint for building agents.

    This single endpoint handles the entire agent-building conversation:

    **Flow:**
    1. Send your first message (no thread_id) → creates a session, may ask
       clarification questions
    2. Answer questions (with thread_id) → orchestrator builds the blueprint
    3. Blueprint ready → orchestrator asks "Want to save? What should I call it?"
    4. You confirm + give a name → agent is saved internally, assistant_id returned

    **No separate /start, /continue, /save calls needed.**

    Works with both ``ollama`` and ``mistral`` providers.
    """
    thread_id = req.thread_id
    user_msg = req.message.strip()
    now = datetime.now(UTC)

    # ═══════════════════════════════════════════════════════════════════
    # CASE 1: New conversation (no thread_id)
    # ═══════════════════════════════════════════════════════════════════
    if not thread_id:
        thread_id = str(uuid4())
        logger.info("=" * 70)
        logger.info("💬 ORCHESTRATOR CHAT — New session")
        logger.info("   Thread:   %s", thread_id)
        logger.info("   Provider: %s", req.model_provider)
        logger.info("   Model:    %s", req.model_name)
        logger.info("   Message:  %s", user_msg[:300])
        logger.info("=" * 70)

        # Create thread in DB
        thread = ThreadORM(
            thread_id=thread_id,
            status="orchestrating",
            metadata_json={
                "type": "orchestrator_chat",
                "model_provider": req.model_provider,
                "model_name": req.model_name,
                "use_case": req.use_case or "",
            },
            user_id=user_id,
            created_at=now,
            updated_at=now,
        )
        session.add(thread)
        await session.commit()

        # Run orchestrator
        try:
            initial_state: OrchestratorState = {
                "messages": [HumanMessage(content=user_msg)],
                "user_request": user_msg,
                "model_provider": req.model_provider,
                "model_name": req.model_name,
                "use_case": req.use_case or "",
                "skip_clarification": False,
                "phase": OrchestratorPhase.CLARIFYING.value,
                "clarification_questions": [],
                "research_notes": "",
                "blueprint_json": "",
                "review_feedback": "",
                "review_loop": 0,
                "is_approved": False,
                "final_blueprint": "",
            }

            final_state = await _run_orchestrator(initial_state)
            _sessions[thread_id] = final_state
            _thread_meta[thread_id] = {
                "controller_phase": final_state.get("phase", "clarifying")
            }

            # Persist messages
            seq = 1
            await _save_message(
                session=session,
                thread_id=thread_id,
                role="human",
                content=user_msg,
                phase="chat",
                seq=seq,
            )
            seq += 1

            ai_msg = _get_last_ai_message(final_state)
            await _save_message(
                session=session,
                thread_id=thread_id,
                role="ai",
                content=ai_msg,
                phase=final_state.get("phase", "unknown"),
                seq=seq,
                state_snapshot=_serialise_state(final_state),
            )

            # Update thread
            thread.status = final_state.get("phase", "unknown")
            thread.updated_at = datetime.now(UTC)
            await session.commit()

            return _build_response(thread_id, final_state)

        except Exception as e:
            logger.error("❌ Chat failed: %s\n%s", e, traceback.format_exc())
            raise HTTPException(status_code=500, detail=f"Orchestrator failed: {e}")

    # ═══════════════════════════════════════════════════════════════════
    # CASE 2: Continuing an existing conversation
    # ═══════════════════════════════════════════════════════════════════

    # Restore state
    prev_state = _sessions.get(thread_id)
    if not prev_state:
        prev_state = await _restore_state_from_db(thread_id, session)
        if prev_state:
            _sessions[thread_id] = prev_state
        else:
            raise HTTPException(
                status_code=404, detail=f"Thread '{thread_id}' not found."
            )

    current_phase = _thread_meta.get(thread_id, {}).get(
        "controller_phase"
    ) or prev_state.get("phase", "")

    logger.info("=" * 70)
    logger.info("💬 ORCHESTRATOR CHAT — Continue")
    logger.info("   Thread:  %s", thread_id)
    logger.info("   Phase:   %s", current_phase)
    logger.info("   Message: %s", user_msg[:300])
    logger.info("=" * 70)

    # ── Phase: awaiting_name — user is giving us the agent name ──────
    if current_phase == "awaiting_name":
        return await _handle_naming(thread_id, user_msg, prev_state, session, user_id=user_id)

    # ── Phase: finalised / kb_confirm — blueprint is ready ───────────
    if current_phase in ("finalised", "kb_confirm"):
        return await _handle_save_decision(thread_id, user_msg, prev_state, session, user_id=user_id)

    # ── Phase: saved — agent already saved, nothing more to do ───────
    if current_phase == "saved":
        meta = _thread_meta.get(thread_id, {})
        assistant_id = meta.get("assistant_id", "")
        return ChatResponse(
            thread_id=thread_id,
            phase="saved",
            message=(
                f"This agent has already been saved! 🎉\n\n"
                f"Chat with your agent: `POST /api/v1/agent/{assistant_id}/chat`"
            ),
            assistant_id=assistant_id,
            agent_chat_url=(
                f"/api/v1/agent/{assistant_id}/chat" if assistant_id else None
            ),
            next_action="chat_with_agent",
        )

    # ── Phase: clarifying / researching / planning — run the graph ───
    try:
        seq = await _next_seq(thread_id, session)
        await _save_message(
            session=session,
            thread_id=thread_id,
            role="human",
            content=user_msg,
            phase="chat",
            seq=seq,
        )
        seq += 1

        # If we're still in the clarifying phase, feed the user's answers
        # back to the clarifier so it can decide if it has enough info.
        # Only skip clarification when the clarifier itself said "clear".
        still_clarifying = current_phase == "clarifying"

        enriched_request = (
            f"{prev_state.get('user_request', '')}\n\n"
            f"Additional details from user:\n{user_msg}"
        )

        continued_state: OrchestratorState = {
            "messages": list(prev_state.get("messages", []))
            + [HumanMessage(content=user_msg)],
            "user_request": enriched_request,
            "model_provider": req.model_provider
            or prev_state.get("model_provider", "mistral"),
            "model_name": req.model_name or prev_state.get("model_name", "mistral-large-latest"),
            "use_case": req.use_case or prev_state.get("use_case", ""),
            "skip_clarification": not still_clarifying,
            "phase": OrchestratorPhase.CLARIFYING.value,
            "clarification_questions": [],
            "research_notes": prev_state.get("research_notes", "") if not still_clarifying else "",
            "blueprint_json": prev_state.get("blueprint_json", "") if not still_clarifying else "",
            "review_feedback": prev_state.get("review_feedback", "") if not still_clarifying else "",
            "review_loop": prev_state.get("review_loop", 0) if not still_clarifying else 0,
            "is_approved": False,
            "final_blueprint": "",
        }

        final_state = await _run_orchestrator(continued_state)
        _sessions[thread_id] = final_state
        _thread_meta[thread_id] = {
            "controller_phase": final_state.get("phase", "unknown")
        }

        ai_msg = _get_last_ai_message(final_state)
        await _save_message(
            session=session,
            thread_id=thread_id,
            role="ai",
            content=ai_msg,
            phase=final_state.get("phase", "unknown"),
            seq=seq,
            state_snapshot=_serialise_state(final_state),
        )

        thread = await session.get(ThreadORM, thread_id)
        if thread:
            thread.status = final_state.get("phase", "unknown")
            thread.updated_at = datetime.now(UTC)
        await session.commit()

        return _build_response(thread_id, final_state)

    except Exception as e:
        logger.error("❌ Chat continue failed: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Orchestrator failed: {e}")


# ── POST /orchestrator/chat/stream — SSE streaming endpoint ─────────


async def _stream_orchestrator(initial_state: OrchestratorState):
    """Run the orchestrator graph and yield SSE events for each node transition."""
    graph = build_orchestrator_graph()
    last_state = initial_state.copy()
    async for event in graph.astream(initial_state, stream_mode="updates"):
        for node_name, node_output in event.items():
            for k, v in node_output.items():
                if k in last_state:
                    last_state[k] = v
            yield node_name, last_state.copy()


@orchestrator_chat_router.post("/chat/stream")
async def orchestrator_chat_stream(
    req: ChatRequest,
    session: AsyncSession = Depends(get_session),
    user_id: str = Header("system", alias="X-User-Id"),
):
    """SSE streaming version of ``/orchestrator/chat``.

    Streams real-time phase updates as the orchestrator works through
    clarify → research → plan → review → finalise.

    Supports ``model_provider: "ollama"`` for local LLM inference.

    **SSE Events:**
      - ``phase``     — ``{ phase, node, message? }``
      - ``blueprint`` — ``{ blueprint }``
      - ``done``      — full ``ChatResponse`` dict
      - ``error``     — ``{ error }``
    """
    thread_id = req.thread_id
    user_msg = req.message.strip()
    now = datetime.now(UTC)

    async def event_generator():
        nonlocal thread_id

        try:
            # ── New conversation ─────────────────────────────────────
            if not thread_id:
                thread_id = str(uuid4())

                yield format_sse_message("phase", {
                    "phase": "started",
                    "node": "init",
                    "message": "Starting orchestrator session…",
                    "thread_id": thread_id,
                })

                thread = ThreadORM(
                    thread_id=thread_id,
                    status="orchestrating",
                    metadata_json={
                        "type": "orchestrator_chat",
                        "model_provider": req.model_provider,
                        "model_name": req.model_name,
                        "use_case": req.use_case or "",
                    },
                    user_id=user_id,
                    created_at=now,
                    updated_at=now,
                )
                session.add(thread)
                await session.commit()

                initial_state: OrchestratorState = {
                    "messages": [HumanMessage(content=user_msg)],
                    "user_request": user_msg,
                    "model_provider": req.model_provider,
                    "model_name": req.model_name,
                    "use_case": req.use_case or "",
                    "skip_clarification": False,
                    "phase": OrchestratorPhase.CLARIFYING.value,
                    "clarification_questions": [],
                    "research_notes": "",
                    "blueprint_json": "",
                    "review_feedback": "",
                    "review_loop": 0,
                    "is_approved": False,
                    "final_blueprint": "",
                }

                final_state = initial_state.copy()
                async for node_name, state in _stream_orchestrator(initial_state):
                    phase = state.get("phase", "unknown")
                    ai_msg = _get_last_ai_message(state)
                    final_state = state

                    yield format_sse_message("phase", {
                        "phase": phase,
                        "node": node_name,
                        "message": ai_msg[:500] if ai_msg else None,
                    })

                    bp = _get_blueprint_dict(state)
                    if bp:
                        yield format_sse_message("blueprint", {"blueprint": bp})

                _sessions[thread_id] = final_state
                _thread_meta[thread_id] = {
                    "controller_phase": final_state.get("phase", "clarifying")
                }

                seq = 1
                await _save_message(
                    session=session, thread_id=thread_id, role="human",
                    content=user_msg, phase="chat", seq=seq,
                )
                seq += 1
                ai_msg = _get_last_ai_message(final_state)
                await _save_message(
                    session=session, thread_id=thread_id, role="ai",
                    content=ai_msg,
                    phase=final_state.get("phase", "unknown"),
                    seq=seq, state_snapshot=_serialise_state(final_state),
                )
                thread_obj = await session.get(ThreadORM, thread_id)
                if thread_obj:
                    thread_obj.status = final_state.get("phase", "unknown")
                    thread_obj.updated_at = datetime.now(UTC)
                await session.commit()

                resp = _build_response(thread_id, final_state)
                yield format_sse_message("done", resp.model_dump())

            else:
                # ── Continue existing conversation ───────────────────
                prev_state = _sessions.get(thread_id)
                if not prev_state:
                    prev_state = await _restore_state_from_db(thread_id, session)
                    if prev_state:
                        _sessions[thread_id] = prev_state

                if not prev_state:
                    yield format_sse_message("error", {
                        "error": f"Thread '{thread_id}' not found.",
                    })
                    return

                current_phase = _thread_meta.get(thread_id, {}).get(
                    "controller_phase"
                ) or prev_state.get("phase", "")

                # Save-flow phases (no graph streaming needed)
                if current_phase == "awaiting_name":
                    result = await _handle_naming(
                        thread_id, user_msg, prev_state, session, user_id=user_id,
                    )
                    yield format_sse_message("done", result.model_dump())
                    return

                if current_phase in ("finalised", "kb_confirm"):
                    result = await _handle_save_decision(
                        thread_id, user_msg, prev_state, session, user_id=user_id,
                    )
                    yield format_sse_message("done", result.model_dump())
                    return

                if current_phase == "saved":
                    meta = _thread_meta.get(thread_id, {})
                    aid = meta.get("assistant_id", "")
                    resp = ChatResponse(
                        thread_id=thread_id, phase="saved",
                        message=f"This agent has already been saved! 🎉\n\nChat with your agent: `POST /api/v1/agent/{aid}/chat`",
                        assistant_id=aid,
                        agent_chat_url=f"/api/v1/agent/{aid}/chat" if aid else None,
                        next_action="chat_with_agent",
                    )
                    yield format_sse_message("done", resp.model_dump())
                    return

                # Run the graph with streaming
                yield format_sse_message("phase", {
                    "phase": "continuing",
                    "node": "init",
                    "message": "Processing your response…",
                })

                seq = await _next_seq(thread_id, session)
                await _save_message(
                    session=session, thread_id=thread_id, role="human",
                    content=user_msg, phase="chat", seq=seq,
                )
                seq += 1

                # If still in clarifying phase, let the clarifier re-evaluate
                # instead of skipping straight to research
                still_clarifying = current_phase == "clarifying"

                enriched_request = (
                    f"{prev_state.get('user_request', '')}\n\n"
                    f"Additional details from user:\n{user_msg}"
                )

                continued_state: OrchestratorState = {
                    "messages": list(prev_state.get("messages", []))
                    + [HumanMessage(content=user_msg)],
                    "user_request": enriched_request,
                    "model_provider": req.model_provider
                    or prev_state.get("model_provider", "mistral"),
                    "model_name": req.model_name
                    or prev_state.get("model_name", "mistral-large-latest"),
                    "use_case": req.use_case or prev_state.get("use_case", ""),
                    "skip_clarification": not still_clarifying,
                    "phase": OrchestratorPhase.CLARIFYING.value,
                    "clarification_questions": [],
                    "research_notes": prev_state.get("research_notes", "") if not still_clarifying else "",
                    "blueprint_json": prev_state.get("blueprint_json", "") if not still_clarifying else "",
                    "review_feedback": prev_state.get("review_feedback", "") if not still_clarifying else "",
                    "review_loop": prev_state.get("review_loop", 0) if not still_clarifying else 0,
                    "is_approved": False,
                    "final_blueprint": "",
                }

                final_state = continued_state.copy()
                async for node_name, state in _stream_orchestrator(continued_state):
                    phase = state.get("phase", "unknown")
                    ai_msg = _get_last_ai_message(state)
                    final_state = state

                    yield format_sse_message("phase", {
                        "phase": phase,
                        "node": node_name,
                        "message": ai_msg[:500] if ai_msg else None,
                    })

                    bp = _get_blueprint_dict(state)
                    if bp:
                        yield format_sse_message("blueprint", {"blueprint": bp})

                _sessions[thread_id] = final_state
                _thread_meta[thread_id] = {
                    "controller_phase": final_state.get("phase", "unknown")
                }

                ai_msg = _get_last_ai_message(final_state)
                await _save_message(
                    session=session, thread_id=thread_id, role="ai",
                    content=ai_msg,
                    phase=final_state.get("phase", "unknown"),
                    seq=seq, state_snapshot=_serialise_state(final_state),
                )
                thread_obj = await session.get(ThreadORM, thread_id)
                if thread_obj:
                    thread_obj.status = final_state.get("phase", "unknown")
                    thread_obj.updated_at = datetime.now(UTC)
                await session.commit()

                resp = _build_response(thread_id, final_state)
                yield format_sse_message("done", resp.model_dump())

        except Exception as e:
            logger.error("❌ Stream failed: %s\n%s", e, traceback.format_exc())
            yield format_sse_message("error", {"error": str(e)})

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=get_sse_headers(),
    )


# ── Save-decision handler ───────────────────────────────────────────


async def _handle_save_decision(
    thread_id: str,
    user_msg: str,
    state: OrchestratorState,
    session: AsyncSession,
    user_id: str = "system",
) -> ChatResponse:
    """User has seen the blueprint. Did they say yes, no, or give a name?

    In the ``kb_confirm`` phase, a rejection means "skip the KB" but
    still save.  In the ``finalised`` phase, a rejection means
    "don't save at all".
    """

    current_phase = _thread_meta.get(thread_id, {}).get(
        "controller_phase"
    ) or state.get("phase", "finalised")

    seq = await _next_seq(thread_id, session)
    await _save_message(
        session=session,
        thread_id=thread_id,
        role="human",
        content=user_msg,
        phase="save_decision",
        seq=seq,
    )
    seq += 1

    # ── kb_confirm phase: rejection means "skip KB, still save" ──────
    if current_phase == "kb_confirm" and _is_rejection(user_msg):
        # Strip knowledge_bases from the blueprint so the save won't create a KB
        bp_json = state.get("final_blueprint", "")
        try:
            bp_data = json.loads(bp_json)
            bp_data["knowledge_bases"] = []
            state["final_blueprint"] = json.dumps(bp_data)
            _sessions[thread_id] = state
        except Exception:
            pass

        # Move to finalised phase (ask to save)
        _thread_meta[thread_id] = {
            **_thread_meta.get(thread_id, {}),
            "controller_phase": "finalised",
        }
        response_msg = (
            "Got it — no knowledge base. Would you like to save the agent? "
            "If so, what should I call it? 🤖"
        )
        await _save_message(
            session=session,
            thread_id=thread_id,
            role="ai",
            content=response_msg,
            phase="finalised",
            seq=seq,
        )
        await session.commit()
        return ChatResponse(
            thread_id=thread_id,
            phase="finalised",
            message=response_msg,
            blueprint=_get_blueprint_dict(state),
            next_action="confirm_save",
        )

    if _is_rejection(user_msg):
        # User doesn't want to save
        response_msg = (
            "No worries! Your blueprint is still here if you change your mind. "
            "Just send another message to this thread to continue."
        )
        await _save_message(
            session=session,
            thread_id=thread_id,
            role="ai",
            content=response_msg,
            phase="finalised",
            seq=seq,
        )
        await session.commit()
        return ChatResponse(
            thread_id=thread_id,
            phase="finalised",
            message=response_msg,
            blueprint=_get_blueprint_dict(state),
            next_action="confirm_save",
        )

    # Check for embedded name FIRST (e.g. "yes, call it Support Bot")
    # before checking for bare confirmation, so we can save in one step.
    extracted = await _extract_agent_name(user_msg)
    # Only use the extracted name if the user actually provided a distinct
    # name — not just a bare confirmation word like "yes" or "sure".
    if extracted and not _is_confirmation(extracted):
        return await _do_save(thread_id, extracted, state, session, seq, user_id=user_id)

    if _is_confirmation(user_msg):
        # User said yes but didn't give a name — ask for one
        _thread_meta[thread_id] = {
            **_thread_meta.get(thread_id, {}),
            "controller_phase": "awaiting_name",
        }
        response_msg = (
            "Great! What would you like to name your agent? 🤖\n\n"
            'Just type a name like **"Customer Support Bot"** or **"My Research Agent"**.'
        )
        await _save_message(
            session=session,
            thread_id=thread_id,
            role="ai",
            content=response_msg,
            phase="awaiting_name",
            seq=seq,
        )
        await session.commit()
        return ChatResponse(
            thread_id=thread_id,
            phase="awaiting_name",
            message=response_msg,
            blueprint=_get_blueprint_dict(state),
            next_action="name_agent",
        )

    # Fallback — treat as confirmation, ask for name
    _thread_meta[thread_id] = {
        **_thread_meta.get(thread_id, {}),
        "controller_phase": "awaiting_name",
    }
    response_msg = (
        "I'd love to save your agent! What should I call it? 🤖\n\n"
        'Just type a name like **"Customer Support Bot"**.'
    )
    await _save_message(
        session=session,
        thread_id=thread_id,
        role="ai",
        content=response_msg,
        phase="awaiting_name",
        seq=seq,
    )
    await session.commit()
    return ChatResponse(
        thread_id=thread_id,
        phase="awaiting_name",
        message=response_msg,
        blueprint=_get_blueprint_dict(state),
        next_action="name_agent",
    )


# ── Naming handler ──────────────────────────────────────────────────


async def _handle_naming(
    thread_id: str,
    user_msg: str,
    state: OrchestratorState,
    session: AsyncSession,
    user_id: str = "system",
) -> ChatResponse:
    """User is providing the name for their agent."""

    seq = await _next_seq(thread_id, session)
    await _save_message(
        session=session,
        thread_id=thread_id,
        role="human",
        content=user_msg,
        phase="naming",
        seq=seq,
    )
    seq += 1

    name = await _extract_agent_name(user_msg)
    if not name:
        response_msg = (
            "I didn't quite catch that. Please give me a short name for your agent "
            '(e.g. **"Support Bot"** or **"Research Assistant"**).'
        )
        await _save_message(
            session=session,
            thread_id=thread_id,
            role="ai",
            content=response_msg,
            phase="awaiting_name",
            seq=seq,
        )
        await session.commit()
        return ChatResponse(
            thread_id=thread_id,
            phase="awaiting_name",
            message=response_msg,
            blueprint=_get_blueprint_dict(state),
            next_action="name_agent",
        )

    return await _do_save(thread_id, name, state, session, seq, user_id=user_id)


# ── Internal save execution ─────────────────────────────────────────


async def _do_save(
    thread_id: str,
    name: str,
    state: OrchestratorState,
    session: AsyncSession,
    seq: int,
    user_id: str = "system",
) -> ChatResponse:
    """Actually save the agent and return the response."""
    try:
        result = await _internal_save_agent(
            thread_id=thread_id,
            state=state,
            name=name,
            session=session,
            user_id=user_id,
        )

        assistant_id = result["assistant_id"]
        kb_id = result.get("kb_id")
        tools = result.get("tools", [])
        tool_reasons = result.get("tool_reasons", {})

        # Build a nice confirmation message
        tool_lines = []
        for t in tools:
            reason = tool_reasons.get(t, "")
            if reason:
                tool_lines.append(f"  • **{t}** — {reason}")
            else:
                tool_lines.append(f"  • **{t}**")

        response_msg = (
            f"✅ **Agent saved successfully!**\n\n"
            f"**Name:** {name}\n"
            f"**Agent ID:** `{assistant_id}`\n"
        )

        if kb_id:
            response_msg += (
                f"**Knowledge Base ID:** `{kb_id}` (status: pending)\n\n"
                f"📚 Upload documents to your KB:\n"
                f"  `POST /api/v1/knowledge-base/{kb_id}/ingest`\n\n"
            )

        if tool_lines:
            response_msg += "**Tools:**\n" + "\n".join(tool_lines) + "\n\n"

        response_msg += (
            f"💬 **Chat with your agent now:**\n"
            f"```\n"
            f"POST /api/v1/agent/{assistant_id}/chat\n"
            f'{{"message": "Hello!"}}\n'
            f"```"
        )

        # Update phase
        _thread_meta[thread_id] = {
            **_thread_meta.get(thread_id, {}),
            "controller_phase": "saved",
            "assistant_id": assistant_id,
        }

        await _save_message(
            session=session,
            thread_id=thread_id,
            role="ai",
            content=response_msg,
            phase="saved",
            seq=seq,
            state_snapshot=_serialise_state(state),
        )
        await session.commit()

        # Clean up graph state from memory (keep thread_meta)
        _sessions.pop(thread_id, None)

        return ChatResponse(
            thread_id=thread_id,
            phase="saved",
            message=response_msg,
            blueprint=_get_blueprint_dict(state),
            assistant_id=assistant_id,
            kb_id=kb_id,
            agent_chat_url=f"/api/v1/agent/{assistant_id}/chat",
            next_action="chat_with_agent",
        )

    except Exception as e:
        logger.error("❌ Save failed: %s\n%s", e, traceback.format_exc())
        response_msg = f"Sorry, I couldn't save the agent: {e}\nPlease try again."
        await _save_message(
            session=session,
            thread_id=thread_id,
            role="ai",
            content=response_msg,
            phase="error",
            seq=seq,
        )
        await session.commit()
        raise HTTPException(status_code=500, detail=f"Failed to save agent: {e}")


# ── Response builder helpers ─────────────────────────────────────────


def _get_last_ai_message(state: OrchestratorState) -> str:
    for m in reversed(state.get("messages", [])):
        if isinstance(m, AIMessage):
            return m.content
    return ""


def _get_blueprint_dict(state: OrchestratorState) -> dict | None:
    bp_json = state.get("final_blueprint", "")
    if bp_json:
        try:
            return json.loads(bp_json)
        except json.JSONDecodeError:
            pass
    return None


def _build_response(thread_id: str, state: OrchestratorState) -> ChatResponse:
    """Build a ChatResponse from the current graph state."""
    phase = state.get("phase", "unknown")
    ai_msg = _get_last_ai_message(state)
    blueprint = _get_blueprint_dict(state)

    # Determine next_action hint for the frontend
    if phase == "clarifying":
        next_action = "reply"
    elif phase in ("finalised", "kb_confirm"):
        next_action = "confirm_save"
    elif phase == "awaiting_name":
        next_action = "name_agent"
    elif phase == "saved":
        next_action = "chat_with_agent"
    else:
        next_action = "reply"

    return ChatResponse(
        thread_id=thread_id,
        phase=phase,
        message=ai_msg,
        blueprint=blueprint if phase in ("finalised", "kb_confirm") else None,
        next_action=next_action,
    )


# ── GET /orchestrator/chat/{thread_id} — conversation history ───────


@orchestrator_chat_router.get("/chat/{thread_id}")
async def get_chat_history(
    thread_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get the full conversation history for a chat thread."""
    thread = await session.get(ThreadORM, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail=f"Thread '{thread_id}' not found")

    result = await session.execute(
        select(OrchestrationMessage)
        .where(OrchestrationMessage.thread_id == thread_id)
        .order_by(OrchestrationMessage.seq.asc())
    )
    rows = result.scalars().all()

    messages = [ChatMessage(role=r.role, content=r.content) for r in rows]

    meta = _thread_meta.get(thread_id, {})
    return {
        "thread_id": thread_id,
        "phase": meta.get("controller_phase") or thread.status,
        "messages": [m.model_dump() for m in messages],
        "assistant_id": (thread.metadata_json or {}).get("assistant_id"),
    }
