"""Tool catalogue — 12 universal tools available to EVERY use-case.

The orchestrator shows the LLM the full catalogue.  The LLM picks the
tools that fit the user's task and MUST provide a justification reason
for each selection.

Tool implementations are *real* async callables backed by:
  - Tavily   → web_search
  - httpx + BeautifulSoup → scrape_url
  - Mistral  → summarize_text, document_explainer
  - Static data → hotline_directory
  - Heuristic logic → eligibility_checker, crisis_classifier, safety_planner
  - Web-search augmented → service_locator, rights_lookup, eligibility_checker
  - Placeholder stubs → retrieval_query, human_review
"""

from __future__ import annotations

import json
import logging
import os
import re
from dataclasses import dataclass
from typing import Any, Callable, Dict, List

import httpx

logger = logging.getLogger(__name__)


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
# Real implementations backed by Tavily, httpx, Mistral, and static data.


# ─── 1. web_search — Tavily API ──────────────────────────────────────

async def web_search(query: str, **kw: Any) -> str:
    """Search the web using the Tavily API.

    Falls back to a stub result if the API key is missing or the call fails.
    """
    api_key = os.getenv("TAVILY_API_KEY", "")
    if not api_key:
        logger.warning("TAVILY_API_KEY not set — returning stub search result")
        return json.dumps({
            "query": query,
            "results": [{
                "title": f"Result for: {query}",
                "snippet": "Tavily API key not configured. Set TAVILY_API_KEY to enable real web search.",
                "url": "https://tavily.com",
            }],
        })

    try:
        from tavily import AsyncTavilyClient  # type: ignore[import-untyped]

        client = AsyncTavilyClient(api_key=api_key)
        response = await client.search(
            query=query,
            max_results=5,
            search_depth="basic",
            include_answer=True,
        )
        results = []
        for r in response.get("results", []):
            results.append({
                "title": r.get("title", ""),
                "snippet": r.get("content", "")[:500],
                "url": r.get("url", ""),
                "score": r.get("score", 0),
            })

        output = {
            "query": query,
            "answer": response.get("answer", ""),
            "results": results,
        }
        logger.info("  🔍 Tavily web_search: %d results for '%s'", len(results), query)
        return json.dumps(output)
    except Exception as e:
        logger.error("  ❌ Tavily web_search failed: %s", e)
        return json.dumps({
            "query": query,
            "error": str(e),
            "results": [{
                "title": f"Search error for: {query}",
                "snippet": f"Web search failed: {e}",
                "url": "",
            }],
        })


# ─── 2. scrape_url — httpx + BeautifulSoup ───────────────────────────

async def scrape_url(url: str, **kw: Any) -> str:
    """Scrape and extract readable text from a URL using httpx + BeautifulSoup."""
    try:
        from bs4 import BeautifulSoup  # type: ignore[import-untyped]

        async with httpx.AsyncClient(
            timeout=15.0,
            follow_redirects=True,
            headers={"User-Agent": "PublicAI-Foundry/1.0 (scraper)"},
        ) as client:
            resp = await client.get(url)
            resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "html.parser")

        # Remove scripts, styles, navs, footers
        for tag in soup(["script", "style", "nav", "footer", "header", "aside", "noscript"]):
            tag.decompose()

        text = soup.get_text(separator="\n", strip=True)
        text = re.sub(r"\n{3,}", "\n\n", text)
        if len(text) > 8000:
            text = text[:8000] + "\n\n[... truncated]"

        title = soup.title.string.strip() if soup.title and soup.title.string else url
        logger.info("  🌐 scrape_url: %d chars from %s", len(text), url)
        return json.dumps({"url": url, "title": title, "content": text})
    except Exception as e:
        logger.error("  ❌ scrape_url failed for %s: %s", url, e)
        return json.dumps({"url": url, "error": str(e), "content": ""})


# ─── 3. summarize_text — LLM-powered ─────────────────────────────────

async def summarize_text(text: str, max_length: int = 500, **kw: Any) -> str:
    """Summarize text using Mistral LLM. Falls back to truncation."""
    if len(text) <= max_length:
        return text

    try:
        from langchain_mistralai import ChatMistralAI
        from langchain_core.messages import SystemMessage, HumanMessage as HMsg

        llm = ChatMistralAI(model="mistral-small-latest", temperature=0.3)
        response = await llm.ainvoke([
            SystemMessage(content=(
                "You are a concise summarizer. Summarize the following text into "
                f"at most {max_length} characters. Keep the most important facts. "
                "Output ONLY the summary, no preamble."
            )),
            HMsg(content=text[:12000]),
        ])
        summary = response.content.strip()
        logger.info("  📝 summarize_text: %d → %d chars", len(text), len(summary))
        return summary
    except Exception as e:
        logger.error("  ❌ LLM summarize failed, falling back to truncation: %s", e)
        return text[:max_length] + ("..." if len(text) > max_length else "")


