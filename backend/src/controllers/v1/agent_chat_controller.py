"""Agent Chat Controller — chat with a built agent using its assistant_id.

Once a blueprint is saved as an assistant (via POST /orchestrator/save),
use these endpoints to start a conversation with the compiled agent.

Endpoints:
  POST /agent/{assistant_id}/chat    — Send a message and get a response
  GET  /agent/{assistant_id}/threads — List threads for an assistant
  GET  /agent/{assistant_id}/thread/{thread_id} — Get thread messages
  GET  /agent/{assistant_id}/blueprint — Get the agent's blueprint graph for visualization
"""

from __future__ import annotations

import asyncio
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
    KnowledgeBase as KnowledgeBaseORM,
    get_session,
)
from src.services.blueprint_compiler import compile_blueprint, CompiledAgentState
from src.services.skill_catalogue import SKILL_REGISTRY

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
    greeting: str = Field("", description="Greeting message for new threads")
    messages: List[AgentChatMessage] = Field(
        default_factory=list,
        description="Full conversation history for this run",
    )
    tools_used: List[str] = Field(
        default_factory=list,
        description="Tools invoked during this run",
    )
    skills_used: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Skills active during this run",
    )
    tool_events: List[Dict[str, Any]] = Field(
        default_factory=list,
        description="Detailed tool execution events from this run",
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


async def _generate_greeting(assistant: AssistantORM) -> str:
    """Generate a greeting message for a new chat session with this agent."""
    config = assistant.config or {}
    bp_data = config.get("blueprint", {})
    name = assistant.name or "Agent"
    description = assistant.description or bp_data.get("description", "")
    use_case = bp_data.get("use_case", "")
    goal = bp_data.get("goal", "")

    # Build a short context string for the LLM
    context_parts = [f"Agent name: {name}"]
    if description:
        context_parts.append(f"Description: {description}")
    if use_case:
        context_parts.append(f"Use case domain: {use_case}")
    if goal:
        context_parts.append(f"Goal: {goal}")
    context = "\n".join(context_parts)

    try:
        from langchain_mistralai import ChatMistralAI
        from langchain_core.messages import SystemMessage, HumanMessage as HMsg

        llm = ChatMistralAI(model="mistral-small-latest", temperature=0.7)
        response = await llm.ainvoke([
            SystemMessage(content=(
                "You are generating a warm, concise greeting for an AI agent. "
                "The greeting should:\n"
                "- Introduce the agent by name\n"
                "- Briefly mention what it can help with\n"
                "- End with a friendly 'How can I help you today?' type question\n"
                "- Be 2-3 sentences maximum\n"
                "- Use a friendly, professional tone\n"
                "- Use one relevant emoji\n"
                "Output ONLY the greeting message, nothing else."
            )),
            HMsg(content=context),
        ])
        greeting = response.content.strip()
        logger.info("👋 Generated greeting for '%s': %s", name, greeting[:100])
        return greeting
    except Exception as e:
        logger.error("❌ Greeting generation failed: %s — using fallback", e)
        if description:
            return f"Hi! I'm **{name}** — {description}. How can I help you today? 👋"
        return f"Hi! I'm **{name}**. How can I help you today? 👋"


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

    # ── Generate greeting for new threads ────────────────────────────
    greeting = ""
    greeting_task = None
    if is_new_thread:
        # Fire off greeting generation concurrently — don't block graph execution
        greeting_task = asyncio.create_task(_generate_greeting(assistant))

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

        # Run graph to completion — track tool node executions
        last_state = initial_state.copy()
        tool_events: List[Dict[str, Any]] = []

        async for event in graph.astream(initial_state, stream_mode="updates"):
            for node_name, node_output in event.items():
                for k, v in node_output.items():
                    if k in last_state:
                        last_state[k] = v
                # Detect tool node execution by checking for tool results in messages
                node_messages = node_output.get("messages", [])
                for m in node_messages:
                    if isinstance(m, AIMessage) and m.content.startswith("Tool results:"):
                        # Parse out which tools ran from the tool results prefix
                        tool_events.append({
                            "node": node_name,
                            "type": "tool_execution",
                            "status": "completed",
                        })

        # Extract the agent's response (last AI message, skip tool results)
        agent_response = ""
        for m in reversed(last_state.get("messages", [])):
            if isinstance(m, AIMessage) and not m.content.startswith("Tool results:"):
                agent_response = m.content
                break

        # Update history with agent response
        if agent_response:
            history.append(AIMessage(content=agent_response))

        # Extract tools used — combine static config + runtime events
        tools_used = []
        config = assistant.config or {}
        bp_data = config.get("blueprint", {})
        for node in bp_data.get("nodes", []):
            if node.get("node_type") == "tool":
                for t in node.get("tools", []):
                    tname = t.get("name", t) if isinstance(t, dict) else t
                    if tname not in tools_used:
                        tools_used.append(tname)

        # Build detailed tool events from blueprint tool nodes that were visited
        visited_tool_nodes = {te["node"] for te in tool_events}
        detailed_tool_events: List[Dict[str, Any]] = []
        for node in bp_data.get("nodes", []):
            if node.get("node_type") == "tool" and node["id"] in visited_tool_nodes:
                for t in node.get("tools", []):
                    tname = t.get("name", t) if isinstance(t, dict) else t
                    detailed_tool_events.append({
                        "tool": tname,
                        "node": node["id"],
                        "status": "completed",
                    })

        # ── Extract skills used ──────────────────────────────────────
        skills_used: List[Dict[str, Any]] = []
        for node in bp_data.get("nodes", []):
            for s in node.get("skills", []):
                sid = s.get("id", s) if isinstance(s, dict) else s
                if sid and sid not in [su["id"] for su in skills_used]:
                    skill_meta = SKILL_REGISTRY.get(sid)
                    skills_used.append({
                        "id": sid,
                        "name": skill_meta.name if skill_meta else sid,
                        "category": skill_meta.category if skill_meta else "unknown",
                        "node": node.get("id", ""),
                        "reason": s.get("reason", "") if isinstance(s, dict) else "",
                    })

        # ── Save run to DB ───────────────────────────────────────────
        run = RunORM(
            run_id=run_id,
            thread_id=thread_id,
            assistant_id=assistant_id,
            status="completed",
            input={"message": req.message},
            output={
                "response": agent_response[:2000],
                "tools_used": tools_used,
                "skills_used": skills_used,
                "tool_events": detailed_tool_events,
                "iterations": last_state.get("iteration", 0),
                "response_length": len(agent_response),
            },
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

        # Await greeting if it was started concurrently
        if greeting_task is not None:
            try:
                greeting = await greeting_task
            except Exception as e:
                logger.error("❌ Greeting generation failed: %s", e)
                greeting = ""

        logger.info(
            "✅ Agent chat complete: thread=%s response=%d chars iterations=%d tools=%d",
            thread_id,
            len(agent_response),
            last_state.get("iteration", 0),
            len(detailed_tool_events),
        )

        return AgentChatResponse(
            assistant_id=assistant_id,
            thread_id=thread_id,
            run_id=run_id,
            message=agent_response,
            greeting=greeting,
            messages=conv_messages,
            tools_used=tools_used,
            skills_used=skills_used,
            tool_events=detailed_tool_events,
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


# ── GET /agent/{assistant_id}/blueprint ──────────────────────────────

# Icon / color mapping for node types
_NODE_TYPE_META = {
    "llm": {"icon": "Brain", "color": "indigo"},
    "tool": {"icon": "Wrench", "color": "amber"},
    "aggregator": {"icon": "BarChart3", "color": "cyan"},
    "human_review": {"icon": "UserCheck", "color": "rose"},
}

# Icon / color mapping for tools
_TOOL_META = {
    "web_search": {"icon": "Search", "color": "blue"},
    "scrape_url": {"icon": "Globe", "color": "emerald"},
    "summarize_text": {"icon": "FileText", "color": "violet"},
    "document_explainer": {"icon": "BookOpen", "color": "amber"},
    "retrieval_query": {"icon": "Database", "color": "cyan"},
    "eligibility_checker": {"icon": "ClipboardCheck", "color": "emerald"},
    "service_locator": {"icon": "MapPin", "color": "rose"},
    "rights_lookup": {"icon": "Scale", "color": "amber"},
    "crisis_classifier": {"icon": "AlertTriangle", "color": "red"},
    "safety_planner": {"icon": "Shield", "color": "emerald"},
    "hotline_directory": {"icon": "Phone", "color": "blue"},
    "human_review": {"icon": "UserCheck", "color": "rose"},
}


@agent_chat_router.get("/{assistant_id}/blueprint")
async def get_agent_blueprint(
    assistant_id: str,
    session: AsyncSession = Depends(get_session),
):
    """Return the agent's blueprint graph structure for visualization.

    Returns nodes, edges, metadata, and rendering hints so the frontend
    can display an interactive graph view of the agent's architecture.
    """
    assistant = await _get_assistant_or_404(assistant_id, session)
    config = assistant.config or {}
    metadata = assistant.metadata_json or {}
    bp_data = config.get("blueprint")

    # For form-built agents without an orchestrator blueprint, synthesize one
    if not bp_data:
        tools_list = config.get("tools", [])
        bp_data = {
            "name": assistant.name,
            "description": assistant.description or "",
            "goal": f"You are {assistant.name}. Be helpful and accurate.",
            "use_case": "general",
            "agent_type": "single",
            "nodes": [
                {
                    "id": "main",
                    "name": "Main LLM",
                    "node_type": "llm",
                    "model_provider": config.get("model_provider", "mistral"),
                    "model_name": config.get("model_name", "mistral-large-latest"),
                    "system_prompt": config.get("system_prompt", ""),
                    "tools": [{"name": t, "reason": "user-configured"} for t in tools_list],
                    "temperature": config.get("temperature", 0.7),
                    "max_tokens": config.get("max_tokens", 4096),
                }
            ],
            "edges": [],
            "entry_point": "main",
            "knowledge_bases": [],
            "max_iterations": 5,
        }

    try:
        blueprint = GeneratedBlueprint.model_validate(bp_data)
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to parse agent blueprint: {e}",
        )

    # Build visualization-friendly node list
    vis_nodes = []
    for node in blueprint.nodes:
        nt_meta = _NODE_TYPE_META.get(node.node_type, {"icon": "Box", "color": "gray"})
        tools_vis = []
        for t in node.tools:
            t_meta = _TOOL_META.get(t.name, {"icon": "Zap", "color": "gray"})
            tools_vis.append({
                "name": t.name,
                "reason": t.reason,
                "icon": t_meta["icon"],
                "color": t_meta["color"],
            })
        skills_vis = []
        for s in node.skills:
            skills_vis.append({
                "id": s.id,
                "reason": s.reason,
            })
        vis_nodes.append({
            "id": node.id,
            "name": node.name,
            "node_type": node.node_type,
            "icon": nt_meta["icon"],
            "color": nt_meta["color"],
            "model_provider": node.model_provider,
            "model_name": node.model_name,
            "temperature": node.temperature,
            "has_system_prompt": bool(node.system_prompt),
            "system_prompt_preview": (node.system_prompt or "")[:200],
            "tools": tools_vis,
            "skills": skills_vis,
        })

    # Always add the brain node
    vis_nodes.append({
        "id": "brain",
        "name": "Brain (Conversational Core)",
        "node_type": "brain",
        "icon": "Sparkles",
        "color": "violet",
        "model_provider": blueprint.nodes[0].model_provider if blueprint.nodes else "mistral",
        "model_name": blueprint.nodes[0].model_name if blueprint.nodes else "mistral-large-latest",
        "temperature": blueprint.nodes[0].temperature if blueprint.nodes else 0.7,
        "has_system_prompt": True,
        "system_prompt_preview": f"You are {blueprint.name}. {blueprint.description[:150]}",
        "tools": [],
        "skills": [],
    })

    # Build edges — include the auto-wired brain edges
    vis_edges = []
    node_ids = {n.id for n in blueprint.nodes}
    all_sources = set()

    for edge in blueprint.edges:
        target = edge.target
        if target == "__end__":
            target = "brain"
        vis_edges.append({
            "source": edge.source,
            "target": target,
            "edge_type": edge.edge_type,
            "condition": edge.condition,
        })
        all_sources.add(edge.source)

    # Terminal nodes → brain
    terminal = node_ids - all_sources
    for nid in terminal:
        vis_edges.append({
            "source": nid,
            "target": "brain",
            "edge_type": "direct",
            "condition": None,
        })

    # Brain → END
    vis_edges.append({
        "source": "brain",
        "target": "__end__",
        "edge_type": "direct",
        "condition": None,
    })

    # Knowledge bases
    kb_vis = []
    for kb in blueprint.knowledge_bases:
        kb_vis.append({
            "name": kb.name,
            "description": kb.description,
            "source_type": kb.source_type,
            "source_value": kb.source_value,
        })

    # Guardrails from metadata
    guardrails = metadata.get("guardrails", {})

    return {
        "assistant_id": assistant_id,
        "name": blueprint.name,
        "description": blueprint.description,
        "goal": blueprint.goal,
        "use_case": blueprint.use_case,
        "agent_type": blueprint.agent_type,
        "entry_point": blueprint.entry_point or (blueprint.nodes[0].id if blueprint.nodes else "brain"),
        "max_iterations": blueprint.max_iterations,
        "nodes": vis_nodes,
        "edges": vis_edges,
        "knowledge_bases": kb_vis,
        "guardrails": guardrails,
        "stats": {
            "total_nodes": len(vis_nodes),
            "llm_nodes": sum(1 for n in blueprint.nodes if n.node_type == "llm"),
            "tool_nodes": sum(1 for n in blueprint.nodes if n.node_type == "tool"),
            "total_tools": sum(len(n.tools) for n in blueprint.nodes),
            "total_skills": sum(len(n.skills) for n in blueprint.nodes),
            "total_edges": len(vis_edges),
        },
    }


# ── GET /agent/{assistant_id}/info — rich agent overview ─────────────


@agent_chat_router.get("/{assistant_id}/info")
async def get_agent_info(
    assistant_id: str,
    session: AsyncSession = Depends(get_session),
    user_id: str = Header("system", alias="X-User-Id"),
):
    """Return a rich overview of the agent: config, tools, skills, KB, stats."""
    assistant = await _get_assistant_or_404(assistant_id, session)
    config = assistant.config or {}
    metadata = assistant.metadata_json or {}
    bp_data = config.get("blueprint", {})

    # Parse tools with details
    tools_info: List[Dict[str, Any]] = []
    tool_reasons = config.get("tool_reasons", {})
    for t in config.get("tools", []):
        tools_info.append({
            "name": t,
            "reason": tool_reasons.get(t, ""),
        })

    # Parse skills from blueprint nodes
    skills_info: List[Dict[str, Any]] = []
    seen_skills: set = set()
    for node in bp_data.get("nodes", []):
        for s in node.get("skills", []):
            sid = s.get("id", s) if isinstance(s, dict) else s
            if sid and sid not in seen_skills:
                seen_skills.add(sid)
                skill_meta = SKILL_REGISTRY.get(sid)
                skills_info.append({
                    "id": sid,
                    "name": skill_meta.name if skill_meta else sid,
                    "description": skill_meta.description if skill_meta else "",
                    "category": skill_meta.category if skill_meta else "unknown",
                    "node": node.get("id", ""),
                    "reason": s.get("reason", "") if isinstance(s, dict) else "",
                })

    # Knowledge bases
    kb_info: List[Dict[str, Any]] = []
    kb_id = config.get("kb_id") or metadata.get("kb_id")
    if kb_id:
        kb_orm = await session.get(KnowledgeBaseORM, kb_id)
        if kb_orm:
            kb_info.append({
                "kb_id": kb_orm.kb_id,
                "name": kb_orm.name,
                "description": kb_orm.description,
                "status": kb_orm.status,
                "document_count": kb_orm.document_count,
            })

    # Session/run stats
    result = await session.execute(
        select(RunORM)
        .where(RunORM.assistant_id == assistant_id)
        .order_by(RunORM.created_at.desc())
    )
    runs = result.scalars().all()

    total_sessions = len({r.thread_id for r in runs})
    total_messages = len(runs)
    total_tool_executions = 0
    total_skill_activations = 0
    for r in runs:
        out = r.output or {}
        total_tool_executions += len(out.get("tool_events", []))
        total_skill_activations += len(out.get("skills_used", []))

    return {
        "assistant_id": assistant_id,
        "name": assistant.name,
        "description": assistant.description,
        "model_provider": config.get("model_provider", "mistral"),
        "model_name": config.get("model_name", "mistral-large-latest"),
        "agent_type": metadata.get("agent_type", bp_data.get("agent_type", "single")),
        "use_case": bp_data.get("use_case", "general"),
        "system_prompt_preview": (config.get("system_prompt", ""))[:300],
        "tools": tools_info,
        "skills": skills_info,
        "knowledge_bases": kb_info,
        "guardrails": metadata.get("guardrails", {}),
        "node_count": metadata.get("node_count", len(bp_data.get("nodes", []))),
        "edge_count": metadata.get("edge_count", len(bp_data.get("edges", []))),
        "created_at": assistant.created_at.isoformat() if assistant.created_at else None,
        "updated_at": assistant.updated_at.isoformat() if assistant.updated_at else None,
        "stats": {
            "total_sessions": total_sessions,
            "total_messages": total_messages,
            "total_tool_executions": total_tool_executions,
            "total_skill_activations": total_skill_activations,
        },
    }


# ── GET /agent/{assistant_id}/sessions — list sessions with analytics ────


@agent_chat_router.get("/{assistant_id}/sessions")
async def list_agent_sessions(
    assistant_id: str,
    session: AsyncSession = Depends(get_session),
    user_id: str = Header("system", alias="X-User-Id"),
):
    """List all chat sessions for an agent with per-session analytics."""
    await _get_assistant_or_404(assistant_id, session)

    # Get all runs for this assistant
    result = await session.execute(
        select(RunORM)
        .where(RunORM.assistant_id == assistant_id)
        .order_by(RunORM.created_at.asc())
    )
    runs = result.scalars().all()

    # Group runs by thread_id
    threads: Dict[str, List[RunORM]] = {}
    for r in runs:
        threads.setdefault(r.thread_id, []).append(r)

    sessions_out: List[Dict[str, Any]] = []
    for tid, thread_runs in threads.items():
        thread_runs.sort(key=lambda r: r.created_at)

        # Aggregate run-level analytics
        all_tools: List[str] = []
        all_skills: List[str] = []
        all_tool_events: List[Dict[str, Any]] = []
        total_iterations = 0
        total_response_chars = 0

        for r in thread_runs:
            out = r.output or {}
            all_tools.extend(out.get("tools_used", []))
            all_skills.extend([s.get("id", s) if isinstance(s, dict) else s for s in out.get("skills_used", [])])
            all_tool_events.extend(out.get("tool_events", []))
            total_iterations += out.get("iterations", 0)
            total_response_chars += out.get("response_length", 0)

        # Get thread metadata for title etc.
        thread_orm = await session.get(ThreadORM, tid)
        thread_meta = (thread_orm.metadata_json if thread_orm else {}) or {}

        sessions_out.append({
            "thread_id": tid,
            "message_count": len(thread_runs),
            "tools_used": list(set(all_tools)),
            "skills_used": list(set(all_skills)),
            "tool_executions": len(all_tool_events),
            "total_iterations": total_iterations,
            "total_response_chars": total_response_chars,
            "first_message": (thread_runs[0].input or {}).get("message", "")[:100] if thread_runs else "",
            "started_at": thread_runs[0].created_at.isoformat() if thread_runs else None,
            "last_active": thread_runs[-1].created_at.isoformat() if thread_runs else None,
            "assistant_name": thread_meta.get("assistant_name", ""),
        })

    # Sort by most recent first
    sessions_out.sort(key=lambda s: s.get("last_active", ""), reverse=True)

    return {
        "assistant_id": assistant_id,
        "total_sessions": len(sessions_out),
        "sessions": sessions_out,
    }


# ── GET /agent/{assistant_id}/session/{thread_id}/analysis ───────────


@agent_chat_router.get("/{assistant_id}/session/{thread_id}/analysis")
async def get_session_analysis(
    assistant_id: str,
    thread_id: str,
    session: AsyncSession = Depends(get_session),
    user_id: str = Header("system", alias="X-User-Id"),
):
    """Return a detailed analysis of a single session.

    Includes: conversation replay, tools/skills used, function execution
    timeline, LLM-generated summary, and quality metrics.
    """
    assistant = await _get_assistant_or_404(assistant_id, session)

    # Get all runs for this thread
    result = await session.execute(
        select(RunORM)
        .where(RunORM.thread_id == thread_id, RunORM.assistant_id == assistant_id)
        .order_by(RunORM.created_at.asc())
    )
    runs = result.scalars().all()
    if not runs:
        raise HTTPException(status_code=404, detail="No session data found for this thread")

    # Build conversation timeline
    conversation: List[Dict[str, Any]] = []
    all_tools: List[str] = []
    all_skills: List[Dict[str, Any]] = []
    all_tool_events: List[Dict[str, Any]] = []
    total_iterations = 0
    total_response_chars = 0
    run_timeline: List[Dict[str, Any]] = []

    for i, r in enumerate(runs):
        inp = r.input or {}
        out = r.output or {}

        user_msg = inp.get("message", "")
        agent_msg = out.get("response", "")
        run_tools = out.get("tools_used", [])
        run_skills = out.get("skills_used", [])
        run_tool_events = out.get("tool_events", [])
        run_iterations = out.get("iterations", 0)
        resp_len = out.get("response_length", len(agent_msg))

        all_tools.extend(run_tools)
        all_skills.extend(run_skills)
        all_tool_events.extend(run_tool_events)
        total_iterations += run_iterations
        total_response_chars += resp_len

        if user_msg:
            conversation.append({
                "role": "user",
                "content": user_msg,
                "timestamp": r.created_at.isoformat() if r.created_at else None,
            })
        if agent_msg:
            conversation.append({
                "role": "assistant",
                "content": agent_msg,
                "timestamp": r.updated_at.isoformat() if r.updated_at else None,
            })

        run_timeline.append({
            "run_id": r.run_id,
            "turn": i + 1,
            "user_message": user_msg[:200],
            "response_length": resp_len,
            "tools_used": run_tools,
            "skills_used": [s.get("id", s) if isinstance(s, dict) else s for s in run_skills],
            "tool_events": run_tool_events,
            "iterations": run_iterations,
            "status": r.status,
            "timestamp": r.created_at.isoformat() if r.created_at else None,
        })

    # Deduplicate
    unique_tools = list(set(all_tools))
    unique_skill_ids = list(set(
        s.get("id", s) if isinstance(s, dict) else s for s in all_skills
    ))
    enriched_skills = []
    for sid in unique_skill_ids:
        skill_meta = SKILL_REGISTRY.get(sid)
        enriched_skills.append({
            "id": sid,
            "name": skill_meta.name if skill_meta else sid,
            "category": skill_meta.category if skill_meta else "unknown",
            "description": skill_meta.description if skill_meta else "",
        })

    # Compute quality metrics heuristically
    avg_response_len = total_response_chars / len(runs) if runs else 0
    tool_usage_rate = len(all_tool_events) / len(runs) if runs else 0

    # Simple quality scores (0-100)
    responsiveness = min(100, int(avg_response_len / 20))  # Reward longer responses up to 2000 chars
    tool_utilization = min(100, int(tool_usage_rate * 50))  # Reward tool usage
    skill_coverage = min(100, int(len(unique_skill_ids) / max(1, len(SKILL_REGISTRY)) * 200))
    conversation_depth = min(100, int(len(runs) * 20))  # Reward multi-turn

    # Generate a summary using LLM (if enough conversation)
    summary = ""
    if len(conversation) >= 2:
        try:
            from langchain_mistralai import ChatMistralAI
            from langchain_core.messages import SystemMessage as SM, HumanMessage as HM

            conv_text = "\n".join(
                f"{'User' if c['role'] == 'user' else 'Agent'}: {c['content'][:300]}"
                for c in conversation[:20]  # Cap at 20 turns
            )
            llm = ChatMistralAI(model="mistral-small-latest", temperature=0.3)
            response = await llm.ainvoke([
                SM(content=(
                    "You are analysing a conversation between a user and an AI agent. "
                    "Provide a brief 2-3 sentence summary of:\n"
                    "1. What the user needed\n"
                    "2. How well the agent handled it\n"
                    "3. Overall quality assessment\n"
                    "Be concise and specific. Output ONLY the summary."
                )),
                HM(content=f"Agent: {assistant.name}\n\nConversation:\n{conv_text}"),
            ])
            summary = response.content.strip()
        except Exception as e:
            logger.error("❌ Session summary generation failed: %s", e)
            summary = f"Session with {len(runs)} exchanges. Tools used: {', '.join(unique_tools) or 'none'}."

    duration_seconds = None
    if runs and runs[0].created_at and runs[-1].created_at:
        duration_seconds = int((runs[-1].created_at - runs[0].created_at).total_seconds())

    return {
        "assistant_id": assistant_id,
        "assistant_name": assistant.name,
        "thread_id": thread_id,
        "summary": summary,
        "conversation": conversation,
        "run_timeline": run_timeline,
        "tools_used": unique_tools,
        "skills_used": enriched_skills,
        "tool_events": all_tool_events,
        "metrics": {
            "total_turns": len(runs),
            "total_iterations": total_iterations,
            "total_response_chars": total_response_chars,
            "avg_response_length": int(avg_response_len),
            "tool_executions": len(all_tool_events),
            "duration_seconds": duration_seconds,
        },
        "scores": {
            "responsiveness": responsiveness,
            "tool_utilization": tool_utilization,
            "skill_coverage": skill_coverage,
            "conversation_depth": conversation_depth,
            "overall": int((responsiveness + tool_utilization + skill_coverage + conversation_depth) / 4),
        },
        "started_at": runs[0].created_at.isoformat() if runs else None,
        "ended_at": runs[-1].created_at.isoformat() if runs else None,
    }
