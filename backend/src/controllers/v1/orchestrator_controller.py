"""Orchestrator Controller — JSON-based agent builder conversation.

Endpoints:
  POST /orchestrator/start          — Start a new orchestrator session → returns JSON
  POST /orchestrator/continue       — Continue an existing session (answer questions) → returns JSON
  POST /orchestrator/save           — Save the finalised blueprint as an assistant
  GET  /orchestrator/{thread_id}    — Get current session status
  GET  /orchestrator/{thread_id}/messages — Full conversation history
"""

from __future__ import annotations

import json
import logging
import traceback
from uuid import uuid4

from datetime import datetime
from pytz import UTC
from fastapi import APIRouter, Depends, HTTPException
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Dict, List, Optional

from src.core.models.orchestrator import (
    GeneratedBlueprint,
    OrchestratorMessageRequest,
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

orchestrator_router = APIRouter(prefix="/orchestrator", tags=["orchestrator"])

# ── In-memory state cache (thread_id → last graph state) ─────────────
# This is a **hot cache**; the DB is the source of truth.
# On /continue, if the thread isn't in memory we restore from the DB's
# state_snapshot column on the latest OrchestrationMessage row.
_sessions: Dict[str, OrchestratorState] = {}


# ── Response models ──────────────────────────────────────────────────


class OrchestratorResponse(BaseModel):
    """Standard JSON response from every orchestrator endpoint."""

    thread_id: str
    phase: str
    message: str = Field("", description="The assistant's message to the user")
    questions: List[str] = Field(
        default_factory=list, description="Clarification questions (if any)"
    )
    blueprint: Optional[dict] = Field(
        None, description="The generated blueprint (when finalised)"
    )
    has_blueprint: bool = False
    needs_kb: bool = Field(
        False, description="True if the blueprint requires a knowledge base"
    )
    kb_id: Optional[str] = Field(None, description="KB ID if already created")
    use_case: Optional[str] = Field(None, description="Scoped use-case domain")
    model_provider: str = "ollama"
    model_name: str = "qwen2.5:3b"


class SaveBlueprintRequest(BaseModel):
    thread_id: str
    name: Optional[str] = None
    description: Optional[str] = None
    create_kb: bool = Field(
        True,
        description="If True and blueprint has knowledge_bases, create the KB record in DB",
    )


class ConversationMessageOut(BaseModel):
    """Single message in the conversation history."""

    id: str
    seq: int
    role: str
    content: str
    phase: str
    metadata: dict = Field(default_factory=dict)
    created_at: datetime


# ── State serialisation helpers ──────────────────────────────────────


def _serialise_state(state: OrchestratorState) -> dict:
    """Convert OrchestratorState to a JSON-safe dict for DB storage.

    LangChain messages are not JSON-serialisable out of the box,
    so we convert them to a lightweight list of dicts.
    """
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
        "model_provider": state.get("model_provider", "ollama"),
        "model_name": state.get("model_name", "qwen2.5:3b"),
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
    """Restore OrchestratorState from a DB JSON snapshot."""
    messages = []
    for m in data.get("messages", []):
        if m["role"] == "human":
            messages.append(HumanMessage(content=m["content"]))
        else:
            messages.append(AIMessage(content=m["content"]))

    return OrchestratorState(
        messages=messages,
        user_request=data.get("user_request", ""),
        model_provider=data.get("model_provider", "ollama"),
        model_name=data.get("model_name", "qwen2.5:3b"),
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


# ── DB helpers ───────────────────────────────────────────────────────


async def _next_seq(thread_id: str, session: AsyncSession) -> int:
    """Return the next sequence number for a thread's messages."""
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
    """Persist a single conversation message to the DB."""
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
    """Try to restore the OrchestratorState from the latest snapshot in the DB."""
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
        logger.info("  ♻️  Restored state from DB snapshot (seq=%d)", row.seq)
        return _deserialise_state(row.state_snapshot)
    return None


# ── Graph runner ─────────────────────────────────────────────────────


def _extract_response(thread_id: str, state: OrchestratorState) -> OrchestratorResponse:
    """Extract a clean JSON response from the final graph state."""
    message = ""
    if state.get("messages"):
        for m in reversed(state["messages"]):
            if isinstance(m, AIMessage):
                message = m.content
                break

    blueprint = None
    has_blueprint = False
    needs_kb = False
    if state.get("final_blueprint"):
        try:
            blueprint = json.loads(state["final_blueprint"])
            has_blueprint = True
            needs_kb = bool(blueprint.get("knowledge_bases"))
        except json.JSONDecodeError:
            pass

    return OrchestratorResponse(
        thread_id=thread_id,
        phase=state.get("phase", "unknown"),
        message=message,
        questions=state.get("clarification_questions", []),
        blueprint=blueprint,
        has_blueprint=has_blueprint,
        needs_kb=needs_kb,
        use_case=state.get("use_case") or None,
        model_provider=state.get("model_provider", "ollama"),
        model_name=state.get("model_name", "qwen2.5:3b"),
    )


async def _run_orchestrator(initial_state: OrchestratorState) -> OrchestratorState:
    """Run the orchestrator graph to completion and return final state."""
    graph = build_orchestrator_graph()
    last_state = initial_state.copy()

    async for event in graph.astream(initial_state, stream_mode="updates"):
        for node_name, node_output in event.items():
            for k, v in node_output.items():
                if k in last_state:
                    last_state[k] = v

    return last_state


# ── GET /orchestrator/use-cases ──────────────────────────────────────


@orchestrator_router.get("/use-cases")
async def list_available_use_cases():
    """Return all available use-case domains.

    Tools are universal — all 12 tools are available to every use-case.
    The ``use_case`` field on ``/start`` provides domain context, not
    tool restrictions.
    """
    from src.core.use_cases import list_use_cases as _list_uc

    return {"use_cases": _list_uc()}


# ── GET /orchestrator/tools ──────────────────────────────────────────


@orchestrator_router.get("/tools")
async def list_available_tools():
    """Return the full universal tool catalogue (12 tools).

    These tools are available to ALL use-cases. The LLM picks the ones
    that fit and justifies each selection.
    """
    from src.services.tool_catalogue import get_tool_descriptors_json

    return {"tools": get_tool_descriptors_json(), "total": 12}


# ── GET /orchestrator/use-cases/{use_case_id} ────────────────────────


@orchestrator_router.get("/use-cases/{use_case_id}")
async def get_use_case_detail(use_case_id: str):
    """Return detailed information about a specific use-case,
    plus the full universal tool catalogue."""
    from src.core.use_cases import get_use_case as _get_uc
    from src.services.tool_catalogue import get_tool_descriptors_json

    uc = _get_uc(use_case_id)
    if not uc:
        raise HTTPException(status_code=404, detail=f"Unknown use-case: {use_case_id}")
    return {
        "id": uc.id,
        "name": uc.name,
        "description": uc.description,
        "region": uc.region,
        "system_context": uc.system_context,
        "example_prompts": uc.example_prompts,
        "suggested_kb_topics": uc.suggested_kb_topics,
        "tools": get_tool_descriptors_json(),
    }


# ── POST /orchestrator/start ─────────────────────────────────────────


@orchestrator_router.post("/start", response_model=OrchestratorResponse)
async def start_orchestrator(
    req: OrchestratorMessageRequest,
    session: AsyncSession = Depends(get_session),
):
    """Start a new orchestrator conversation.

    Creates a Thread in the database, runs the orchestrator graph,
    and returns a JSON response with the thread_id, phase, and either
    clarification questions or a blueprint.

    Request body:
        message        — the user's use-case description
        model_provider — "ollama" (default) or "mistral"
        model_name     — "qwen2.5:3b" (default) or any supported model

    Response:
        thread_id  — use this to continue the conversation
        phase      — "clarifying" (has questions) or "finalised" (has blueprint)
        message    — the assistant's response text
        questions  — list of clarification questions (if phase == clarifying)
        blueprint  — the generated blueprint JSON (if phase == finalised)
    """
    thread_id = str(uuid4())
    now = datetime.now(UTC)

    user_message = req.resolved_message
    if not user_message:
        raise HTTPException(
            status_code=422,
            detail="Provide either 'message' (string) or 'answers' (list of strings).",
        )

    logger.info("=" * 70)
    logger.info("🚀 ORCHESTRATOR START")
    logger.info("   Thread:   %s", thread_id)
    logger.info("   Provider: %s", req.model_provider)
    logger.info("   Model:    %s", req.model_name)
    logger.info("   Use-case: %s", req.use_case or "(none)")
    logger.info("   Message:  %s", user_message[:300])
    logger.info("=" * 70)

    # 1. Create Thread in DB
    thread = ThreadORM(
        thread_id=thread_id,
        status="orchestrating",
        metadata_json={
            "type": "orchestrator",
            "model_provider": req.model_provider,
            "model_name": req.model_name,
            "use_case": req.use_case or "",
            "user_message": user_message[:500],
        },
        user_id="system",
        created_at=now,
        updated_at=now,
    )
    session.add(thread)
    await session.commit()
    logger.info("   💾 Thread created in DB: %s", thread_id)

    # 2. Build initial state and run graph
    try:
        initial_state: OrchestratorState = {
            "messages": [HumanMessage(content=user_message)],
            "user_request": user_message,
            "model_provider": req.model_provider,
            "model_name": req.model_name,
            "use_case": req.use_case or "",
            "skip_clarification": req.skip_clarification,
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

        # 3. Cache state for /continue
        _sessions[thread_id] = final_state

        # 4. Save conversation messages to DB
        seq = 1
        # -- user message
        await _save_message(
            session=session,
            thread_id=thread_id,
            role="human",
            content=user_message,
            phase="start",
            seq=seq,
            metadata={
                "model_provider": req.model_provider,
                "model_name": req.model_name,
            },
        )
        seq += 1

        # -- assistant response (last AI message)
        response = _extract_response(thread_id, final_state)
        await _save_message(
            session=session,
            thread_id=thread_id,
            role="ai",
            content=response.message,
            phase=final_state.get("phase", "unknown"),
            seq=seq,
            metadata={
                "questions": final_state.get("clarification_questions", []),
                "has_blueprint": response.has_blueprint,
            },
            state_snapshot=_serialise_state(final_state),
        )

        # 5. Update thread status in DB
        thread.status = final_state.get("phase", "unknown")
        thread.metadata_json = {
            **thread.metadata_json,
            "phase": final_state.get("phase"),
            "has_blueprint": bool(final_state.get("final_blueprint")),
            "questions": final_state.get("clarification_questions", []),
        }
        thread.updated_at = datetime.now(UTC)
        await session.commit()

        # 6. Build and return JSON response
        logger.info(
            "✅ Orchestrator START complete: thread=%s phase=%s questions=%d has_blueprint=%s",
            thread_id,
            response.phase,
            len(response.questions),
            response.has_blueprint,
        )
        return response

    except Exception as e:
        logger.error("❌ Orchestrator START failed: %s\n%s", e, traceback.format_exc())
        thread.status = "error"
        thread.metadata_json = {**thread.metadata_json, "error": str(e)}
        thread.updated_at = datetime.now(UTC)
        await session.commit()
        raise HTTPException(status_code=500, detail=f"Orchestrator failed: {e}")


# ── POST /orchestrator/continue ──────────────────────────────────────


@orchestrator_router.post("/continue", response_model=OrchestratorResponse)
async def continue_orchestrator(
    req: OrchestratorMessageRequest,
    session: AsyncSession = Depends(get_session),
):
    """Continue an existing orchestrator conversation.

    The user answers clarification questions, and the orchestrator
    continues through research → plan → review → finalise.

    Request body:
        thread_id      — REQUIRED, the thread_id from /start
        message        — the user's answers as free-form text
        answers        — OR a list of answer strings (alternative to message)
        model_provider — (optional) override, defaults to the one used in /start
        model_name     — (optional) override, defaults to the one used in /start

    Response: same as /start
    """
    thread_id = req.thread_id

    # Try in-memory first, then fall back to DB snapshot
    if thread_id and thread_id in _sessions:
        prev_state = _sessions[thread_id]
    elif thread_id:
        prev_state = await _restore_state_from_db(thread_id, session)
        if prev_state:
            _sessions[thread_id] = prev_state  # warm the cache
        else:
            raise HTTPException(
                status_code=404,
                detail=f"Session '{thread_id}' not found (neither in memory nor DB).",
            )
    else:
        raise HTTPException(
            status_code=422,
            detail="thread_id is required.",
        )

    user_message = req.resolved_message
    if not user_message:
        raise HTTPException(
            status_code=422,
            detail="Provide either 'message' (string) or 'answers' (list of strings).",
        )

    logger.info("=" * 70)
    logger.info("🔄 ORCHESTRATOR CONTINUE")
    logger.info("   Thread:  %s", thread_id)
    logger.info("   Message: %s", user_message[:300])
    logger.info("=" * 70)

    try:
        # Save user message to DB
        seq = await _next_seq(thread_id, session)
        await _save_message(
            session=session,
            thread_id=thread_id,
            role="human",
            content=user_message,
            phase="continue",
            seq=seq,
        )
        seq += 1

        enriched_request = (
            f"{prev_state.get('user_request', '')}\n\n"
            f"Additional details from user:\n{user_message}"
        )

        continued_state: OrchestratorState = {
            "messages": list(prev_state.get("messages", []))
            + [HumanMessage(content=user_message)],
            "user_request": enriched_request,
            "model_provider": req.model_provider
            or prev_state.get("model_provider", "ollama"),
            "model_name": req.model_name or prev_state.get("model_name", "qwen2.5:3b"),
            "use_case": req.use_case or prev_state.get("use_case", ""),
            "skip_clarification": True,  # always skip on continue — user already answered
            "phase": OrchestratorPhase.CLARIFYING.value,
            "clarification_questions": [],
            "research_notes": prev_state.get("research_notes", ""),
            "blueprint_json": prev_state.get("blueprint_json", ""),
            "review_feedback": prev_state.get("review_feedback", ""),
            "review_loop": prev_state.get("review_loop", 0),
            "is_approved": False,
            "final_blueprint": "",
        }

        final_state = await _run_orchestrator(continued_state)

        # Cache updated state
        _sessions[thread_id] = final_state

        # Save assistant response to DB
        response = _extract_response(thread_id, final_state)
        await _save_message(
            session=session,
            thread_id=thread_id,
            role="ai",
            content=response.message,
            phase=final_state.get("phase", "unknown"),
            seq=seq,
            metadata={
                "questions": final_state.get("clarification_questions", []),
                "has_blueprint": response.has_blueprint,
            },
            state_snapshot=_serialise_state(final_state),
        )

        # Update thread in DB
        thread = await session.get(ThreadORM, thread_id)
        if thread:
            thread.status = final_state.get("phase", "unknown")
            thread.metadata_json = {
                **thread.metadata_json,
                "phase": final_state.get("phase"),
                "has_blueprint": bool(final_state.get("final_blueprint")),
                "questions": final_state.get("clarification_questions", []),
            }
            thread.updated_at = datetime.now(UTC)
        await session.commit()

        logger.info(
            "✅ Orchestrator CONTINUE complete: thread=%s phase=%s questions=%d has_blueprint=%s",
            thread_id,
            response.phase,
            len(response.questions),
            response.has_blueprint,
        )
        return response

    except Exception as e:
        logger.error(
            "❌ Orchestrator CONTINUE failed: %s\n%s", e, traceback.format_exc()
        )
        raise HTTPException(status_code=500, detail=f"Orchestrator failed: {e}")


# ── GET /orchestrator/{thread_id} ────────────────────────────────────


@orchestrator_router.get("/{thread_id}", response_model=OrchestratorResponse)
async def get_orchestrator_status(
    thread_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get the current status of an orchestrator session."""
    # 1. Check memory
    if thread_id in _sessions:
        return _extract_response(thread_id, _sessions[thread_id])

    # 2. Try restoring from DB snapshot
    restored = await _restore_state_from_db(thread_id, session)
    if restored:
        _sessions[thread_id] = restored
        return _extract_response(thread_id, restored)

    # 3. Fallback to Thread metadata
    thread = await session.get(ThreadORM, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail=f"Thread '{thread_id}' not found")

    meta = thread.metadata_json or {}
    return OrchestratorResponse(
        thread_id=thread_id,
        phase=meta.get("phase", thread.status),
        message="Session found. Use /continue to resume.",
        questions=meta.get("questions", []),
        blueprint=None,
        has_blueprint=meta.get("has_blueprint", False),
        model_provider=meta.get("model_provider", "ollama"),
        model_name=meta.get("model_name", "qwen2.5:3b"),
    )


# ── POST /orchestrator/save ─────────────────────────────────────────


@orchestrator_router.post("/save")
async def save_blueprint(
    req: SaveBlueprintRequest,
    session: AsyncSession = Depends(get_session),
):
    """Save the finalised blueprint as an Assistant in the database.

    If the blueprint has knowledge_bases and ``create_kb`` is True,
    a single consolidated KnowledgeBase row is created.  The KB starts
    in "pending" status — documents can be ingested later via the
    ``/knowledge-base`` endpoints.

    Returns the created assistant_id and optional kb_id.
    """
    # -- Restore state
    if req.thread_id in _sessions:
        state = _sessions[req.thread_id]
    else:
        state = await _restore_state_from_db(req.thread_id, session)
        if not state:
            raise HTTPException(status_code=404, detail="Session not found")

    bp_json = state.get("final_blueprint", "")
    if not bp_json:
        raise HTTPException(
            status_code=400,
            detail="No finalised blueprint in this session. Phase must be 'finalised' or 'kb_confirm'.",
        )

    try:
        bp_data = json.loads(bp_json)
        blueprint = GeneratedBlueprint.model_validate(bp_data)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid blueprint: {e}")

    name = req.name or blueprint.name
    description = req.description or blueprint.description
    assistant_id = str(uuid4())
    now = datetime.now(UTC)

    config = {
        "model_provider": state.get("model_provider", "ollama"),
        "model_name": state.get("model_name", "qwen2.5:3b"),
        "system_prompt": f"You are {name}. {description}",
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

    # -- Create the consolidated Knowledge Base (if needed)
    kb_id: str | None = None
    if req.create_kb and blueprint.knowledge_bases:
        kb_id = str(uuid4())

        # Merge all blueprint KBs into one consolidated KB
        all_kb_names = [kb.name for kb in blueprint.knowledge_bases]
        all_kb_descs = [kb.description for kb in blueprint.knowledge_bases]
        merged_description = "; ".join(all_kb_descs) if all_kb_descs else description
        merged_name = f"{name} Knowledge Base"

        # Use config from the first KB for chunk settings
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
                "orchestrator_thread_id": req.thread_id,
            },
            document_count=0,
            user_id="system",
            created_at=now,
            updated_at=now,
        )
        session.add(kb_orm)

        # Add kb_id to assistant config so the agent knows its KB
        config["kb_id"] = kb_id

        logger.info(
            "📚 Knowledge Base created: id=%s name='%s' (merged from %d blueprint KBs)",
            kb_id,
            merged_name,
            len(blueprint.knowledge_bases),
        )

    assistant = AssistantORM(
        assistant_id=assistant_id,
        name=name,
        description=description,
        config=config,
        metadata_json={
            "orchestrator_thread_id": req.thread_id,
            "agent_type": blueprint.agent_type,
            "node_count": len(blueprint.nodes),
            "edge_count": len(blueprint.edges),
            "kb_id": kb_id,
            "knowledge_bases": [kb.model_dump() for kb in blueprint.knowledge_bases],
        },
        version=1,
        user_id="system",
        created_at=now,
        updated_at=now,
    )

    session.add(assistant)
    await session.commit()

    logger.info("💾 Blueprint saved as assistant: id=%s name='%s'", assistant_id, name)

    # Update thread status
    thread = await session.get(ThreadORM, req.thread_id)
    if thread:
        thread.status = "saved"
        thread.metadata_json = {
            **thread.metadata_json,
            "assistant_id": assistant_id,
            "kb_id": kb_id,
        }
        thread.updated_at = datetime.now(UTC)
        await session.commit()

    # Clean up memory cache
    _sessions.pop(req.thread_id, None)

    return {
        "success": True,
        "assistant_id": assistant_id,
        "name": name,
        "description": description,
        "agent_type": blueprint.agent_type,
        "node_count": len(blueprint.nodes),
        "tools": config["tools"],
        "tool_reasons": config["tool_reasons"],
        "kb_id": kb_id,
        "kb_status": "pending" if kb_id else None,
        "message": (
            f"Agent saved! Knowledge base '{name} Knowledge Base' created (status: pending). "
            f"Use POST /api/v1/knowledge-base/{kb_id}/ingest to upload documents.\n"
            f"Chat with your agent: POST /api/v1/agent/{assistant_id}/chat"
            if kb_id
            else f"Agent saved successfully! Chat with your agent: POST /api/v1/agent/{assistant_id}/chat"
        ),
    }


# ── GET /orchestrator/{thread_id}/messages ───────────────────────────


@orchestrator_router.get(
    "/{thread_id}/messages",
    response_model=List[ConversationMessageOut],
)
async def get_conversation_history(
    thread_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Return the full conversation history for an orchestrator thread.

    Messages are ordered by sequence number (oldest first).
    """
    # Verify thread exists
    thread = await session.get(ThreadORM, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail=f"Thread '{thread_id}' not found")

    result = await session.execute(
        select(OrchestrationMessage)
        .where(OrchestrationMessage.thread_id == thread_id)
        .order_by(OrchestrationMessage.seq.asc())
    )
    rows = result.scalars().all()

    return [
        ConversationMessageOut(
            id=r.id,
            seq=r.seq,
            role=r.role,
            content=r.content,
            phase=r.phase,
            metadata=r.metadata_json or {},
            created_at=r.created_at,
        )
        for r in rows
    ]