# ─── 4. document_explainer — LLM-powered ─────────────────────────────

async def document_explainer(
    document_text: str = "", document_type: str = "", **kw: Any
) -> str:
    """Explain a complex document in plain English using Mistral LLM."""
    if not document_text:
        return json.dumps({"explanation": "No document text provided.", "key_points": []})

    try:
        from langchain_mistralai import ChatMistralAI
        from langchain_core.messages import SystemMessage, HumanMessage as HMsg

        llm = ChatMistralAI(model="mistral-small-latest", temperature=0.4)
        response = await llm.ainvoke([
            SystemMessage(content=(
                "You explain complex documents in simple, plain English. "
                f"The document type is: {document_type or 'unknown'}.\n\n"
                "RULES:\n"
                "- Use simple language a 12-year-old could understand.\n"
                "- Break it into key points.\n"
                "- Highlight any deadlines, obligations, or rights.\n"
                "- End with a disclaimer: 'This is general information, not legal/medical advice.'\n"
                "- Output as JSON: {\"explanation\": \"...\", \"key_points\": [...], \"disclaimer\": \"...\"}"
            )),
            HMsg(content=document_text[:12000]),
        ])
        logger.info("  📄 document_explainer: explained %d chars", len(document_text))
        return response.content.strip()
    except Exception as e:
        logger.error("  ❌ LLM document_explainer failed: %s", e)
        return json.dumps({
            "document_type": document_type,
            "explanation": f"Could not explain document: {e}",
            "key_points": [],
            "disclaimer": "This is general information, not legal/medical advice.",
        })


# ─── 5. retrieval_query — placeholder (needs vector store) ───────────

async def retrieval_query(
    query: str, knowledge_base: str = "default", **kw: Any
) -> str:
    """Query a knowledge base for relevant chunks. (placeholder — needs vector store)"""
    logger.info("  📚 retrieval_query: query='%s', kb='%s' (placeholder)", query, knowledge_base)
    return json.dumps({
        "query": query,
        "knowledge_base": knowledge_base,
        "results": [{
            "chunk": f"Knowledge base '{knowledge_base}' is not yet populated. "
                     "Upload documents to enable retrieval.",
            "score": 0.0,
        }],
        "note": "Vector store integration pending — documents need to be ingested first.",
    })


# ─── 6. eligibility_checker — web-search augmented ───────────────────

async def eligibility_checker(
    program: str = "",
    circumstances: str = "",
    income: float = 0,
    household_size: int = 1,
    **kw: Any,
) -> str:
    """Check eligibility using Tavily search for current criteria."""
    search_query = f"{program} eligibility criteria Australia {circumstances}".strip()
    search_result = await web_search(query=search_query)
    search_data = json.loads(search_result)

    answer = search_data.get("answer", "")
    top_results = search_data.get("results", [])[:3]
    sources = [r.get("url", "") for r in top_results if r.get("url")]

    output = {
        "program": program or "general_assistance",
        "circumstances": circumstances,
        "income": income,
        "household_size": household_size,
        "eligibility_info": answer if answer else (
            f"Based on available information for '{program}': please verify "
            "your specific eligibility with the relevant agency."
        ),
        "key_details": [r.get("snippet", "") for r in top_results[:2]],
        "sources": sources,
        "next_steps": [
            "Contact the relevant government agency to confirm eligibility",
            "Gather required documents (ID, proof of income, residency)",
            "Apply through the official channel or visit a local office",
        ],
        "disclaimer": "This is general guidance only — not a formal eligibility determination.",
    }
    logger.info("  ✅ eligibility_checker: program='%s'", program)
    return json.dumps(output)


# ─── 7. service_locator — web-search augmented ───────────────────────

