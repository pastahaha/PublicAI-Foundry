"""Agent Orchestrator — the LangGraph agent that builds other agents.

Flow:
  1. CLARIFIER   — analyses the user's use-case description, asks follow-up
                    questions if anything is ambiguous
  2. RESEARCHER  — deep-researches what tools/nodes/knowledge-bases would best
                    serve the use-case
  3. PLANNER     — generates a full GeneratedBlueprint JSON
  4. REVIEWER    — self-critiques the blueprint; if gaps → loops back to planner
  5. FINALISER   — emits the approved blueprint

The orchestrator runs as a streaming LangGraph so the frontend can show
progress via SSE.
"""

from __future__ import annotations

import json
import logging
from typing import Annotated, Any

from langchain_core.messages import AIMessage, BaseMessage, HumanMessage, SystemMessage
from langchain_core.language_models.chat_models import BaseChatModel
from langgraph.graph import END, StateGraph
from langgraph.graph.message import add_messages
from typing_extensions import TypedDict

import re as _re

from src.core.models.orchestrator import GeneratedBlueprint, OrchestratorPhase
from src.core.use_cases import (
    get_use_case,
    get_use_case_sources_prompt,
    get_use_case_sources_as_kb_configs,
)
from src.services.tool_catalogue import (
    get_all_tools_prompt,
    TOOL_NAMES,
    TOOL_REGISTRY,
)
from src.services.skill_catalogue import (
    get_all_skills_level1_prompt,
    SKILL_NAMES,
)

logger = logging.getLogger(__name__)


# ── JSON repair helper ───────────────────────────────────────────────


def _repair_json(raw: str) -> str:
    """Best-effort repair of malformed JSON from small LLMs.

    Handles:
      - markdown code fences (```json ... ```)
      - trailing commas before } or ]
      - single-quoted strings
      - truncated JSON (missing closing braces/brackets)
      - leading/trailing whitespace or text around the JSON
    """
    text = raw.strip()

    # 1. Strip markdown fences
    text = _re.sub(r"^```(?:json)?\s*", "", text, flags=_re.MULTILINE)
    text = _re.sub(r"```\s*$", "", text, flags=_re.MULTILINE)
    text = text.strip()

    # 2. Extract the first JSON object if there's preamble text
    first_brace = text.find("{")
    if first_brace > 0:
        text = text[first_brace:]

    # 3. Remove trailing commas before } or ]
    text = _re.sub(r",\s*([}\]])", r"\1", text)

    # 4. Fix truncated JSON — balance braces/brackets
    open_braces = text.count("{") - text.count("}")
    open_brackets = text.count("[") - text.count("]")
    if open_braces > 0 or open_brackets > 0:
        # Try to close any open strings first
        # Count unescaped quotes
        in_string = False
        for ch in text:
            if ch == '"' and (
                not in_string or text[max(0, text.index(ch) - 1)] != "\\"
            ):
                in_string = not in_string
        if in_string:
            text += '"'
        text += "]" * max(0, open_brackets)
        text += "}" * max(0, open_braces)

    return text


def _build_fallback_blueprint(state: dict) -> str:
    """Build a minimal valid blueprint when the LLM output is completely unparseable.

    Uses the user_request to create a simple single-node agent with sensible defaults.
    """
    user_request = state.get("user_request", "General assistant")
    # Derive a name from the request
    name_words = user_request.split()[:4]
    name = " ".join(w.capitalize() for w in name_words) + " Agent"

    bp = {
        "name": name,
        "description": user_request,
        "goal": user_request,
        "agent_type": "single",
        "nodes": [
            {
                "id": "node_1",
                "name": "Main Agent Node",
                "node_type": "llm",
                "model_provider": "mistral",
                "model_name": "mistral-large-latest",
                "system_prompt": f"You are an expert assistant. Your goal: {user_request}. Use the available tools to research, analyse, and respond to the user's questions thoroughly.",
                "tools": [
                    {
                        "name": "web_search",
                        "reason": "Search the web for relevant information",
                    },
                    {
                        "name": "summarize_text",
                        "reason": "Summarize findings into clear responses",
                    },
                    {
                        "name": "document_explainer",
                        "reason": "Explain complex documents and regulations",
                    },
                ],
                "skills": [
                    {
                        "id": "deep_research",
                        "reason": "Thorough multi-source research with verification",
                    },
                    {
                        "id": "step_by_step_guidance",
                        "reason": "Clear step-by-step guidance for the user",
                    },
                ],
                "temperature": 0.5,
                "max_tokens": 4096,
            }
        ],
        "edges": [
            {
                "source": "node_1",
                "target": "__end__",
                "edge_type": "direct",
                "condition": None,
            }
        ],
        "entry_point": "node_1",
        "knowledge_bases": [],
        "max_iterations": 25,
    }
    return json.dumps(bp)


DEFAULT_PROVIDER = "mistral"
DEFAULT_MODEL = "mistral-large-latest"
MAX_REVIEW_LOOPS = 3


