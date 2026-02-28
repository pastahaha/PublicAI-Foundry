"""Blueprint Compiler — takes a GeneratedBlueprint and produces a runnable LangGraph.

This is the engine that the orchestrator's output feeds into.
It reads the blueprint JSON, creates LangGraph nodes for each NodeBlueprint,
wires edges (including conditional routing), and returns a compiled graph.

Architecture:
  Every compiled agent gets an automatic **brain node** — an LLM that acts as
  the conversational core.  It reads the user's message, the agent's system
  prompt, any prior tool results, and produces a human-readable response.
  Tool nodes are invoked by the brain when the blueprint wires them in, and
  their results are fed back so the brain can incorporate them.
"""

from __future__ import annotations

import logging
from typing import Annotated, Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

from src.core.models.orchestrator import (
    GeneratedBlueprint,
    NodeBlueprint,
)
from src.services.tool_catalogue import TOOL_REGISTRY

logger = logging.getLogger(__name__)


# ── Reducers ─────────────────────────────────────────────────────────


def _last_str(a: str, b: str) -> str:
    return b


def _last_int(a: int, b: int) -> int:
    return b


def _merge_lists(a: list[str], b: list[str]) -> list[str]:
    return a + b


# ── State ────────────────────────────────────────────────────────────


class CompiledAgentState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    research_data: Annotated[list[str], _merge_lists]
    current_node: Annotated[str, _last_str]
    iteration: Annotated[int, _last_int]
    final_answer: Annotated[str, _last_str]


# ── LLM factory ──────────────────────────────────────────────────────


def _build_llm(provider: str, model: str, temperature: float = 0.7):
    """Build an LLM instance.  Supports mistral and ollama."""
    if provider == "ollama":
        from langchain_ollama import ChatOllama

        return ChatOllama(model=model, temperature=temperature)

    # Default: mistral (cloud)
    from langchain_mistralai import ChatMistralAI

    return ChatMistralAI(model=model, temperature=temperature)


# ── Helpers ──────────────────────────────────────────────────────────


def _get_last_user_content(state: CompiledAgentState) -> str:
    """Extract the latest meaningful content from the message history.

    Walks backwards through messages to find the most recent
    HumanMessage (user input) or AIMessage (prior output).
    """
    for m in reversed(state.get("messages", [])):
        if isinstance(m, HumanMessage) and m.content.strip():
            return m.content.strip()
    # Fallback: last AI message
    for m in reversed(state.get("messages", [])):
        if isinstance(m, AIMessage) and m.content.strip():
            return m.content.strip()
    return ""


# ── Node factories ───────────────────────────────────────────────────


def _make_llm_node(spec: NodeBlueprint):
    """Create an LLM node that has a conversational exchange."""

    async def _node(state: CompiledAgentState) -> dict[str, Any]:
        iteration = state.get("iteration", 0) + 1
        logger.info("  🔄 [%s] LLM node executing (iteration %d)", spec.id, iteration)

        llm = _build_llm(spec.model_provider, spec.model_name, spec.temperature)
        msgs: list[BaseMessage] = []
        if spec.system_prompt:
            msgs.append(SystemMessage(content=spec.system_prompt))
        msgs.extend(state["messages"])

        response = await llm.ainvoke(msgs)
        logger.info("  ✅ [%s] %d chars", spec.id, len(response.content))

        return {
            "messages": [response],
            "current_node": spec.id,
            "iteration": iteration,
        }

    _node.__name__ = spec.id
    return _node


