"""Agent Chat Controller — chat with a built agent using its assistant_id.

Once a blueprint is saved as an assistant (via POST /orchestrator/save),
use these endpoints to start a conversation with the compiled agent.

Endpoints:
  POST /agent/{assistant_id}/chat    — Send a message and get a response
  GET  /agent/{assistant_id}/threads — List threads for an assistant
  GET  /agent/{assistant_id}/thread/{thread_id} — Get thread messages
"""

from __future__ import annotations

import logging
import traceback
from uuid import uuid4
from datetime import datetime

from pytz import UTC
from fastapi import APIRouter, Depends, Header, HTTPException
from langchain_core.messages import AIMessage, HumanMessage
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from typing import Any, Dict, List, Optional

from src.core.models.orchestrator import GeneratedBlueprint
from src.core.orm import (
    Assistant as AssistantORM,
    Thread as ThreadORM,
    Run as RunORM,
    get_session,
)
from src.services.blueprint_compiler import compile_blueprint, CompiledAgentState

logger = logging.getLogger(__name__)

agent_chat_router = APIRouter(prefix="/agent", tags=["agent-chat"])


# ── Request / Response models ────────────────────────────────────────


class AgentChatRequest(BaseModel):
    """Send a message to a built agent."""

    message: str = Field(..., min_length=1, description="User message")
    thread_id: Optional[str] = Field(
        None,
        description="Thread ID for multi-turn conversation. Omit to create a new thread.",
    )


class AgentChatMessage(BaseModel):
    """A single message in the agent conversation."""

    role: str
    content: str


class AgentChatResponse(BaseModel):
    """Response from the agent."""

    assistant_id: str
    thread_id: str
    run_id: str
    message: str = Field("", description="The agent's response")
    messages: List[AgentChatMessage] = Field(
        default_factory=list,
        description="Full conversation history for this run",
    )
    tools_used: List[str] = Field(
        default_factory=list,
        description="Tools invoked during this run",
    )
    iterations: int = 0
    status: str = "completed"


# ── In-memory conversation cache ─────────────────────────────────────
# thread_id → list of messages (for multi-turn within same session)
_agent_threads: Dict[str, list] = {}

# Cache compiled graphs to avoid re-compiling on every message
_compiled_graphs: Dict[str, Any] = {}


# ── Helpers ──────────────────────────────────────────────────────────


async def _get_assistant_or_404(
    assistant_id: str, session: AsyncSession
) -> AssistantORM:
    """Fetch assistant from DB or raise 404."""
    assistant = await session.get(AssistantORM, assistant_id)
    if not assistant:
        raise HTTPException(
            status_code=404, detail=f"Assistant '{assistant_id}' not found"
        )
    return assistant


def _build_system_prompt(config: dict, metadata: dict) -> str:
    """Build a final system prompt by merging the base prompt with guardrails and KB context."""
    base_prompt = config.get("system_prompt", "You are a helpful assistant.")
    sections: list[str] = [base_prompt]

    guardrails = metadata.get("guardrails", {})
    if guardrails:
        rules: list[str] = []
        if guardrails.get("toxicity"):
            rules.append("Never generate harmful, offensive, or toxic content.")
        if guardrails.get("pii"):
            rules.append(
                "Never collect, reveal, or store personally identifiable information (PII) "
                "such as names, emails, phone numbers, or addresses."
            )
        custom = guardrails.get("customInstructions", "")
        if custom:
            rules.append(custom)
        if rules:
            sections.append("GUARDRAILS:\n" + "\n".join(f"- {r}" for r in rules))

    kb = metadata.get("knowledgeBase", {})
    if kb:
        context = kb.get("context", "")
        if context:
            sections.append(f"KNOWLEDGE BASE CONTEXT:\n{context}")
        urls = kb.get("urls", [])
        if urls:
            url_lines = "\n".join(f"- {u}" for u in urls)
            sections.append(
                f"REFERENCE SOURCES (use these as authoritative references when answering):\n{url_lines}"
            )

    return "\n\n".join(sections)