# ── LLM factory ─────────────────────────────────────────────────────


def _build_llm(
    provider: str,
    model: str,
    temperature: float = 0.3,
    json_mode: bool = True,
) -> BaseChatModel:
    """Build an LLM instance from provider + model name.

    Supports:
      - 'ollama'  → ChatOllama  (local, default)
      - 'mistral' → ChatMistralAI (cloud)
    """
    fmt = "json" if json_mode else None

    if provider == "ollama":
        from langchain_ollama import ChatOllama
        import os

        return ChatOllama(
            model=model,
            temperature=temperature,
            format=fmt,
            base_url=os.getenv("OLLAMA_BASE_URL", "http://localhost:11434"),
        )

    # Default: mistral (cloud)
    from langchain_mistralai import ChatMistralAI

    return ChatMistralAI(
        model=model,
        temperature=temperature,
    )


# ── State ────────────────────────────────────────────────────────────


def _last(a: Any, b: Any) -> Any:
    return b


class OrchestratorState(TypedDict):
    messages: Annotated[list[BaseMessage], add_messages]
    user_request: Annotated[str, _last]
    model_provider: Annotated[str, _last]
    model_name: Annotated[str, _last]
    use_case: Annotated[str, _last]
    skip_clarification: Annotated[bool, _last]
    phase: Annotated[str, _last]
    clarification_questions: Annotated[list[str], _last]
    research_notes: Annotated[str, _last]
    blueprint_json: Annotated[str, _last]
    review_feedback: Annotated[str, _last]
    review_loop: Annotated[int, _last]
    is_approved: Annotated[bool, _last]
    final_blueprint: Annotated[str, _last]


# ── Prompt builders (scoped to use-case) ─────────────────────────────
#
# The old static f-string prompts embedded ``get_tools_prompt()`` at
# module load time, which meant every use-case saw the same generic
# tool list.  Now each prompt is built per-invocation so we can inject
# only the tools and context relevant to the selected use-case.


def _build_clarifier_prompt(use_case_id: str | None) -> str:
    """Build the clarifier system prompt, optionally scoped to a use-case."""
    uc = get_use_case(use_case_id) if use_case_id else None
    domain_hint = ""
    sources_hint = ""
    if uc:
        domain_hint = (
            f"\n\nDOMAIN CONTEXT — {uc.name} ({uc.region}):\n"
            f"{uc.system_context}\n"
            f"\nSuggested knowledge-base topics for this domain:\n"
            + "\n".join(f"  • {t}" for t in uc.suggested_kb_topics)
        )
        # Let the clarifier know about curated sources
        sources_prompt = get_use_case_sources_prompt(use_case_id)
        if sources_prompt:
            num_sources = sum(len(cat.sources) for cat in uc.reference_sources)
            sources_hint = (
                f"\n\nIMPORTANT: This use-case has {num_sources} pre-curated authoritative "
                f"reference sources (government websites, service directories, etc.) that "
                f"will be AUTOMATICALLY included in the agent's knowledge base. You do NOT "
                f"need to ask the user about data sources or URLs — they are already provided."
            )

    return f"""\
You are an expert AI agent architect. The user wants to build a custom AI agent.
Your job is to understand their use-case quickly and efficiently.
{domain_hint}{sources_hint}

IMPORTANT PRINCIPLES:
- Users of this platform are often NON-TECHNICAL (community workers, social workers,
  public servants). Keep questions simple and jargon-free.
- Be EFFICIENT — don't ask questions whose answers are already obvious from context.
- If the user selected a use-case template (shown in DOMAIN CONTEXT above), you
  ALREADY know the domain, region (NSW), target audience, and reference sources.
  DO NOT re-ask about these.
- Use the conversation history to avoid repeating questions the user already answered.

Given the user's description, do ONE of the following:

A) If the user's message gives you enough to build a good agent (they described
   the purpose, or they selected a use-case template), respond with ONLY this JSON:
   {{"status": "clear", "summary": "<one-paragraph summary of what you'll build>"}}

B) If critical information is genuinely missing AND cannot be inferred from the
   use-case template or conversation history, ask AT MOST 1-2 SHORT questions.
   Respond with ONLY this JSON:
   {{"status": "needs_clarification", "questions": ["question 1"], "partial_summary": "<what you understand so far>"}}

WHEN TO SKIP CLARIFICATION (respond "clear" immediately):
- User selected a use-case template (healthcare, legal_aid, crisis_support, housing_crisis)
- User's message is detailed (> 30 words describing what the agent should do)
- User said something like "build me a healthcare agent" — the template provides all context
- The domain context above already covers the audience, region, and knowledge sources

WHEN TO ASK (max 1-2 questions):
- User typed something very vague like "build me an agent" with no template selected
- User described a custom agent outside the 4 templates and you need to know the specific domain

QUESTION GUIDELINES (only if needed):
- Keep questions SHORT and conversational (1 sentence each)
- Ask about what's MISSING, not what's already obvious
- Suggest answers in the question: "Should this focus on X or Y?"
- Maximum 2 questions. Never ask 3 or more.

CRITICAL RULES:
- If DOMAIN CONTEXT is present above, the user selected a template — go straight to "clear".
- If the conversation shows you already asked questions AND the user answered,
  respond with "clear" and incorporate their answers.
- Return ONLY valid JSON, no markdown, no explanation.
"""