async def service_locator(
    postcode_or_suburb: str = "", service_type: str = "", **kw: Any
) -> str:
    """Find nearby services using Tavily search."""
    search_query = f"{service_type} services near {postcode_or_suburb} Australia".strip()
    search_result = await web_search(query=search_query)
    search_data = json.loads(search_result)

    answer = search_data.get("answer", "")
    top_results = search_data.get("results", [])[:5]

    services = []
    for r in top_results:
        services.append({
            "name": r.get("title", "Unknown service"),
            "info": r.get("snippet", ""),
            "url": r.get("url", ""),
        })

    output = {
        "postcode": postcode_or_suburb,
        "service_type": service_type,
        "summary": answer,
        "results": services,
        "tip": "For the most up-to-date info, visit Ask Izzy (askizzy.org.au) or Service NSW.",
    }
    logger.info("  📍 service_locator: '%s' near '%s'", service_type, postcode_or_suburb)
    return json.dumps(output)


# ─── 8. rights_lookup — web-search augmented ─────────────────────────

async def rights_lookup(topic: str = "", situation: str = "", **kw: Any) -> str:
    """Look up legal rights using Tavily search."""
    search_query = f"{topic} rights {situation} NSW Australia law".strip()
    search_result = await web_search(query=search_query)
    search_data = json.loads(search_result)

    answer = search_data.get("answer", "")
    top_results = search_data.get("results", [])[:3]
    sources = [r.get("url", "") for r in top_results if r.get("url")]

    output = {
        "topic": topic,
        "situation": situation,
        "rights_info": answer if answer else f"Information about {topic} rights for your situation.",
        "key_details": [r.get("snippet", "") for r in top_results[:2]],
        "sources": sources,
        "contact": "LawAccess NSW — 1300 888 529 (free legal help)",
        "disclaimer": "This is general information only, NOT legal advice. "
                      "Consult a qualified legal professional for your specific situation.",
    }
    logger.info("  ⚖️ rights_lookup: topic='%s'", topic)
    return json.dumps(output)


# ─── 9. crisis_classifier — keyword heuristic ────────────────────────

_CRISIS_KEYWORDS: dict[str, list[str]] = {
    "domestic_violence": ["dv", "domestic", "violence", "abuse", "abusive", "partner", "hitting", "controlling", "avo"],
    "mental_health": ["suicide", "suicidal", "self-harm", "self harm", "depressed", "depression", "anxiety", "panic", "psychosis", "mental"],
    "homelessness": ["homeless", "evict", "eviction", "sleeping rough", "no home", "kicked out", "couch surfing"],
    "financial_hardship": ["no money", "can't pay", "debt", "bills", "broke", "afford", "hardship", "financial"],
    "child_safety": ["child abuse", "neglect", "child at risk", "child safety", "children at risk"],
    "disaster": ["flood", "fire", "bushfire", "cyclone", "storm", "earthquake", "disaster"],
}

_URGENCY_KEYWORDS: dict[str, list[str]] = {
    "critical": ["danger", "emergency", "immediate", "right now", "dying", "kill", "weapon", "threat", "bleeding"],
    "high": ["urgent", "scared", "afraid", "tonight", "today", "no safe", "nowhere", "hurting"],
    "medium": ["worried", "stressed", "struggling", "difficult", "hard time"],
}


async def crisis_classifier(situation: str = "", **kw: Any) -> str:
    """Classify crisis type and urgency based on keyword matching."""
    sit_lower = situation.lower()

    detected_types: list[str] = []
    for crisis_type, keywords in _CRISIS_KEYWORDS.items():
        if any(k in sit_lower for k in keywords):
            detected_types.append(crisis_type)

    urgency = "low"
    for level, keywords in _URGENCY_KEYWORDS.items():
        if any(k in sit_lower for k in keywords):
            urgency = level
            break

    primary_type = detected_types[0] if detected_types else "general"

    actions: dict[str, str] = {
        "domestic_violence": "If in immediate danger, call 000. Otherwise call 1800RESPECT (1800 737 732).",
        "mental_health": "If you or someone is at immediate risk, call 000. Otherwise call Lifeline on 13 11 14.",
        "homelessness": "Call Link2home on 1800 152 152 for emergency accommodation.",
        "financial_hardship": "Contact Centrelink on 13 28 50 for crisis payments.",
        "child_safety": "If a child is in immediate danger, call 000. Report to Child Protection Helpline: 132 111.",
        "disaster": "Call 000 for emergencies. SES: 132 500.",
        "general": "If in immediate danger, call 000. For non-urgent support, describe your situation in more detail.",
    }

    output = {
        "crisis_types": detected_types or ["general"],
        "primary_type": primary_type,
        "urgency": urgency,
        "immediate_action": actions.get(primary_type, actions["general"]),
        "all_relevant_hotlines": _get_hotlines_for_types(detected_types or ["general"]),
    }
    logger.info("  🚨 crisis_classifier: types=%s, urgency=%s", detected_types, urgency)
    return json.dumps(output)


