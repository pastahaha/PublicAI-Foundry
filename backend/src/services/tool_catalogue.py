"""Tool catalogue — 12 universal tools available to EVERY use-case.

The orchestrator shows the LLM the full catalogue.  The LLM picks the
tools that fit the user's task and MUST provide a justification reason
for each selection.

Tool implementations are async callables — placeholders today, swap in
real APIs (Tavily, Ask Izzy, Services Australia, etc.) later.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from typing import Any, Callable, Dict, List


# ─── Tool descriptor (used for prompt generation) ────────────────────


@dataclass
class ToolDescriptor:
    """Metadata about a universal tool — fed into LLM prompts."""

    name: str
    description: str
    parameters: Dict[str, str]
    category: str = "general"


# ─── The 12 universal tools ─────────────────────────────────────────

TOOL_DESCRIPTORS: List[ToolDescriptor] = [
    ToolDescriptor(
        name="web_search",
        description=(
            "Search the web for up-to-date information relevant to the user's query. "
            "Useful for finding current government programs, policy updates, service "
            "availability, news, or any information not in the knowledge base."
        ),
        parameters={"query": "str"},
        category="research",
    ),
    ToolDescriptor(
        name="scrape_url",
        description=(
            "Scrape and extract content from a URL (e.g. government pages, service "
            "directories, policy documents). Returns the page text for further processing."
        ),
        parameters={"url": "str"},
        category="research",
    ),
    ToolDescriptor(
        name="summarize_text",
        description=(
            "Summarize a long document, scraped page, or text block into a concise "
            "version. Useful after scraping or retrieving large documents."
        ),
        parameters={"text": "str", "max_length": "int"},
        category="text",
    ),
    ToolDescriptor(
        name="document_explainer",
        description=(
            "Explain a complex document (legal notice, medical report, government "
            "letter, court order, lease agreement) in plain English. Does NOT "
            "provide legal or medical advice — just plain-language explanation."
        ),
        parameters={"document_text": "str", "document_type": "str"},
        category="text",
    ),
    ToolDescriptor(
        name="retrieval_query",
        description=(
            "Query the agent's knowledge base / vector store for relevant information. "
            "Use when the agent has a populated KB with domain-specific documents."
        ),
        parameters={"query": "str", "knowledge_base": "str"},
        category="knowledge",
    ),
    ToolDescriptor(
        name="eligibility_checker",
        description=(
            "Check a user's eligibility for government assistance programs — housing, "
            "legal aid, healthcare, crisis payments, Centrelink, NDIS, PBS safety-net, "
            "etc. Works across all domains by accepting program name and circumstances."
        ),
        parameters={
            "program": "str",
            "circumstances": "str",
            "income": "float",
            "household_size": "int",
        },
        category="assessment",
    ),
    ToolDescriptor(
        name="service_locator",
        description=(
            "Find nearby services based on location — GPs, shelters, legal centres, "
            "Centrelink offices, hospitals, refuges, community organisations. Works "
            "across all domains (housing, health, legal, crisis)."
        ),
        parameters={"postcode_or_suburb": "str", "service_type": "str"},
        category="directory",
    ),
    ToolDescriptor(
        name="rights_lookup",
        description=(
            "Look up a person's rights in a specific situation under NSW law — tenancy "
            "rights, employee rights, AVO protections, consumer guarantees, patient "
            "rights, DV protections. Returns relevant legislation and plain-English summary."
        ),
        parameters={"topic": "str", "situation": "str"},
        category="legal",
    ),
    ToolDescriptor(
        name="crisis_classifier",
        description=(
            "Classify the type and urgency of a situation — domestic violence, mental "
            "health emergency, homelessness, financial hardship, disaster, child safety. "
            "Routes to appropriate response pathways and emergency contacts."
        ),
        parameters={"situation": "str"},
        category="assessment",
    ),
    ToolDescriptor(
        name="safety_planner",
        description=(
            "Help create a safety plan for someone in a dangerous situation (DV, mental "
            "health crisis, etc.). Covers safe places, emergency contacts, important "
            "documents, escape planning. Always recommends relevant hotlines."
        ),
        parameters={"situation": "str", "has_children": "bool"},
        category="safety",
    ),
    ToolDescriptor(
        name="hotline_directory",
        description=(
            "Return the appropriate emergency hotline numbers and details for a given "
            "situation — 000 (emergency), 1800RESPECT (DV), Lifeline (mental health), "
            "Kids Helpline, Link2home (homelessness), 13 HEALTH, Beyond Blue, etc."
        ),
        parameters={"crisis_type": "str"},
        category="directory",
    ),
    ToolDescriptor(
        name="human_review",
        description=(
            "Pause execution and escalate to a human operator for review, approval, "
            "or manual intervention. Use for sensitive decisions, complex cases, or "
            "when the agent is unsure."
        ),
        parameters={"question": "str"},
        category="workflow",
    ),
]

TOOL_NAMES: List[str] = [t.name for t in TOOL_DESCRIPTORS]


def get_all_tools_prompt() -> str:
    """Formatted string listing ALL 12 universal tools for LLM prompts."""
    lines = []
    for i, t in enumerate(TOOL_DESCRIPTORS, 1):
        params = ", ".join(f"{k}: {v}" for k, v in t.parameters.items())
        lines.append(
            f"  {i}. {t.name} [{t.category}] — {t.description}\n"
            f"     Params: ({params})"
        )
    return "\n".join(lines)


def get_tool_descriptors_json() -> List[dict]:
    """Return tool descriptors as JSON-serialisable dicts (for API responses)."""
    return [
        {
            "name": t.name,
            "description": t.description,
            "parameters": t.parameters,
            "category": t.category,
        }
        for t in TOOL_DESCRIPTORS
    ]


# ─── Tool implementations (async callables) ─────────────────────────
# All are placeholders — swap in real APIs for production.


async def web_search(query: str, **kw: Any) -> str:
    """Search the web for information. (placeholder — swap in Tavily / Brave / SerpAPI)"""
    return json.dumps(
        {
            "query": query,
            "results": [
                {
                    "title": f"Result for: {query}",
                    "snippet": "Placeholder — integrate a real search API.",
                    "url": "https://example.com",
                }
            ],
        }
    )


async def scrape_url(url: str, **kw: Any) -> str:
    """Scrape content from a URL. (placeholder)"""
    return json.dumps(
        {"url": url, "content": f"Placeholder scraped content from {url}"}
    )


async def summarize_text(text: str, max_length: int = 500, **kw: Any) -> str:
    """Summarize a long piece of text."""
    return text[:max_length] + ("..." if len(text) > max_length else "")


async def document_explainer(
    document_text: str = "", document_type: str = "", **kw: Any
) -> str:
    """Explain a complex document in plain English. (placeholder)"""
    return json.dumps(
        {
            "document_type": document_type,
            "explanation": f"Placeholder explanation of {document_type}. "
            "Integrate real document parsing + LLM explanation.",
            "key_points": ["Point 1", "Point 2"],
            "disclaimer": "This is general information, not legal/medical advice.",
        }
    )


async def retrieval_query(
    query: str, knowledge_base: str = "default", **kw: Any
) -> str:
    """Query a knowledge base for relevant chunks. (placeholder)"""
    return json.dumps(
        {
            "query": query,
            "knowledge_base": knowledge_base,
            "results": [
                {"chunk": f"Relevant information about: {query}", "score": 0.92}
            ],
        }
    )


async def eligibility_checker(
    program: str = "",
    circumstances: str = "",
    income: float = 0,
    household_size: int = 1,
    **kw: Any,
) -> str:
    """Check eligibility for government assistance programs. (placeholder)"""
    return json.dumps(
        {
            "eligible": True,
            "program": program or "general_assistance",
            "message": f"Placeholder eligibility check for program={program}, income={income}. "
            "Integrate real eligibility rules for NSW programs.",
            "next_steps": ["Contact your local office", "Prepare required documents"],
        }
    )


async def service_locator(
    postcode_or_suburb: str = "", service_type: str = "", **kw: Any
) -> str:
    """Find nearby services based on location. (placeholder)"""
    return json.dumps(
        {
            "postcode": postcode_or_suburb,
            "service_type": service_type,
            "results": [
                {
                    "name": f"Placeholder {service_type} service near {postcode_or_suburb}",
                    "address": "123 Example St, NSW",
                    "phone": "1300 000 000",
                    "note": "Integrate real service directory API (e.g. Ask Izzy, Service NSW)",
                }
            ],
        }
    )


async def rights_lookup(topic: str = "", situation: str = "", **kw: Any) -> str:
    """Look up legal rights for a given situation. (placeholder)"""
    return json.dumps(
        {
            "topic": topic,
            "rights": [f"Placeholder right regarding {topic}"],
            "applicable_law": "NSW legislation",
            "contact": "LawAccess NSW — 1300 888 529",
        }
    )


async def crisis_classifier(situation: str = "", **kw: Any) -> str:
    """Classify crisis type and urgency. (placeholder)"""
    return json.dumps(
        {
            "crisis_type": "general",
            "urgency": "medium",
            "immediate_action": "Call 000 if in immediate danger",
            "recommended_service": "Contact relevant support service",
            "note": "Placeholder — integrate real crisis classification.",
        }
    )


async def safety_planner(
    situation: str = "", has_children: bool = False, **kw: Any
) -> str:
    """Create a basic safety plan. (placeholder)"""
    return json.dumps(
        {
            "plan": {
                "safe_places": ["Friend/family member", "Local refuge"],
                "emergency_contacts": ["000", "1800RESPECT (1800 737 732)"],
                "important_documents": [
                    "ID",
                    "Medicare card",
                    "Bank cards",
                    "Children's documents",
                ],
                "packed_bag_location": "To be decided by user",
            },
            "children_specific": has_children,
            "note": "Placeholder — integrate real safety planning framework.",
        }
    )


async def hotline_directory(crisis_type: str = "", **kw: Any) -> str:
    """Return appropriate emergency hotline numbers."""
    hotlines = {
        "emergency": {"name": "Emergency Services", "number": "000"},
        "domestic_violence": {"name": "1800RESPECT", "number": "1800 737 732"},
        "mental_health": {"name": "Lifeline", "number": "13 11 14"},
        "youth": {"name": "Kids Helpline", "number": "1800 55 1800"},
        "homelessness": {"name": "Link2home", "number": "1800 152 152"},
        "dv_nsw": {"name": "NSW Domestic Violence Line", "number": "1800 656 463"},
        "health": {"name": "13 HEALTH", "number": "13 43 25 84"},
        "beyond_blue": {"name": "Beyond Blue", "number": "1300 224 636"},
    }
    return json.dumps({"crisis_type": crisis_type, "hotlines": hotlines})


async def human_review(question: str, **kw: Any) -> str:
    """Pause execution and wait for human input / approval. (placeholder)"""
    return json.dumps({"status": "awaiting_human", "question": question})


# ─── Implementation registry ────────────────────────────────────────
# Maps tool name → async callable.  The blueprint compiler uses this
# to wire real implementations into graph nodes at build time.

TOOL_REGISTRY: Dict[str, Callable] = {
    "web_search": web_search,
    "scrape_url": scrape_url,
    "summarize_text": summarize_text,
    "document_explainer": document_explainer,
    "retrieval_query": retrieval_query,
    "eligibility_checker": eligibility_checker,
    "service_locator": service_locator,
    "rights_lookup": rights_lookup,
    "crisis_classifier": crisis_classifier,
    "safety_planner": safety_planner,
    "hotline_directory": hotline_directory,
    "human_review": human_review,
}


def get_tool_names() -> List[str]:
    """All registered tool implementation names."""
    return list(TOOL_REGISTRY.keys())