def _build_researcher_prompt(use_case_id: str | None) -> str:
    """Build the researcher system prompt with ALL universal tools and skills."""
    tools_text = get_all_tools_prompt()
    skills_text = get_all_skills_level1_prompt()

    uc = get_use_case(use_case_id) if use_case_id else None
    domain_hint = ""
    sources_section = ""
    if uc:
        domain_hint = (
            f"\n\nDOMAIN CONTEXT — {uc.name} ({uc.region}):\n" f"{uc.system_context}\n"
        )
        sources_text = get_use_case_sources_prompt(use_case_id)
        if sources_text:
            sources_section = (
                f"\n{sources_text}\n"
                f"IMPORTANT: These pre-curated sources MUST be included in the agent's "
                f"knowledge_bases. They are authoritative government and service URLs "
                f"verified for this domain. Recommend them in your research output.\n"
            )

    return f"""\
You are an AI agent architect researching the best approach to build a custom agent.
{domain_hint}
You have these 12 UNIVERSAL TOOLS available to wire into agent graphs.
ALL tools are available to ALL use-cases — pick the ones that best fit this task:

{tools_text}

You also have these SKILLS — reusable capability modules that give agents
specialised behaviour patterns.  Skills inject expert instructions into agent
nodes so they perform tasks with higher accuracy:

{skills_text}
{sources_section}
IMPORTANT RULES:
- You MUST ONLY recommend tools from the 12 listed above.
- The valid tool names are: {TOOL_NAMES}
- The valid skill IDs are: {SKILL_NAMES}
- Do NOT invent tools or skills that are not in these lists.
- For EVERY tool you recommend, provide a REASON explaining why it is needed.
- For EVERY skill you recommend, provide a REASON explaining why it is relevant.

Given the user's use-case summary, determine:
1. Which tools from the catalogue should be included (and WHY each one)
2. Which skills should be attached to each node (and WHY each one)
3. What kind of graph topology is best (single LLM, multi-step pipeline, research loop, etc.)
4. Whether knowledge bases / RAG are needed
5. What system prompts each node should have

Respond with ONLY valid JSON:
{{
  "recommended_tools": [
    {{"name": "tool_name_1", "reason": "Why this tool is needed for this task"}},
    {{"name": "tool_name_2", "reason": "Why this tool is needed for this task"}}
  ],
  "recommended_skills": [
    {{"id": "skill_id_1", "reason": "Why this skill is relevant for this agent"}},
    {{"id": "skill_id_2", "reason": "Why this skill is relevant for this agent"}}
  ],
  "topology": "single | pipeline | research_loop | multi_agent",
  "needs_knowledge_base": true/false,
  "knowledge_base_suggestions": ["description of KB 1", ...],
  "node_suggestions": [
    {{"id": "node_id", "name": "Node Name", "type": "llm|tool|aggregator", "purpose": "what it does", "tools": [{{"name": "tool1", "reason": "why"}}], "skills": [{{"id": "skill1", "reason": "why"}}], "system_prompt_hint": "brief prompt idea"}}
  ],
  "edge_suggestions": [
    {{"source": "node_a", "target": "node_b", "type": "direct|conditional", "condition": "optional condition"}}
  ],
  "reasoning": "Explain your architecture decisions including skill selections"
}}
"""


