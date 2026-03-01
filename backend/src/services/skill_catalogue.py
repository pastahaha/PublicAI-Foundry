"""Skill Catalogue — reusable, composable capability modules for AI agents.

Skills follow a 3-level progressive disclosure pattern:
  Level 1 (Metadata)  — name + description, always visible in prompts
  Level 2 (Body)       — full instructions, loaded when a skill is selected
  Level 3 (Resources)  — optional scripts, references, examples (on-demand)

The orchestrator's researcher and planner see Level 1 metadata for all
skills and can recommend them.  When a skill is wired into an agent node,
its Level 2 instructions are injected into the node's system prompt at
compile time.

Built-in skills ship with the platform.  Users can create custom skills
via the API (stored in the ``skills`` DB table).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


# ── Skill descriptor ────────────────────────────────────────────────


@dataclass
class SkillDescriptor:
    """A reusable capability module that can be attached to agent nodes.

    Attributes:
        id:            Unique slug (e.g. "test_driven_development")
        name:          Human-readable name
        description:   Short summary (Level 1 — always in context)
        category:      Grouping (research, analysis, communication, ...)
        when_to_use:   Conditions under which this skill is relevant
        instructions:  Full detailed instructions (Level 2 — loaded on demand)
        critical_patterns:  Key patterns the agent MUST follow
        examples:      Example prompts / outputs (Level 3)
        resources:     External references, URLs, scripts (Level 3)
        compatible_tools:   Tool names this skill works well with
        tags:          Searchable tags
    """

    id: str
    name: str
    description: str
    category: str = "general"
    when_to_use: str = ""
    instructions: str = ""
    critical_patterns: List[str] = field(default_factory=list)
    examples: List[str] = field(default_factory=list)
    resources: List[str] = field(default_factory=list)
    compatible_tools: List[str] = field(default_factory=list)
    tags: List[str] = field(default_factory=list)

    @property
    def level1_prompt(self) -> str:
        """Level 1: metadata-only — always in context."""
        return f"  • {self.name} — {self.description}"

    @property
    def level2_prompt(self) -> str:
        """Level 2: full instructions — injected into system prompt when selected."""
        parts = [
            f"## SKILL: {self.name}",
            f"{self.description}\n",
        ]
        if self.when_to_use:
            parts.append(f"### When to Use\n{self.when_to_use}\n")
        if self.instructions:
            parts.append(f"### Instructions\n{self.instructions}\n")
        if self.critical_patterns:
            parts.append("### Critical Patterns")
            for p in self.critical_patterns:
                parts.append(f"- {p}")
            parts.append("")
        if self.examples:
            parts.append("### Examples")
            for ex in self.examples:
                parts.append(f"- {ex}")
            parts.append("")
        return "\n".join(parts)

    @property
    def level3_resources(self) -> str:
        """Level 3: external references — loaded on-demand."""
        if not self.resources:
            return ""
        parts = [f"### Resources for '{self.name}'"]
        for r in self.resources:
            parts.append(f"- {r}")
        return "\n".join(parts)

    def to_dict(self) -> Dict:
        """JSON-serialisable representation."""
        return {
            "id": self.id,
            "name": self.name,
            "description": self.description,
            "category": self.category,
            "when_to_use": self.when_to_use,
            "instructions": self.instructions,
            "critical_patterns": self.critical_patterns,
            "examples": self.examples,
            "resources": self.resources,
            "compatible_tools": self.compatible_tools,
            "tags": self.tags,
        }


# ── Built-in Skills ────────────────────────────────────────────────


BUILT_IN_SKILLS: List[SkillDescriptor] = [
    # ── Research & Information Gathering ──────────────────────────
    SkillDescriptor(
        id="deep_research",
        name="Deep Research",
        description="Systematic multi-source research with verification and cross-referencing",
        category="research",
        when_to_use=(
            "When the user's task requires thorough research across multiple sources, "
            "fact-checking, or building a comprehensive understanding of a topic."
        ),
        instructions=(
            "1. Break the research topic into sub-questions.\n"
            "2. Search for information on each sub-question using web_search.\n"
            "3. Cross-reference findings across at least 2 sources.\n"
            "4. Flag any contradictions or outdated information.\n"
            "5. Synthesize findings into a structured summary with citations.\n"
            "6. Rate confidence level (high/medium/low) for each finding."
        ),
        critical_patterns=[
            "ALWAYS cite sources — never present information without attribution.",
            "Cross-reference claims across multiple sources before presenting as fact.",
            "Clearly distinguish between verified facts and unverified claims.",
            "Include dates for time-sensitive information (policies, regulations).",
            "If sources conflict, present both perspectives and note the disagreement.",
        ],
        examples=[
            "Research current NSW housing assistance programs and eligibility criteria",
            "Find and compare available mental health services in Western Sydney",
        ],
        compatible_tools=["web_search", "scrape_url", "summarize_text", "retrieval_query"],
        tags=["research", "verification", "fact-checking", "analysis"],
    ),
    SkillDescriptor(
        id="document_analysis",
        name="Document Analysis",
        description="Extract key information from complex documents, explain in plain language",
        category="analysis",
        when_to_use=(
            "When the user needs to understand a legal document, policy paper, medical report, "
            "government letter, lease agreement, or any complex written material."
        ),
        instructions=(
            "1. Identify the document type (legal, medical, government, financial).\n"
            "2. Extract the key facts: who, what, when, where, deadlines, obligations.\n"
            "3. Identify any actions required by the user and their deadlines.\n"
            "4. Translate jargon and legalese into plain language.\n"
            "5. Highlight any risks, penalties, or important conditions.\n"
            "6. Provide a clear summary with bullet-pointed action items."
        ),
        critical_patterns=[
            "NEVER provide legal or medical advice — explain, don't advise.",
            "Always recommend consulting a professional for critical decisions.",
            "Highlight ALL deadlines and time-sensitive items prominently.",
            "Use simple, accessible language (aim for grade 8 reading level).",
            "If the document is incomplete or unclear, say so explicitly.",
        ],
        examples=[
            "Explain this eviction notice in plain English",
            "What does this NDIS plan mean? What services am I approved for?",
        ],
        compatible_tools=["document_explainer", "summarize_text", "rights_lookup"],
        tags=["documents", "plain-language", "explanation", "legal", "medical"],
    ),

    # ── Assessment & Eligibility ─────────────────────────────────
    SkillDescriptor(
        id="eligibility_assessment",
        name="Eligibility Assessment",
        description="Assess eligibility for government programs, benefits, and support services",
        category="assessment",
        when_to_use=(
            "When the user wants to know if they qualify for a government program, benefit, "
            "grant, rebate, or support service."
        ),
        instructions=(
            "1. Identify which program(s) may be relevant to the user's situation.\n"
            "2. Ask for necessary details: income, household size, location, circumstances.\n"
            "3. Check eligibility criteria against the user's information.\n"
            "4. Explain the result clearly — eligible, not eligible, or possibly eligible.\n"
            "5. If eligible, provide next steps: how to apply, what documents are needed.\n"
            "6. If not eligible, suggest alternative programs they might qualify for.\n"
            "7. Always note that eligibility is indicative — final determination is by the agency."
        ),
        critical_patterns=[
            "ALWAYS caveat that this is an indicative assessment, not a guarantee.",
            "Never ask for sensitive info (TFN, Medicare number) — only general circumstances.",
            "If multiple programs exist, compare them and recommend the best fit.",
            "Include contact details for the relevant agency.",
            "Keep the assessment conversational and empathetic.",
        ],
        examples=[
            "Am I eligible for the first home buyer grant in NSW?",
            "Can I get Rent Assistance from Centrelink?",
        ],
        compatible_tools=["eligibility_checker", "web_search", "service_locator"],
        tags=["eligibility", "government", "benefits", "assessment"],
    ),

    # ── Crisis & Safety ──────────────────────────────────────────
    SkillDescriptor(
        id="crisis_response",
        name="Crisis Response",
        description="Trauma-informed crisis support with immediate safety assessment and referrals",
        category="safety",
        when_to_use=(
            "When the user appears to be in crisis: immediate danger, homelessness, "
            "domestic violence, mental health emergency, or any urgent safety concern."
        ),
        instructions=(
            "1. IMMEDIATELY assess safety: Is the user in immediate danger?\n"
            "2. If in immediate danger → provide emergency number (000) FIRST.\n"
            "3. Use trauma-informed language: calm, non-judgmental, empowering.\n"
            "4. Identify the crisis type (DV, homelessness, mental health, etc.).\n"
            "5. Provide the most relevant hotline number.\n"
            "6. Offer practical next steps appropriate to their situation.\n"
            "7. If they have children, include child-specific safety planning.\n"
            "8. Ask if they need help with a safety plan."
        ),
        critical_patterns=[
            "SAFETY FIRST — always start with immediate danger assessment.",
            "Use trauma-informed language: 'I hear you', 'You're not alone', 'This is not your fault'.",
            "NEVER tell someone to 'just leave' a dangerous situation — safety planning first.",
            "Always provide at least one hotline number relevant to their situation.",
            "Do NOT ask for personal identifying information.",
            "If someone mentions self-harm, provide Lifeline (13 11 14) immediately.",
        ],
        examples=[
            "I'm scared to go home tonight",
            "I have nowhere to sleep tonight and I have kids",
        ],
        compatible_tools=[
            "crisis_classifier", "hotline_directory", "safety_planner",
            "service_locator",
        ],
        tags=["crisis", "safety", "domestic-violence", "mental-health", "emergency"],
    ),

    # ── Communication & Guidance ─────────────────────────────────
    SkillDescriptor(
        id="step_by_step_guidance",
        name="Step-by-Step Guidance",
        description="Walk users through complex processes with clear, numbered steps",
        category="communication",
        when_to_use=(
            "When the user needs to complete a multi-step process: applying for a program, "
            "filling out forms, navigating a bureaucratic process, or following a procedure."
        ),
        instructions=(
            "1. Identify the full process from start to finish.\n"
            "2. Break it into clear, numbered steps (max 8-10 steps).\n"
            "3. For each step, explain: what to do, where to go, what documents are needed.\n"
            "4. Highlight any prerequisites or things to prepare in advance.\n"
            "5. Note approximate timeframes for each step.\n"
            "6. Provide links or contact details for each step where possible.\n"
            "7. Offer to explain any step in more detail."
        ),
        critical_patterns=[
            "Keep steps simple — one action per step.",
            "Include 'what you'll need' at the start (documents, IDs, etc.).",
            "Use checkboxes or numbered lists for scanability.",
            "Provide estimated time for the overall process.",
            "Offer to help with individual steps if the user gets stuck.",
        ],
        examples=[
            "How do I apply for social housing in NSW?",
            "Walk me through lodging a complaint with Fair Trading",
        ],
        compatible_tools=["web_search", "service_locator", "document_explainer"],
        tags=["guidance", "process", "step-by-step", "how-to"],
    ),
    SkillDescriptor(
        id="empathetic_communication",
        name="Empathetic Communication",
        description="Communicate with empathy, cultural sensitivity, and plain language",
        category="communication",
        when_to_use=(
            "When dealing with vulnerable populations, people in distress, or situations "
            "requiring cultural sensitivity and emotional intelligence."
        ),
        instructions=(
            "1. Lead with empathy — acknowledge the person's situation before providing info.\n"
            "2. Use plain language (grade 6-8 reading level).\n"
            "3. Avoid jargon, acronyms, and bureaucratic language.\n"
            "4. Be culturally sensitive — don't make assumptions about background.\n"
            "5. Offer information in digestible chunks, not walls of text.\n"
            "6. Check in: 'Would you like me to explain any of that further?'\n"
            "7. End with hope and actionable next steps."
        ),
        critical_patterns=[
            "NEVER be dismissive of someone's concerns or feelings.",
            "Avoid phrases like 'just', 'simply', 'all you need to do' — these minimize difficulty.",
            "Respect autonomy — present options, don't dictate.",
            "If someone seems overwhelmed, offer to break info into smaller pieces.",
            "Always end on a constructive, hopeful note.",
        ],
        examples=[
            "I don't understand this letter from Centrelink",
            "I'm overwhelmed and don't know where to start",
        ],
        compatible_tools=["document_explainer", "summarize_text"],
        tags=["empathy", "communication", "accessibility", "plain-language"],
    ),

    # ── Service Navigation ───────────────────────────────────────
    SkillDescriptor(
        id="service_navigation",
        name="Service Navigation",
        description="Find and connect users with relevant local services, agencies, and support",
        category="navigation",
        when_to_use=(
            "When the user needs to find a specific service: doctor, legal centre, shelter, "
            "government office, community organisation, or support group."
        ),
        instructions=(
            "1. Understand what service the user needs and their location.\n"
            "2. Search for relevant services in their area.\n"
            "3. Provide top 2-3 options with: name, address, phone, hours.\n"
            "4. Note any eligibility requirements or costs.\n"
            "5. Explain how to access the service (walk-in, appointment, referral).\n"
            "6. Provide transport/accessibility info if relevant.\n"
            "7. Offer alternative services if the primary option isn't suitable."
        ),
        critical_patterns=[
            "Always confirm location/area before searching for services.",
            "Include opening hours and whether appointment is needed.",
            "Note if a service is free or has costs.",
            "Provide phone numbers for follow-up.",
            "If no local service exists, suggest phone/online alternatives.",
        ],
        examples=[
            "I need a free legal centre near Parramatta",
            "Where can I get emergency food assistance in inner Sydney?",
        ],
        compatible_tools=["service_locator", "web_search", "hotline_directory"],
        tags=["services", "local", "navigation", "referral"],
    ),

    # ── Data & Comparison ────────────────────────────────────────
    SkillDescriptor(
        id="comparative_analysis",
        name="Comparative Analysis",
        description="Compare options, programs, or services side-by-side with pros/cons",
        category="analysis",
        when_to_use=(
            "When the user needs to choose between multiple options: programs, services, "
            "plans, providers, or approaches."
        ),
        instructions=(
            "1. Identify all options to compare.\n"
            "2. Determine the comparison criteria (cost, eligibility, features, etc.).\n"
            "3. Create a structured comparison (table or side-by-side).\n"
            "4. Highlight key differences and trade-offs.\n"
            "5. Provide a recommendation based on the user's specific situation.\n"
            "6. Note any information gaps or caveats."
        ),
        critical_patterns=[
            "Present comparisons in a structured, scannable format.",
            "Be balanced — show pros AND cons for each option.",
            "Tailor the recommendation to the user's stated priorities.",
            "If information is incomplete, say so rather than guessing.",
        ],
        examples=[
            "Compare public vs community housing in NSW",
            "What's the difference between Legal Aid and a Community Legal Centre?",
        ],
        compatible_tools=["web_search", "summarize_text", "retrieval_query"],
        tags=["comparison", "analysis", "decision-making"],
    ),

    # ── Knowledge & RAG ──────────────────────────────────────────
    SkillDescriptor(
        id="knowledge_retrieval",
        name="Knowledge Base Retrieval",
        description="Search and synthesize information from the agent's knowledge base",
        category="knowledge",
        when_to_use=(
            "When the agent has a populated knowledge base and the user's question "
            "can be answered from stored documents."
        ),
        instructions=(
            "1. Formulate a clear search query from the user's question.\n"
            "2. Query the knowledge base for relevant chunks.\n"
            "3. If results are found, synthesize them into a coherent answer.\n"
            "4. Cite the source document(s) for transparency.\n"
            "5. If the KB doesn't have enough info, supplement with web search.\n"
            "6. Never fabricate information — if it's not in the KB, say so."
        ),
        critical_patterns=[
            "Always try the knowledge base BEFORE falling back to web search.",
            "Cite sources: 'According to [document name]...'",
            "If the KB is empty or has no relevant results, be transparent.",
            "Combine KB results with real-time search when needed for completeness.",
        ],
        examples=[
            "What does our policy document say about refund eligibility?",
            "Search the knowledge base for information about tenant rights",
        ],
        compatible_tools=["retrieval_query", "summarize_text", "web_search"],
        tags=["knowledge-base", "RAG", "retrieval", "documents"],
    ),
]


# ── Registry ────────────────────────────────────────────────────────

SKILL_REGISTRY: Dict[str, SkillDescriptor] = {s.id: s for s in BUILT_IN_SKILLS}
SKILL_NAMES: List[str] = [s.id for s in BUILT_IN_SKILLS]


def get_skill(skill_id: str) -> Optional[SkillDescriptor]:
    """Get a skill by ID, or None if not found."""
    return SKILL_REGISTRY.get(skill_id)


def get_skills_by_category(category: str) -> List[SkillDescriptor]:
    """Get all skills in a category."""
    return [s for s in BUILT_IN_SKILLS if s.category == category]


def get_skills_by_tags(tags: List[str]) -> List[SkillDescriptor]:
    """Get skills that have ANY of the given tags."""
    tag_set = set(t.lower() for t in tags)
    return [s for s in BUILT_IN_SKILLS if tag_set & set(t.lower() for t in s.tags)]


def get_all_skills_level1_prompt() -> str:
    """Level 1 metadata for ALL skills — always included in orchestrator prompts."""
    categories: Dict[str, List[SkillDescriptor]] = {}
    for s in BUILT_IN_SKILLS:
        categories.setdefault(s.category, []).append(s)

    lines = []
    for cat, skills in sorted(categories.items()):
        lines.append(f"\n[{cat.upper()}]")
        for s in skills:
            lines.append(s.level1_prompt)
    return "\n".join(lines)


def get_skills_level2_prompt(skill_ids: List[str]) -> str:
    """Level 2 full instructions for selected skills — injected into system prompts."""
    parts = []
    for sid in skill_ids:
        skill = SKILL_REGISTRY.get(sid)
        if skill:
            parts.append(skill.level2_prompt)
    if not parts:
        return ""
    return (
        "\n\n---\n## ACTIVE SKILLS\n"
        "Follow these skill instructions when handling relevant requests:\n\n"
        + "\n---\n".join(parts)
    )


def get_skill_descriptors_json() -> List[Dict]:
    """Return all skills as JSON-serialisable dicts (for API responses)."""
    return [s.to_dict() for s in BUILT_IN_SKILLS]


def get_categories() -> List[str]:
    """Return all unique skill categories."""
    return sorted(set(s.category for s in BUILT_IN_SKILLS))