def _compile_assistant(assistant: AssistantORM) -> Any:
    """Compile an assistant's blueprint into a runnable graph (cached).

    Falls back to a minimal single-node blueprint for assistants created
    via the manual form (no orchestrator blueprint in config).
    """
    aid = assistant.assistant_id

    # Return cached graph if available
    if aid in _compiled_graphs:
        return _compiled_graphs[aid]

    config = assistant.config or {}
    metadata = assistant.metadata_json or {}
    bp_data = config.get("blueprint")

    if not bp_data:
        # Build a minimal single-node blueprint from assistant config
        tools_list = config.get("tools", [])
        system_prompt = _build_system_prompt(config, metadata)
        bp_data = {
            "name": assistant.name,
            "description": assistant.description or "",
            "goal": f"You are {assistant.name}. Be helpful and accurate.",
            "use_case": "general",
            "agent_type": "single",
            "nodes": [
                {
                    "id": "main",
                    "name": "main",
                    "node_type": "llm",
                    "model_provider": config.get("model_provider", "mistral"),
                    "model_name": config.get("model_name", "mistral-large-latest"),
                    "system_prompt": system_prompt,
                    "tools": [
                        {"name": t, "reason": "user-configured"}
                        for t in tools_list
                    ],
                    "temperature": config.get("temperature", 0.7),
                    "max_tokens": config.get("max_tokens", 4096),
                }
            ],
            "edges": [],
            "entry_point": "main",
            "knowledge_bases": [],
            "max_iterations": 5,
        }
        logger.info(
            "⚙️  No blueprint found for '%s' — using fallback single-node graph", aid
        )

    try:
        blueprint = GeneratedBlueprint.model_validate(bp_data)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse assistant blueprint: {e}",
        )

    graph = compile_blueprint(blueprint)
    _compiled_graphs[aid] = graph
    logger.info("✅ Compiled graph for assistant '%s' (%s)", aid, assistant.name)
    return graph


# ── POST /agent/{assistant_id}/chat ──────────────────────────────────


@agent_chat_router.post("/{assistant_id}/chat", response_model=AgentChatResponse)
async def chat_with_agent(
    assistant_id: str,
    req: AgentChatRequest,
    session: AsyncSession = Depends(get_session),
    user_id: str = Header("system", alias="X-User-Id"),
):
    """Send a message to a built agent and get a response.

    - If ``thread_id`` is provided, continues the conversation.
    - If omitted, a new thread is created.

    The agent's blueprint is compiled into a LangGraph and executed.
    Multi-turn context is maintained via the thread's message history.
    """
    assistant = await _get_assistant_or_404(assistant_id, session)
    graph = _compile_assistant(assistant)

    now = datetime.now(UTC)
    thread_id = req.thread_id
    is_new_thread = False

    # ── Thread management ────────────────────────────────────────────
    if thread_id:
        # Look up existing thread; create it with the given ID if it doesn't exist
        # (allows frontend to pass its own session UUID for consistent multi-turn context)
        thread = await session.get(ThreadORM, thread_id)
        if not thread:
            is_new_thread = True
            thread = ThreadORM(
                thread_id=thread_id,
                status="active",
                metadata_json={
                    "type": "agent_chat",
                    "assistant_id": assistant_id,
                    "assistant_name": assistant.name,
                },
                user_id=user_id,
                created_at=now,
                updated_at=now,
            )
            session.add(thread)
            await session.commit()
            _agent_threads[thread_id] = []
            logger.info(
                "🆕 Created thread with client ID: %s (assistant=%s)",
                thread_id,
                assistant_id,
            )
    else:
        # Create a new thread
        thread_id = str(uuid4())
        is_new_thread = True
        thread = ThreadORM(
            thread_id=thread_id,
            status="active",
            metadata_json={
                "type": "agent_chat",
                "assistant_id": assistant_id,
                "assistant_name": assistant.name,
            },
            user_id=user_id,
            created_at=now,
            updated_at=now,
        )
        session.add(thread)
        await session.commit()
        _agent_threads[thread_id] = []
        logger.info(
            "🆕 New agent chat thread: %s (assistant=%s)", thread_id, assistant_id
        )

    # ── Build message history ────────────────────────────────────────
    if thread_id not in _agent_threads:
        _agent_threads[thread_id] = []

    history = _agent_threads[thread_id]
    history.append(HumanMessage(content=req.message))

    # ── Run the graph ────────────────────────────────────────────────
    run_id = str(uuid4())
    logger.info("=" * 60)
    logger.info("💬 AGENT CHAT")
    logger.info("   Assistant: %s (%s)", assistant_id, assistant.name)
    logger.info("   Thread:    %s (new=%s)", thread_id, is_new_thread)
    logger.info("   Run:       %s", run_id)
    logger.info("   Message:   %s", req.message[:300])
    logger.info("=" * 60)

    try:
        initial_state: CompiledAgentState = {
            "messages": list(history),
            "research_data": [],
            "current_node": "",
            "iteration": 0,
            "final_answer": "",
        }

        # Run graph to completion
        last_state = initial_state.copy()
        async for event in graph.astream(initial_state, stream_mode="updates"):
            for node_name, node_output in event.items():
                for k, v in node_output.items():
                    if k in last_state:
                        last_state[k] = v

        # Extract the agent's response (last AI message)
        agent_response = ""
        for m in reversed(last_state.get("messages", [])):
            if isinstance(m, AIMessage):
                agent_response = m.content
                break

        # Update history with agent response
        if agent_response:
            history.append(AIMessage(content=agent_response))

        # Extract tools used
        tools_used = []
        config = assistant.config or {}
        bp_data = config.get("blueprint", {})
        for node in bp_data.get("nodes", []):
            if node.get("node_type") == "tool":
                for t in node.get("tools", []):
                    tname = t.get("name", t) if isinstance(t, dict) else t
                    if tname not in tools_used:
                        tools_used.append(tname)

        # ── Save run to DB ───────────────────────────────────────────
        run = RunORM(
            run_id=run_id,
            thread_id=thread_id,
            assistant_id=assistant_id,
            status="completed",
            input={"message": req.message},
            output={"response": agent_response[:2000]},
            user_id=user_id,
            created_at=now,
            updated_at=datetime.now(UTC),
        )
        session.add(run)

        # Update thread
        thread_obj = await session.get(ThreadORM, thread_id)
        if thread_obj:
            thread_obj.status = "active"
            thread_obj.updated_at = datetime.now(UTC)
            thread_obj.metadata_json = {
                **(thread_obj.metadata_json or {}),
                "last_run_id": run_id,
                "message_count": len(history),
            }

        await session.commit()

        # Build conversation messages for response
        conv_messages = []
        for m in last_state.get("messages", []):
            if isinstance(m, HumanMessage):
                conv_messages.append(AgentChatMessage(role="human", content=m.content))
            elif isinstance(m, AIMessage):
                conv_messages.append(AgentChatMessage(role="ai", content=m.content))

        logger.info(
            "✅ Agent chat complete: thread=%s response=%d chars iterations=%d",
            thread_id,
            len(agent_response),
            last_state.get("iteration", 0),
        )

        return AgentChatResponse(
            assistant_id=assistant_id,
            thread_id=thread_id,
            run_id=run_id,
            message=agent_response,
            messages=conv_messages,
            tools_used=tools_used,
            iterations=last_state.get("iteration", 0),
            status="completed",
        )

    except Exception as e:
        logger.error("❌ Agent chat failed: %s\n%s", e, traceback.format_exc())
        raise HTTPException(status_code=500, detail=f"Agent execution failed: {e}")