def _build_planner_prompt(use_case_id: str | None) -> str:
    """Build the planner system prompt — all 12 tools available, must justify each."""

    uc = get_use_case(use_case_id) if use_case_id else None
    domain_hint = ""
    use_case_field = ""
    sources_section = ""
    if uc:
        domain_hint = (
            f"\n\nDOMAIN: {uc.name} ({uc.region})\n"
            f"DOMAIN CONTEXT: {uc.system_context}\n"
        )
        use_case_field = f'  "use_case": "{uc.id}",'
        sources_text = get_use_case_sources_prompt(use_case_id)
        if sources_text:
            sources_section = (
                f"\n{sources_text}\n"
                f"CRITICAL: You MUST include ALL of these pre-curated reference sources "
                f"in the blueprint's knowledge_bases array. Each source should be a "
                f"knowledge_base entry with source_type: \"url\" and the URL as source_value.\n"
            )

    return f"""\
You are an AI agent blueprint generator.
Given research notes, generate a JSON blueprint for an AI agent.
{domain_hint}
AVAILABLE TOOL NAMES (pick from these ONLY):
{list(TOOL_REGISTRY.keys())}

AVAILABLE SKILL IDs (attach relevant ones to nodes):
{SKILL_NAMES}

Skills are reusable capability modules that inject expert instructions into
agent nodes.  When a skill is attached to a node, the agent follows the
skill's patterns when handling relevant requests — improving accuracy.

RULES:
1. Return ONLY valid JSON — no markdown, no explanation, no code fences.
2. Every node MUST have at least 1 tool from the list above.
3. Every node SHOULD have at least 1 skill if a relevant one exists.
4. Use simple node IDs like "node_1", "node_2".
5. Keep it simple: 1-3 nodes is usually enough.
6. The "tools" array uses objects: {{"name": "tool_name", "reason": "why"}}.
7. The "skills" array uses objects: {{"id": "skill_id", "reason": "why"}}.
8. The "entry_point" must match a node's "id".
9. Edge sources/targets must be valid node IDs or "__end__".
10. Edge targets must ONLY be node IDs (node_1, node_2, …) or "__end__".
    NEVER use tool names as edge targets.
11. The FIRST node (entry_point) should be a general-purpose conversational
    node that greets the user, understands their intent, and routes or
    responds directly.  Think of it as the "main" node the user always
    talks to.  It should have tools like web_search and summarize_text
    so it can answer general questions on its own.

HERE IS A COMPLETE EXAMPLE of a valid blueprint:
{{
  "name": "Tax Helper Agent",
  "description": "Helps users understand tax regulations and file taxes",
  "goal": "Help the user with tax-related questions",
{use_case_field}
  "agent_type": "single",
  "nodes": [
    {{
      "id": "node_1",
      "name": "Tax Research Node",
      "node_type": "llm",
      "model_provider": "mistral",
      "model_name": "mistral-large-latest",
      "system_prompt": "You are a tax expert. Research tax regulations and provide clear guidance.",
      "tools": [
        {{"name": "web_search", "reason": "Search for current tax laws and regulations"}},
        {{"name": "summarize_text", "reason": "Summarize complex tax documents for the user"}},
        {{"name": "document_explainer", "reason": "Explain tax forms and legal documents"}}
      ],
      "skills": [
        {{"id": "deep_research", "reason": "Ensure thorough multi-source tax research"}},
        {{"id": "document_analysis", "reason": "Explain complex tax documents in plain language"}}
      ],
      "temperature": 0.3,
      "max_tokens": 4096
    }}
  ],
  "edges": [
    {{"source": "node_1", "target": "__end__", "edge_type": "direct", "condition": null}}
  ],
  "entry_point": "node_1",
  "knowledge_bases": [],
  "max_iterations": 25
}}

NOW generate a blueprint for the user's use-case following this EXACT format.
Replace the example values with values appropriate for the user's request.
IMPORTANT: Every node MUST have a "skills" array with at least 1-2 relevant skills.
Pick skills that match the node's purpose from the available skill IDs.
Make sure every node also has relevant tools from the available tool names.
{sources_section}
"""


REVIEWER_SYSTEM = """\
You are a quality reviewer for AI agent blueprints. You will receive a blueprint JSON.
Evaluate it briefly:

1. Does the blueprint have at least one node? (required)
2. Does each node have at least one tool? (required)
3. Does the entry_point match a node id? (required)
4. Does the blueprint have a name and description? (required)
5. Is the entry_point node a general conversational node that can greet the
   user and handle basic questions? (required — the first node should NOT
   be a narrow specialist; it should be the main conversational node)
6. Do edges only target node IDs or "__end__"? (required — edge targets
   must NEVER be tool names like "hotline_directory" or "human_review")
7. Do nodes have relevant skills attached? (nice-to-have, not required)

If checks 1-6 pass, approve it. Do NOT reject for stylistic reasons.
Small, simple blueprints with 1-2 nodes are perfectly fine.
If skills are missing but would be beneficial, note it as a suggestion but still approve.

Respond with ONLY valid JSON:
{
  "score": <1-10>,
  "is_approved": true/false,
  "strengths": ["strength 1"],
  "weaknesses": ["weakness 1"],
  "suggested_fixes": ["fix 1"],
  "reasoning": "Brief assessment"
}

Set is_approved to true if the 6 required checks pass. A score of 6+ should be approved.
"""


# ── Node functions ───────────────────────────────────────────────────