# ─── 10. safety_planner — structured plan builder ─────────────────────

async def safety_planner(
    situation: str = "", has_children: bool = False, **kw: Any
) -> str:
    """Create a structured safety plan based on the situation."""
    classification = json.loads(await crisis_classifier(situation=situation))
    primary = classification.get("primary_type", "general")

    safe_places = ["A trusted friend or family member's home", "Local police station"]
    emergency_contacts = ["000 (Emergency)", "1800RESPECT (1800 737 732)"]
    documents = ["Photo ID (driver's licence, passport)", "Medicare card", "Bank cards", "Phone charger"]

    if primary == "domestic_violence":
        safe_places.extend(["Local women's refuge", "Domestic violence safe house"])
        emergency_contacts.extend([
            "NSW Domestic Violence Line — 1800 656 463",
            "Men's Referral Service — 1300 766 491",
        ])
    elif primary == "mental_health":
        emergency_contacts.extend([
            "Lifeline — 13 11 14",
            "Beyond Blue — 1300 224 636",
            "Kids Helpline — 1800 55 1800",
        ])
        safe_places.extend(["Hospital emergency department", "GP clinic"])
    elif primary == "homelessness":
        safe_places.extend(["Local shelter", "Salvos or St Vincent de Paul centre"])
        emergency_contacts.append("Link2home — 1800 152 152")

    if has_children:
        documents.extend([
            "Children's birth certificates",
            "School enrolment records",
            "Children's Medicare cards",
            "Court orders (if any)",
            "Immunisation records",
        ])

    plan = {
        "situation_type": primary,
        "urgency": classification.get("urgency", "medium"),
        "safe_places": safe_places,
        "emergency_contacts": emergency_contacts,
        "important_documents": documents,
        "immediate_steps": [
            "Store this plan somewhere safe (not at home if situation is unsafe)",
            "Save emergency numbers in your phone under a discreet name",
            "Tell a trusted person about your plan",
            "Pack an emergency bag with essentials",
        ],
        "children_specific": has_children,
        "disclaimer": "This plan is general guidance. For immediate danger, always call 000.",
    }
    logger.info("  🛡️ safety_planner: type=%s, children=%s", primary, has_children)
    return json.dumps(plan)


# ─── 11. hotline_directory — real Australian hotlines ─────────────────