def _make_tool_node(spec: NodeBlueprint):
    """Create a tool node that executes tools and returns results."""

    async def _node(state: CompiledAgentState) -> dict[str, Any]:
        iteration = state.get("iteration", 0) + 1
        tool_names = spec.tool_names
        logger.info(
            "  🔧 [%s] Tool node executing (%d tools)", spec.id, len(tool_names)
        )
        results: list[str] = []

        # Get input — prefer user message, fall back to last AI message
        input_content = _get_last_user_content(state)

        for tool_name in tool_names:
            fn = TOOL_REGISTRY.get(tool_name)
            if fn is None:
                results.append(f"[Tool '{tool_name}' not found in catalogue]")
                continue
            try:
                if tool_name == "web_search":
                    result = await fn(query=input_content)
                elif tool_name == "summarize_text":
                    result = await fn(text=input_content)
                elif tool_name == "scrape_url":
                    result = await fn(url=input_content)
                elif tool_name == "retrieval_query":
                    result = await fn(query=input_content)
                elif tool_name == "service_locator":
                    result = await fn(service_type=input_content, location="")
                elif tool_name == "eligibility_checker":
                    result = await fn(program="", user_info={})
                elif tool_name == "rights_lookup":
                    result = await fn(topic=input_content)
                elif tool_name == "crisis_classifier":
                    result = await fn(message=input_content)
                elif tool_name == "document_explainer":
                    result = await fn(document_text=input_content)
                elif tool_name == "safety_planner":
                    result = await fn(situation=input_content)
                elif tool_name == "hotline_directory":
                    result = await fn(category=input_content)
                elif tool_name == "human_review":
                    result = await fn(case_summary=input_content)
                else:
                    result = await fn()
                results.append(result)
                logger.info("    ✅ Tool '%s' → %d chars", tool_name, len(str(result)))
            except Exception as e:
                logger.error("    ❌ Tool '%s' failed: %s", tool_name, e)
                results.append(f"[Tool {tool_name} error: {e}]")

        combined = "\n---\n".join(str(r) for r in results)
        return {
            "messages": [AIMessage(content=f"Tool results:\n{combined}")],
            "research_data": [str(r) for r in results],
            "current_node": spec.id,
            "iteration": iteration,
        }

    _node.__name__ = spec.id
    return _node


def _make_aggregator_node(spec: NodeBlueprint):
    async def _node(state: CompiledAgentState) -> dict[str, Any]:
        iteration = state.get("iteration", 0) + 1
        data = state.get("research_data", [])
        logger.info("  📊 [%s] Aggregating %d items", spec.id, len(data))
        summary = "\n\n".join(data) if data else "No data collected."
        return {
            "messages": [AIMessage(content=f"Aggregated:\n{summary}")],
            "current_node": spec.id,
            "iteration": iteration,
        }

    _node.__name__ = spec.id
    return _node


_NODE_FACTORIES = {
    "llm": _make_llm_node,
    "tool": _make_tool_node,
    "aggregator": _make_aggregator_node,
}


# ── Brain node — the conversational core ─────────────────────────────


def _make_brain_node(blueprint: GeneratedBlueprint):
    """Create the 'brain' LLM node that wraps every agent.

    The brain:
      1. Reads the user's message and any tool results from earlier nodes
      2. Uses the agent's description + goal as its system prompt
      3. Produces a natural-language response for the user

    This ensures every agent is conversational, even if the blueprint
    only has tool nodes.
    """
    # Pick model from the first LLM node, or fallback to defaults
    model_provider = "mistral"
    model_name = "mistral-large-latest"
    temperature = 0.7
    for node in blueprint.nodes:
        if node.node_type == "llm":
            model_provider = node.model_provider
            model_name = node.model_name
            temperature = node.temperature
            break
        # Even tool nodes have model info
        model_provider = node.model_provider
        model_name = node.model_name

    # Collect all tool descriptions for the system prompt
    all_tools = set()
    for node in blueprint.nodes:
        for t in node.tool_names:
            all_tools.add(t)

    tool_hint = ""
    if all_tools:
        tool_hint = (
            "\n\nYou have access to results from these tools: "
            + ", ".join(sorted(all_tools))
            + ". Tool results (if any) will appear in the conversation as prior messages. "
            "Use them to inform your response."
        )

    system_prompt = (
        f"You are **{blueprint.name}**.\n"
        f"{blueprint.description}\n\n"
        f"Your goal: {blueprint.goal}\n"
        f"{tool_hint}\n\n"
        "INSTRUCTIONS:\n"
        "- Respond naturally and helpfully to the user's message.\n"
        "- If tool results are available in the conversation, incorporate them.\n"
        "- If you don't have enough information, say so honestly.\n"
        "- Be concise but thorough.\n"
        "- Do NOT output raw JSON or tool calls — respond in plain language."
    )

    async def _brain(state: CompiledAgentState) -> dict[str, Any]:
        iteration = state.get("iteration", 0) + 1
        logger.info("  🧠 [brain] Generating response (iteration %d)", iteration)

        llm = _build_llm(model_provider, model_name, temperature)
        msgs: list[BaseMessage] = [SystemMessage(content=system_prompt)]
        msgs.extend(state["messages"])

        # Mistral requires the last message to be user/tool role, not assistant.
        # When a prior LLM node has already run, its AIMessage is the last entry.
        # Append a synthetic user turn so the API call is valid.
        if msgs and isinstance(msgs[-1], AIMessage):
            msgs.append(
                HumanMessage(
                    content="Based on the above context and research, provide your final response to the user."
                )
            )

        response = await llm.ainvoke(msgs)
        logger.info("  ✅ [brain] %d chars", len(response.content))

        return {
            "messages": [response],
            "current_node": "brain",
            "iteration": iteration,
            "final_answer": response.content,
        }

    _brain.__name__ = "brain"
    return _brain