async def clarifier_node(state: OrchestratorState) -> dict[str, Any]:
    """Analyse user request; ask clarifying questions or confirm understanding."""
    logger.info("=" * 60)
    logger.info("🎯 CLARIFIER — Understanding user's use-case")
    logger.info("=" * 60)

    # ── Skip clarification if requested ──────────────────────────────
    if state.get("skip_clarification", False):
        logger.info("  ⏩ skip_clarification=True — proceeding directly to research")
        return {
            "messages": [
                AIMessage(
                    content=f"Skipping clarification. Building agent for: {state['user_request'][:200]}"
                )
            ],
            "phase": OrchestratorPhase.RESEARCHING.value,
            "clarification_questions": [],
        }

    provider = state.get("model_provider", DEFAULT_PROVIDER)
    model = state.get("model_name", DEFAULT_MODEL)
    use_case = state.get("use_case", "")
    logger.info("  🤖 Using: %s/%s  (use_case=%s)", provider, model, use_case or "none")
    logger.info("  📥 User request: %s", state["user_request"][:500])
    llm = _build_llm(provider, model, temperature=0.3)

    # Build conversation-aware prompt messages.
    # If there's prior conversation history (user answered earlier questions),
    # include it so the clarifier can see the full Q&A exchange.
    existing_messages = state.get("messages", [])
    prompt_messages: list = [SystemMessage(content=_build_clarifier_prompt(use_case))]

    if len(existing_messages) > 1:
        # We have a conversation history — include it for context
        # so the clarifier sees the user's answers to previous questions
        prompt_messages.extend(existing_messages)
    else:
        # First turn — just the user's request
        prompt_messages.append(
            HumanMessage(content=f"User's request:\n{state['user_request']}")
        )

    response = await llm.ainvoke(prompt_messages)

    try:
        data = json.loads(_repair_json(response.content))
    except json.JSONDecodeError:
        data = {"status": "clear", "summary": state["user_request"]}

    status = data.get("status", "clear")
    logger.info("  Status: %s", status)
    logger.info("  📤 CLARIFIER RAW OUTPUT:")
    logger.info("  %s", json.dumps(data, indent=2))

    if status == "needs_clarification":
        questions = data.get("questions", [])
        partial = data.get("partial_summary", "")
        logger.info("  ❓ Questions: %s", questions)

        # Format a friendly response asking the questions
        q_text = "\n".join(f"{i+1}. {q}" for i, q in enumerate(questions))
        assistant_msg = (
            f"I understand you want to build: {partial}\n\n"
            f"Before I design the agent, I have a few questions:\n{q_text}\n\n"
            f"Please answer these so I can build the perfect agent for you."
        )

        return {
            "messages": [AIMessage(content=assistant_msg)],
            "phase": OrchestratorPhase.CLARIFYING.value,
            "clarification_questions": questions,
        }
    else:
        summary = data.get("summary", state["user_request"])
        logger.info("  ✅ Use-case clear: %s", summary[:200])

        return {
            "messages": [
                AIMessage(
                    content=f"Got it! I'll now research the best approach for: {summary}"
                )
            ],
            "phase": OrchestratorPhase.RESEARCHING.value,
            "user_request": summary,  # update with refined summary
            "clarification_questions": [],
        }


async def researcher_node(state: OrchestratorState) -> dict[str, Any]:
    """Deep-research what tools, topology, and KBs are best for the use-case."""
    logger.info("=" * 60)
    logger.info("🔬 RESEARCHER — Designing agent architecture")
    logger.info("=" * 60)

    provider = state.get("model_provider", DEFAULT_PROVIDER)
    model = state.get("model_name", DEFAULT_MODEL)
    use_case = state.get("use_case", "")
    logger.info("  🤖 Using: %s/%s  (use_case=%s)", provider, model, use_case or "none")
    llm = _build_llm(provider, model, temperature=0.4)
    response = await llm.ainvoke(
        [
            SystemMessage(content=_build_researcher_prompt(use_case)),
            HumanMessage(
                content=f"Build an agent for this use-case:\n{state['user_request']}"
            ),
        ]
    )

    logger.info("  📋 Research notes: %d chars", len(response.content))
    logger.info("  📤 RESEARCHER RAW OUTPUT:")
    logger.info("  %s", response.content)

    return {
        "messages": [
            AIMessage(
                content="I've researched the best architecture. Now generating the blueprint..."
            )
        ],
        "research_notes": response.content,
        "phase": OrchestratorPhase.PLANNING.value,
    }


async def planner_node(state: OrchestratorState) -> dict[str, Any]:
    """Generate the full GeneratedBlueprint JSON."""
    logger.info("=" * 60)
    logger.info("📐 PLANNER — Generating agent blueprint")
    logger.info("=" * 60)

    provider = state.get("model_provider", DEFAULT_PROVIDER)
    model = state.get("model_name", DEFAULT_MODEL)
    use_case = state.get("use_case", "")
    logger.info("  🤖 Using: %s/%s  (use_case=%s)", provider, model, use_case or "none")
    llm = _build_llm(provider, model, temperature=0.3)

    # Include previous review feedback if this is a re-plan
    extra_context = ""
    if state.get("review_feedback"):
        logger.info(
            "  🔁 Re-planning with feedback: %s", state["review_feedback"][:300]
        )
        extra_context = f"\n\nPREVIOUS REVIEW FEEDBACK (fix these issues):\n{state['review_feedback']}"

    response = await llm.ainvoke(
        [
            SystemMessage(content=_build_planner_prompt(use_case)),
            HumanMessage(
                content=(
                    f"User's use-case: {state['user_request']}\n\n"
                    f"Architecture research:\n{state.get('research_notes', 'No research available')}"
                    f"{extra_context}"
                )
            ),
        ]
    )

    logger.info("  📄 Blueprint generated: %d chars", len(response.content))
    logger.info("  📤 PLANNER RAW OUTPUT:")
    logger.info("  %s", response.content)

    # ── Repair JSON before passing to reviewer ───────────────────────
    repaired = _repair_json(response.content)
    try:
        # Validate it actually parses
        bp_test = json.loads(repaired)

        # Auto-inject tools from research notes if nodes have empty tools
        for node in bp_test.get("nodes", []):
            if not node.get("tools"):
                logger.warning(
                    "  ⚠️ Node '%s' has no tools — injecting defaults from catalogue",
                    node.get("id"),
                )
                node["tools"] = [
                    {
                        "name": "web_search",
                        "reason": "General information retrieval for the user's query",
                    },
                    {
                        "name": "summarize_text",
                        "reason": "Summarize findings into clear responses",
                    },
                ]

        repaired = json.dumps(bp_test)
        logger.info("  ✅ JSON parsed successfully after repair")
    except json.JSONDecodeError as e:
        logger.warning("  ⚠️ JSON still invalid after repair: %s", e)
        # Last resort: build a minimal valid blueprint from what we know
        repaired = _build_fallback_blueprint(state)
        logger.info("  🔧 Using fallback blueprint")

    return {
        "messages": [
            AIMessage(content="Blueprint generated. Now reviewing for quality...")
        ],
        "blueprint_json": repaired,
        "phase": OrchestratorPhase.REVIEWING.value,
    }