_HOTLINES: dict[str, list[dict[str, str]]] = {
    "emergency": [
        {"name": "Emergency Services (Police, Fire, Ambulance)", "number": "000", "note": "24/7"},
    ],
    "domestic_violence": [
        {"name": "1800RESPECT", "number": "1800 737 732", "note": "24/7 national DV/SA helpline"},
        {"name": "NSW Domestic Violence Line", "number": "1800 656 463", "note": "24/7"},
        {"name": "Men's Referral Service", "number": "1300 766 491", "note": "Mon–Fri 8am–9pm, Sat–Sun 9am–5pm"},
        {"name": "DV Alert", "number": "1800 200 526", "note": "24/7"},
    ],
    "mental_health": [
        {"name": "Lifeline", "number": "13 11 14", "note": "24/7 crisis support"},
        {"name": "Beyond Blue", "number": "1300 224 636", "note": "24/7"},
        {"name": "Suicide Call Back Service", "number": "1300 659 467", "note": "24/7"},
        {"name": "SANE Australia", "number": "1800 187 263", "note": "Mon–Fri 10am–10pm"},
    ],
    "youth": [
        {"name": "Kids Helpline", "number": "1800 55 1800", "note": "24/7, for ages 5–25"},
        {"name": "Headspace", "number": "1800 650 890", "note": "Mon–Fri 9am–1am, Sat–Sun 9am–midnight"},
        {"name": "eHeadspace", "number": "eheadspace.org.au", "note": "Online chat"},
    ],
    "homelessness": [
        {"name": "Link2home", "number": "1800 152 152", "note": "24/7 housing & homelessness"},
        {"name": "Homeless Persons Info Centre", "number": "1800 234 566", "note": "24/7"},
    ],
    "financial": [
        {"name": "National Debt Helpline", "number": "1800 007 007", "note": "Mon–Fri 9:30am–4:30pm"},
        {"name": "Centrelink", "number": "13 28 50", "note": "Mon–Fri 8am–5pm"},
        {"name": "MoneySmart", "number": "1300 300 630", "note": "ASIC financial guidance"},
    ],
    "legal": [
        {"name": "LawAccess NSW", "number": "1300 888 529", "note": "Mon–Fri 9am–5pm, free legal info"},
        {"name": "Legal Aid NSW", "number": "1300 888 529", "note": "Free legal help for eligible people"},
        {"name": "Tenants' Union of NSW", "number": "1800 251 101", "note": "Tenancy advice"},
    ],
    "health": [
        {"name": "13 HEALTH (QLD)", "number": "13 43 25 84", "note": "24/7 health advice"},
        {"name": "Healthdirect Australia", "number": "1800 022 222", "note": "24/7 health advice"},
        {"name": "Poisons Information", "number": "13 11 26", "note": "24/7"},
    ],
    "child_safety": [
        {"name": "Child Protection Helpline (NSW)", "number": "132 111", "note": "24/7"},
        {"name": "Kids Helpline", "number": "1800 55 1800", "note": "24/7"},
    ],
    "aboriginal": [
        {"name": "13YARN", "number": "13 92 76", "note": "24/7, Aboriginal & Torres Strait Islander crisis support"},
        {"name": "Standby Support After Suicide", "number": "1300 727 247", "note": "Aboriginal communities"},
    ],
    "disability": [
        {"name": "NDIS", "number": "1800 800 110", "note": "Mon–Fri 8am–8pm"},
        {"name": "Disability Gateway", "number": "1800 643 787", "note": "Mon–Fri 8am–8pm"},
    ],
    "general": [
        {"name": "Emergency Services", "number": "000", "note": "Police, Fire, Ambulance — 24/7"},
        {"name": "Lifeline", "number": "13 11 14", "note": "24/7 crisis support"},
        {"name": "1800RESPECT", "number": "1800 737 732", "note": "24/7 DV/SA helpline"},
        {"name": "Kids Helpline", "number": "1800 55 1800", "note": "24/7, ages 5–25"},
    ],
}


def _get_hotlines_for_types(types: list[str]) -> list[dict[str, str]]:
    """Get de-duplicated hotlines for a list of crisis types."""
    seen: set[str] = set()
    result: list[dict[str, str]] = []
    for t in types:
        for h in _HOTLINES.get(t, _HOTLINES["general"]):
            if h["number"] not in seen:
                seen.add(h["number"])
                result.append(h)
    if "000" not in seen:
        result.insert(0, _HOTLINES["emergency"][0])
    return result


async def hotline_directory(crisis_type: str = "", **kw: Any) -> str:
    """Return appropriate emergency hotline numbers for a crisis type."""
    ct = crisis_type.lower().strip()

    matched_type = "general"
    for key in _HOTLINES:
        if key in ct or ct in key:
            matched_type = key
            break

    if matched_type == "general":
        keyword_map: dict[str, list[str]] = {
            "domestic_violence": ["dv", "violence", "abuse", "avo"],
            "mental_health": ["mental", "suicide", "depression", "anxiety"],
            "homelessness": ["homeless", "housing", "evict", "shelter"],
            "financial": ["money", "debt", "centrelink", "financial"],
            "legal": ["legal", "law", "court", "tenant", "rights"],
            "health": ["health", "medical", "poison", "sick"],
            "youth": ["youth", "child", "kid", "teen", "young"],
        }
        for key, keywords in keyword_map.items():
            if any(kw_item in ct for kw_item in keywords):
                matched_type = key
                break

    hotlines = _HOTLINES.get(matched_type, _HOTLINES["general"])
    logger.info("  📞 hotline_directory: type='%s' → '%s' (%d hotlines)", crisis_type, matched_type, len(hotlines))
    return json.dumps({
        "crisis_type": crisis_type,
        "matched_category": matched_type,
        "hotlines": hotlines,
    })


# ─── 12. human_review — placeholder ──────────────────────────────────

async def human_review(question: str, **kw: Any) -> str:
    """Pause execution and wait for human input / approval. (placeholder)"""
    logger.info("  👤 human_review: question='%s'", question[:100])
    return json.dumps({
        "status": "awaiting_human",
        "question": question,
        "message": "This case has been flagged for human review. "
                   "A team member will review and respond as soon as possible.",
    })


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
