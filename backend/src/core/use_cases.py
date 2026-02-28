"""Use-case registry — domain context and metadata for supported use-cases.

Tools are UNIVERSAL — all 12 tools are available to every use-case.
The use-case provides domain context, suggested KB topics, example prompts,
and system guidance that the orchestrator injects into prompts so the LLM
makes informed tool choices and justifies each one.

Supported use-cases (all Australia / NSW focused):
  1. housing_crisis   — social / affordable housing, homelessness, tenancy
  2. legal_aid        — free legal help, tenancy law, domestic violence orders
  3. healthcare       — Medicare, mental health, rural health access
  4. crisis_support   — domestic violence, disaster relief, emergency welfare
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional


@dataclass
class UseCaseDescriptor:
    """Everything the orchestrator needs to know about a use-case.

    Tools are no longer scoped per use-case — the full universal tool
    catalogue is available to all domains.  The LLM picks whichever
    tools fit the task and must justify each selection.
    """

    id: str
    name: str
    description: str
    region: str = "Australia — New South Wales"
    suggested_kb_topics: List[str] = field(default_factory=list)
    example_prompts: List[str] = field(default_factory=list)
    system_context: str = ""


# ─── Housing Crisis ─────────────────────────────────────────────────

HOUSING_CRISIS = UseCaseDescriptor(
    id="housing_crisis",
    name="Housing Crisis Support",
    description=(
        "AI agent for people facing housing stress, homelessness, or "
        "social housing needs in New South Wales, Australia. Covers "
        "social housing applications, emergency accommodation, tenancy "
        "rights, bond assistance, rent arrears support, and connecting "
        "users to relevant NSW government services."
    ),
    suggested_kb_topics=[
        "NSW Housing Pathways application guide",
        "DCJ social housing eligibility criteria",
        "Temporary Accommodation program guidelines",
        "Rentstart Move and Rentstart Sustain factsheets",
        "NSW Residential Tenancies Act 2010 — key provisions",
        "Link2home referral pathways",
        "Community Housing Provider directory (NSW)",
    ],
    example_prompts=[
        "I'm about to be evicted and need emergency housing in Sydney",
        "Help me apply for social housing in NSW",
        "What are my rights as a renter facing a rent increase in NSW?",
    ],
    system_context=(
        "You are assisting people in New South Wales, Australia who are "
        "experiencing housing stress, homelessness, or need help navigating "
        "the social housing system. Always be empathetic, trauma-informed, "
        "and provide actionable next steps. Reference NSW-specific programs "
        "like Housing Pathways, Link2home (1800 152 152), Rentstart, and "
        "DCJ housing services. Never provide legal advice — direct users "
        "to Tenants' Union of NSW or a community legal centre if needed."
    ),
)


# ─── Legal Aid ───────────────────────────────────────────────────────

LEGAL_AID = UseCaseDescriptor(
    id="legal_aid",
    name="Legal Aid & Access to Justice",
    description=(
        "AI agent to help people in NSW access free or low-cost legal "
        "assistance. Covers tenancy disputes, family law, domestic "
        "violence protection orders (AVOs), consumer rights, fines, "
        "debt, and employment law — connecting users to Legal Aid NSW, "
        "community legal centres, and pro-bono services."
    ),
    suggested_kb_topics=[
        "Legal Aid NSW eligibility guidelines",
        "Community Legal Centre directory (NSW)",
        "NSW Civil and Administrative Tribunal (NCAT) procedures",
        "Apprehended Violence Orders (AVOs) — process and rights",
        "Tenancy law factsheets (Tenants' Union of NSW)",
        "LawAccess NSW self-help resources",
        "Fair Trading NSW consumer rights guides",
    ],
    example_prompts=[
        "I received an eviction notice — what are my rights?",
        "I need help getting a domestic violence protection order",
        "Can I get free legal help for my unfair dismissal case?",
    ],
    system_context=(
        "You are assisting people in New South Wales, Australia who need "
        "legal help but may not be able to afford a lawyer. You MUST NOT "
        "provide legal advice — instead, explain rights in general terms "
        "and direct users to appropriate services (Legal Aid NSW on "
        "1300 888 529, LawAccess NSW on 1300 888 529, community legal "
        "centres). Be empathetic, use plain English, and help users "
        "understand their options and next steps."
    ),
)


# ─── Healthcare ──────────────────────────────────────────────────────

HEALTHCARE = UseCaseDescriptor(
    id="healthcare",
    name="Healthcare Access & Navigation",
    description=(
        "AI agent to help people in NSW navigate the healthcare system. "
        "Covers Medicare, bulk-billing GPs, mental health support (including "
        "Mental Health Care Plans), rural health access, hospital services, "
        "NDIS health supports, aged care, and connecting users to NSW "
        "Health services."
    ),
    suggested_kb_topics=[
        "Medicare Benefits Schedule (MBS) common items",
        "NSW Health district map and service directory",
        "Mental Health Care Plan process and GP referral pathways",
        "Bulk-billing GP directory (NSW)",
        "Headspace and youth mental health services (NSW)",
        "Pharmaceutical Benefits Scheme (PBS) safety-net thresholds",
        "NSW rural health services and outreach programs",
    ],
    example_prompts=[
        "I need a bulk-billing GP near Parramatta",
        "How do I get a Mental Health Care Plan?",
        "What healthcare am I eligible for as a low-income earner?",
    ],
    system_context=(
        "You are assisting people in New South Wales, Australia with "
        "navigating the healthcare system. Be warm, clear, and avoid "
        "medical jargon. You are NOT a doctor and MUST NOT diagnose "
        "conditions. Always recommend calling 000 for medical emergencies "
        "or 13 HEALTH (13 43 25 84) for health advice. Direct users to "
        "Lifeline (13 11 14) or Beyond Blue (1300 224 636) for mental "
        "health crises. Reference Medicare, PBS, and NSW Health services "
        "where appropriate."
    ),
)


# ─── Crisis Support ─────────────────────────────────────────────────

CRISIS_SUPPORT = UseCaseDescriptor(
    id="crisis_support",
    name="Crisis & Emergency Support",
    description=(
        "AI agent for people in crisis situations in NSW — domestic and "
        "family violence, natural disaster relief, financial hardship, "
        "mental health emergencies, and child protection. Connects users "
        "to emergency services, refuges, crisis payments, and support "
        "organisations."
    ),
    suggested_kb_topics=[
        "1800RESPECT referral pathways and DV support services (NSW)",
        "Centrelink Crisis Payment eligibility and application",
        "NSW Victims Support Scheme — eligibility and claims",
        "Natural disaster recovery grants (NSW)",
        "Refuge and safe house directory (Women's Domestic Violence Court Advocacy Services)",
        "Apprehended Violence Orders (AVOs) — how to apply",
        "Emergency relief providers (NSW) — food, utilities, financial assistance",
    ],
    example_prompts=[
        "I need to leave an abusive partner — what support is available?",
        "My house was damaged in the floods — how do I get help?",
        "I'm in a mental health crisis and need immediate support",
    ],
    system_context=(
        "You are assisting people in New South Wales, Australia who are "
        "in crisis or emergency situations. Safety is the TOP PRIORITY. "
        "For immediate danger, ALWAYS tell users to call 000. For domestic "
        "violence, recommend 1800RESPECT (1800 737 732). For mental health "
        "emergencies, recommend Lifeline (13 11 14). Be trauma-informed, "
        "non-judgmental, and action-oriented. Never ask unnecessary questions "
        "when someone is in danger. Provide concrete next steps and service "
        "contact information immediately."
    ),
)


# ─── Registry ────────────────────────────────────────────────────────

USE_CASE_REGISTRY: Dict[str, UseCaseDescriptor] = {
    "housing_crisis": HOUSING_CRISIS,
    "legal_aid": LEGAL_AID,
    "healthcare": HEALTHCARE,
    "crisis_support": CRISIS_SUPPORT,
}


def get_use_case(use_case_id: str) -> Optional[UseCaseDescriptor]:
    """Return the use-case descriptor or None."""
    return USE_CASE_REGISTRY.get(use_case_id)


def list_use_cases() -> List[Dict[str, str]]:
    """Return a lightweight list of all available use-cases."""
    return [
        {
            "id": uc.id,
            "name": uc.name,
            "description": uc.description,
            "region": uc.region,
            "example_prompts": uc.example_prompts,
        }
        for uc in USE_CASE_REGISTRY.values()
    ]


def get_use_case_context(use_case_id: str) -> str:
    """Return the system context for a use-case (for embedding in prompts)."""
    uc = USE_CASE_REGISTRY.get(use_case_id)
    if not uc:
        return ""
    return uc.system_context