async def reviewer_node(state: OrchestratorState) -> dict[str, Any]:
    """Self-critique the blueprint. Approve or send back for revision."""
    logger.info("=" * 60)
    logger.info(
        "🔍 REVIEWER — Quality check (loop %d/%d)",
        state.get("review_loop", 0) + 1,
        MAX_REVIEW_LOOPS,
    )
    logger.info("=" * 60)

    provider = state.get("model_provider", DEFAULT_PROVIDER)
    model = state.get("model_name", DEFAULT_MODEL)
    use_case = state.get("use_case", "")
    logger.info("  🤖 Using: %s/%s  (use_case=%s)", provider, model, use_case or "none")
    logger.info(
        "  📥 Blueprint being reviewed: %s", state.get("blueprint_json", "{}")[:500]
    )
    llm = _build_llm(provider, model, temperature=0.2)

    # Add tool-validation context — validate against universal tool catalogue
    tool_context = f"\n\nVALID TOOLS (universal catalogue of 12): {TOOL_NAMES}\nFlag any tools used in the blueprint that are NOT in this list as a weakness.\nAlso check that every tool in the blueprint has a 'reason' field explaining why it was selected."

    response = await llm.ainvoke(
        [
            SystemMessage(content=REVIEWER_SYSTEM),
            HumanMessage(
                content=(
                    f"User's goal: {state['user_request']}\n\n"
                    f"Blueprint to review:\n{state.get('blueprint_json', '{}')}"
                    f"{tool_context}"
                )
            ),
        ]
    )

    try:
        review = json.loads(_repair_json(response.content))
    except json.JSONDecodeError:
        review = {
            "score": 7,
            "is_approved": True,
            "strengths": [],
            "weaknesses": [],
            "suggested_fixes": [],
            "reasoning": "Parse error — auto-approving",
        }

    score = review.get("score", 5)
    approved = review.get("is_approved", False)
    loop = state.get("review_loop", 0) + 1

    logger.info("  📊 Score: %d/10 | Approved: %s", score, approved)
    logger.info("  📤 REVIEWER RAW OUTPUT:")
    logger.info("  %s", json.dumps(review, indent=2))
    if review.get("weaknesses"):
        for w in review["weaknesses"]:
            logger.info("    ⚠️ %s", w)

    # Force-approve after max loops
    if loop >= MAX_REVIEW_LOOPS and not approved:
        logger.info("  ⛔ Max review loops — force-approving")
        approved = True

    feedback_text = ""
    if not approved:
        fixes = review.get("suggested_fixes", [])
        feedback_text = f"Score: {score}/10\nWeaknesses: {review.get('weaknesses', [])}\nFixes needed: {fixes}"

    return {
        "messages": [
            AIMessage(content=f"Review: score={score}/10, approved={approved}")
        ],
        "review_feedback": feedback_text,
        "review_loop": loop,
        "is_approved": approved,
        "phase": (
            OrchestratorPhase.FINALISED.value
            if approved
            else OrchestratorPhase.PLANNING.value
        ),
    }