# ── GET /agent/{assistant_id}/threads ────────────────────────────────


@agent_chat_router.get("/{assistant_id}/threads")
async def list_agent_threads(
    assistant_id: str,
    session: AsyncSession = Depends(get_session),
):
    """List all chat threads for a given assistant."""
    # Verify assistant exists
    await _get_assistant_or_404(assistant_id, session)

    result = await session.execute(
        select(ThreadORM)
        .where(ThreadORM.metadata_json["assistant_id"].astext == assistant_id)
        .order_by(ThreadORM.updated_at.desc())
    )
    threads = result.scalars().all()

    return {
        "assistant_id": assistant_id,
        "threads": [
            {
                "thread_id": t.thread_id,
                "status": t.status,
                "message_count": (t.metadata_json or {}).get("message_count", 0),
                "created_at": t.created_at.isoformat() if t.created_at else None,
                "updated_at": t.updated_at.isoformat() if t.updated_at else None,
            }
            for t in threads
        ],
    }


# ── GET /agent/{assistant_id}/thread/{thread_id} ─────────────────────


@agent_chat_router.get("/{assistant_id}/thread/{thread_id}")
async def get_agent_thread_messages(
    assistant_id: str,
    thread_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Get all messages in a specific agent chat thread."""
    await _get_assistant_or_404(assistant_id, session)

    thread = await session.get(ThreadORM, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail=f"Thread '{thread_id}' not found")

    # Return from memory cache if available
    if thread_id in _agent_threads:
        messages = []
        for m in _agent_threads[thread_id]:
            if isinstance(m, HumanMessage):
                messages.append({"role": "human", "content": m.content})
            elif isinstance(m, AIMessage):
                messages.append({"role": "ai", "content": m.content})
        return {
            "assistant_id": assistant_id,
            "thread_id": thread_id,
            "messages": messages,
        }

    # Fallback: get runs for this thread
    result = await session.execute(
        select(RunORM)
        .where(RunORM.thread_id == thread_id)
        .order_by(RunORM.created_at.asc())
    )
    runs = result.scalars().all()

    messages = []
    for run in runs:
        inp = run.input or {}
        out = run.output or {}
        if inp.get("message"):
            messages.append({"role": "human", "content": inp["message"]})
        if out.get("response"):
            messages.append({"role": "ai", "content": out["response"]})

    return {
        "assistant_id": assistant_id,
        "thread_id": thread_id,
        "messages": messages,
    }