# ── Conditional router ───────────────────────────────────────────────


def _make_router(blueprint: GeneratedBlueprint, source_id: str):
    cond_edges = [
        e
        for e in blueprint.edges
        if e.source == source_id and e.edge_type == "conditional"
    ]
    direct_edges = [
        e for e in blueprint.edges if e.source == source_id and e.edge_type == "direct"
    ]
    fallback = direct_edges[0].target if direct_edges else END

    target_map: dict[str, str] = {e.target: (e.condition or "") for e in cond_edges}

    async def router(state: CompiledAgentState) -> str:
        iteration = state.get("iteration", 0)
        research = state.get("research_data", [])

        if iteration >= blueprint.max_iterations:
            return fallback

        for target, condition in target_map.items():
            cl = condition.lower()
            if any(
                k in cl for k in ("enough", "sufficient", "complete", "done", "ready")
            ):
                if len(research) >= 2 or iteration >= 3:
                    return target
            elif any(k in cl for k in ("more", "need", "continue", "again")):
                if len(research) < 2 and iteration < 3:
                    return target

        return fallback

    path_map = {t: t for t in target_map}
    path_map[fallback] = fallback
    return router, path_map


# ── Main compiler ────────────────────────────────────────────────────


def compile_blueprint(blueprint: GeneratedBlueprint) -> Any:
    """Compile a GeneratedBlueprint into a runnable LangGraph.

    The compiled graph always follows this pattern:

      [blueprint nodes] → brain → END

    The **brain** is an auto-injected LLM node that acts as the
    conversational core.  It reads the user's message, any tool results
    from prior nodes, and produces a natural-language response.

    This means even if the blueprint only has tool nodes, the agent
    will still respond conversationally.
    """
    logger.info(
        "🏗️  Compiling blueprint: %s (%d nodes, %d edges)",
        blueprint.name,
        len(blueprint.nodes),
        len(blueprint.edges),
    )

    graph = StateGraph(CompiledAgentState)

    # 1. Add blueprint nodes
    node_ids = set()
    for node_spec in blueprint.nodes:
        factory = _NODE_FACTORIES.get(node_spec.node_type)
        if factory is None:
            logger.warning(
                "  ⚠️ Unknown node type '%s' for '%s'", node_spec.node_type, node_spec.id
            )
            continue
        graph.add_node(node_spec.id, factory(node_spec))
        node_ids.add(node_spec.id)
        logger.info(
            "  ✅ Node: [%s] %s (type=%s, tools=%s)",
            node_spec.id,
            node_spec.name,
            node_spec.node_type,
            node_spec.tool_names,
        )

    # 2. Add the brain node (always present)
    graph.add_node("brain", _make_brain_node(blueprint))
    logger.info("  🧠 Brain node added")

    # 3. Entry point
    entry = blueprint.entry_point or (
        blueprint.nodes[0].id if blueprint.nodes else None
    )
    if entry and entry in node_ids:
        graph.set_entry_point(entry)
    elif node_ids:
        graph.set_entry_point(list(node_ids)[0])
    else:
        # No blueprint nodes at all — just the brain
        graph.set_entry_point("brain")

    # 4. Wire blueprint edges
    cond_sources = {e.source for e in blueprint.edges if e.edge_type == "conditional"}

    for edge in blueprint.edges:
        if edge.source in cond_sources:
            continue
        if edge.edge_type == "direct":
            target = edge.target
            if target == "__end__":
                target = "brain"  # Redirect END → brain so we always get a response
            if target in node_ids or target == "brain":
                graph.add_edge(edge.source, target)

    for source_id in cond_sources:
        router, path_map = _make_router(blueprint, source_id)
        # Rewrite any __end__ targets to brain
        path_map = {k: ("brain" if v == END else v) for k, v in path_map.items()}
        graph.add_conditional_edges(source_id, router, path_map)

    # 5. Terminal nodes → brain (instead of END)
    all_sources = {e.source for e in blueprint.edges}
    terminal = node_ids - all_sources
    for nid in terminal:
        if nid != "brain":
            graph.add_edge(nid, "brain")

    # 6. Brain → END
    graph.add_edge("brain", END)

    compiled = graph.compile()
    logger.info(
        "✅ Blueprint compiled: %s (entry=%s → ... → brain → END)",
        blueprint.name,
        entry,
    )
    return compiled