async def finaliser_node(state: OrchestratorState) -> dict[str, Any]:
    """Parse and validate the approved blueprint, return it to the user.

    Performs tool validation: strips any tool names that are not in the
    scoped use-case tool list.  If the blueprint includes knowledge_bases,
    the phase is set to ``kb_confirm`` so the controller can ask the user
    whether to create the KB now or later.
    """
    logger.info("=" * 60)
    logger.info("✅ FINALISER — Blueprint approved!")
    logger.info("=" * 60)

    blueprint_json = state.get("blueprint_json", "{}")
    use_case = state.get("use_case", "")

    # ── Repair JSON before parsing ───────────────────────────────────
    blueprint_json = _repair_json(blueprint_json)

    # ── Tool-name validation ─────────────────────────────────────────
    # Validate against the universal tool catalogue (all 12 tools)
    allowed_tools = set(TOOL_REGISTRY.keys())
    logger.info("  🔒 Allowed tools (universal catalogue): %s", allowed_tools)

    try:
        bp_data = json.loads(blueprint_json)

        # Inject use_case into blueprint data
        if use_case:
            bp_data["use_case"] = use_case

        # Validate & strip invalid tools from nodes
        # The LLM now returns tools as objects with {name, reason} or plain strings
        for node in bp_data.get("nodes", []):
            raw_tools = node.get("tools", [])
            validated_tools = []
            for t in raw_tools:
                # Handle both formats: {"name": "x", "reason": "y"} and "x"
                if isinstance(t, dict):
                    tool_name = t.get("name", "")
                    if tool_name in allowed_tools:
                        validated_tools.append(t)
                    else:
                        logger.warning(
                            "  ⚠️ Node '%s': removed invalid tool '%s'",
                            node.get("id"),
                            tool_name,
                        )
                elif isinstance(t, str):
                    if t in allowed_tools:
                        validated_tools.append(
                            {
                                "name": t,
                                "reason": "Auto-migrated — no reason provided by LLM",
                            }
                        )
                    else:
                        logger.warning(
                            "  ⚠️ Node '%s': removed invalid tool '%s'",
                            node.get("id"),
                            t,
                        )
            node["tools"] = validated_tools

        # ── Safety net: ensure entry_point node has basic conversational tools ──
        entry_id = bp_data.get("entry_point")
        _CONVERSATIONAL_TOOLS = {"web_search", "summarize_text"}
        for node in bp_data.get("nodes", []):
            if node.get("id") == entry_id:
                existing_tool_names = {
                    (t.get("name") if isinstance(t, dict) else t)
                    for t in node.get("tools", [])
                }
                for tool_name in _CONVERSATIONAL_TOOLS:
                    if tool_name not in existing_tool_names and tool_name in allowed_tools:
                        node["tools"].append({
                            "name": tool_name,
                            "reason": "Auto-injected: entry node must support general conversation",
                        })
                        logger.info(
                            "  🛡️ Injected '%s' into entry node '%s'",
                            tool_name, entry_id,
                        )
                break  # found the entry node, no need to keep looping

        # ── Repair knowledge_bases: LLM often outputs plain strings ──
        raw_kbs = bp_data.get("knowledge_bases", [])
        repaired_kbs = []
        for kb in raw_kbs:
            if isinstance(kb, str):
                # Convert bare string to a proper KnowledgeBaseConfig dict
                repaired_kbs.append({
                    "name": kb,
                    "description": kb,
                    "source_type": "url",
                    "source_value": "",
                    "chunk_size": 500,
                    "chunk_overlap": 50,
                })
                logger.info("  🔧 Repaired knowledge_base string → dict: '%s'", kb)
            elif isinstance(kb, dict):
                # Ensure required fields exist
                kb.setdefault("name", kb.get("description", "Unnamed KB"))
                kb.setdefault("description", kb.get("name", ""))
                kb.setdefault("source_type", "url")
                kb.setdefault("source_value", "")
                repaired_kbs.append(kb)
            # Skip anything else (None, numbers, etc.)

        # ── Auto-inject curated reference sources for use-case templates ──
        if use_case:
            curated_kbs = get_use_case_sources_as_kb_configs(use_case)
            if curated_kbs:
                # Collect existing source_values to avoid duplicates
                existing_urls = {
                    kb.get("source_value", "").rstrip("/").lower()
                    for kb in repaired_kbs
                    if kb.get("source_value")
                }
                injected = 0
                for ckb in curated_kbs:
                    url_normalised = ckb["source_value"].rstrip("/").lower()
                    if url_normalised not in existing_urls:
                        repaired_kbs.append(ckb)
                        existing_urls.add(url_normalised)
                        injected += 1
                logger.info(
                    "  📚 Injected %d curated reference sources for use-case '%s' "
                    "(%d total KBs)",
                    injected, use_case, len(repaired_kbs),
                )

        bp_data["knowledge_bases"] = repaired_kbs

        blueprint = GeneratedBlueprint.model_validate(bp_data)
        clean_json = blueprint.model_dump_json(indent=2)
    except Exception as e:
        logger.error("  ❌ Blueprint validation failed: %s", e)
        # Use fallback blueprint instead of passing broken JSON
        logger.info("  🔧 Building fallback blueprint")
        fallback_json = _build_fallback_blueprint(state)
        try:
            blueprint = GeneratedBlueprint.model_validate(json.loads(fallback_json))
            clean_json = blueprint.model_dump_json(indent=2)
        except Exception:
            clean_json = fallback_json

    logger.info("  📤 FINALISER — APPROVED BLUEPRINT:")
    logger.info("  %s", clean_json)

    # Check if blueprint has knowledge bases
    needs_kb = False
    kb_descriptions: list[str] = []
    try:
        bp = json.loads(clean_json)
        for kb in bp.get("knowledge_bases", []):
            needs_kb = True
            kb_descriptions.append(
                f"  • {kb.get('name', 'Unnamed')}: {kb.get('description', '')}"
            )
    except Exception:
        pass

    # Build a nice user-facing summary
    try:
        bp = json.loads(clean_json)
        node_list = "\n".join(
            f"  • {n['name']} ({n['node_type']})" for n in bp.get("nodes", [])
        )
        tool_set: dict[str, str] = {}
        for n in bp.get("nodes", []):
            for t in n.get("tools", []):
                if isinstance(t, dict):
                    tool_set[t.get("name", "")] = t.get("reason", "")
                elif isinstance(t, str):
                    tool_set[t] = ""

        tool_lines = []
        for tname, treason in tool_set.items():
            if treason:
                tool_lines.append(f"  • **{tname}** — {treason}")
            else:
                tool_lines.append(f"  • **{tname}**")

        summary = (
            f"🎉 **Your agent is ready!**\n\n"
            f"**Name:** {bp.get('name', 'Unnamed Agent')}\n"
            f"**Description:** {bp.get('description', '')}\n"
            f"**Type:** {bp.get('agent_type', 'single')}\n\n"
            f"**Nodes:**\n{node_list}\n\n"
            f"**Tools (with justification):**\n"
            + ("\n".join(tool_lines) if tool_lines else "None")
            + "\n\n"
        )

        if needs_kb:
            kb_count = len(kb_descriptions)
            # Show a compact summary instead of listing every URL
            if kb_count > 8:
                kb_preview = "\n".join(kb_descriptions[:5])
                summary += (
                    f"**📚 Knowledge Base: {kb_count} reference sources included**\n"
                    f"{kb_preview}\n"
                    f"  • ... and {kb_count - 5} more authoritative sources\n\n"
                    f"These are pre-curated government and service URLs for this domain. "
                    f"Would you like me to save the agent with all these sources?\n"
                    f"- Reply **yes** or **save** to save the agent\n"
                    f"- Reply **no** or **later** to skip for now"
                )
            else:
                kb_text = "\n".join(kb_descriptions)
                summary += (
                    f"**📚 Knowledge Base: {kb_count} reference sources**\n{kb_text}\n\n"
                    f"Would you like to create the knowledge base now?\n"
                    f"- Reply **yes** to create it and upload documents\n"
                    f"- Reply **no** or **later** to skip for now\n"
                    f"- Reply **save** to just save the agent without a knowledge base"
                )
        else:
            summary += (
                "The agent has been designed and is ready to be saved. "
                "Would you like me to save it as an assistant?"
            )
    except Exception:
        summary = "Your agent blueprint is ready! Would you like me to save it?"

    # Set phase based on whether KB is needed
    phase = (
        OrchestratorPhase.KB_CONFIRM.value
        if needs_kb
        else OrchestratorPhase.FINALISED.value
    )

    return {
        "messages": [AIMessage(content=summary)],
        "final_blueprint": clean_json,
        "phase": phase,
    }


# ── Router ───────────────────────────────────────────────────────────


def after_clarifier(state: OrchestratorState) -> str:
    """Route after clarifier: if questions were asked, stop (wait for user). Else research."""
    if state.get("clarification_questions"):
        return END  # wait for user to answer
    return "researcher"


def after_reviewer(state: OrchestratorState) -> str:
    """Route after reviewer: approved → finaliser, else → back to planner."""
    if state.get("is_approved"):
        return "finaliser"
    return "planner"


# ── Build the graph ──────────────────────────────────────────────────


def build_orchestrator_graph():
    """Build and compile the orchestrator LangGraph."""
    logger.info("🏗️  Building Orchestrator Agent graph")

    graph = StateGraph(OrchestratorState)

    graph.add_node("clarifier", clarifier_node)
    graph.add_node("researcher", researcher_node)
    graph.add_node("planner", planner_node)
    graph.add_node("reviewer", reviewer_node)
    graph.add_node("finaliser", finaliser_node)

    graph.set_entry_point("clarifier")

    # clarifier → END (if questions) or → researcher (if clear)
    graph.add_conditional_edges(
        "clarifier",
        after_clarifier,
        {
            END: END,
            "researcher": "researcher",
        },
    )

    # researcher → planner
    graph.add_edge("researcher", "planner")

    # planner → reviewer
    graph.add_edge("planner", "reviewer")

    # reviewer → finaliser (approved) or → planner (revise)
    graph.add_conditional_edges(
        "reviewer",
        after_reviewer,
        {
            "finaliser": "finaliser",
            "planner": "planner",
        },
    )

    # finaliser → END
    graph.add_edge("finaliser", END)

    compiled = graph.compile()
    logger.info(
        "  ✅ Orchestrator compiled: clarifier → researcher → planner ⇄ reviewer → finaliser"
    )
    return compiled
