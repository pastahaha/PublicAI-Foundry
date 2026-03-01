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
class ReferenceSource:
    """A single reference URL with metadata."""
    url: str
    label: str
    description: str


@dataclass
class SourceCategory:
    """A group of reference sources under a category heading."""
    category: str
    sources: List[ReferenceSource] = field(default_factory=list)


@dataclass
class UseCaseDescriptor:
    """Everything the orchestrator needs to know about a use-case.

    Tools are no longer scoped per use-case — the full universal tool
    catalogue is available to all domains.  The LLM picks whichever
    tools fit the task and must justify each selection.

    ``reference_sources`` contains curated, authoritative government and
    service URLs that the orchestrator should inject into the agent's
    knowledge base configuration during the chat-based build flow.
    """

    id: str
    name: str
    description: str
    region: str = "Australia — New South Wales"
    suggested_kb_topics: List[str] = field(default_factory=list)
    example_prompts: List[str] = field(default_factory=list)
    system_context: str = ""
    reference_sources: List[SourceCategory] = field(default_factory=list)


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
    reference_sources=[
        SourceCategory("NSW Housing Authorities", [
            ReferenceSource("https://dcj.nsw.gov.au", "NSW Dept. of Communities & Justice", "Social housing, emergency accommodation, Rent Choice, Start Safely, waitlist info"),
            ReferenceSource("https://www.housingpathways.nsw.gov.au", "NSW Housing Pathways", "Apply for social housing — eligibility rules, required documents, waiting times"),
        ]),
        SourceCategory("Tenancy Law", [
            ReferenceSource("https://legislation.nsw.gov.au", "NSW Legislation", "Residential Tenancies Act 2010, notice periods, eviction grounds, bond handling"),
        ]),
        SourceCategory("Tribunal & Dispute Resolution", [
            ReferenceSource("https://www.ncat.nsw.gov.au", "NCAT", "Challenge evictions, bond disputes, repair orders, payment plans"),
        ]),
        SourceCategory("Tenancy Support", [
            ReferenceSource("https://www.tenants.org.au", "Tenants' Union of NSW", "Plain English guides — eviction, rent increases, repairs, DV termination rights"),
            ReferenceSource("https://www.tenants.org.au/taas", "Tenants Advice & Advocacy Services", "Free tenant support and local advice centres across NSW"),
        ]),
        SourceCategory("Homelessness & Emergency Housing", [
            ReferenceSource("https://www.missionaustralia.com.au", "Mission Australia Housing", "Crisis accommodation, homelessness services across NSW"),
            ReferenceSource("https://www.salvationarmy.org.au", "Salvation Army Housing", "Emergency relief and housing support"),
            ReferenceSource("https://www.vinnies.org.au/nsw", "St Vincent de Paul NSW", "Emergency assistance, accommodation referrals, welfare support"),
        ]),
        SourceCategory("Financial Assistance & Rental Relief", [
            ReferenceSource("https://www.service.nsw.gov.au", "Service NSW", "Rent Choice, bond loans, rental subsidies, energy rebates"),
            ReferenceSource("https://www.servicesaustralia.gov.au", "Services Australia", "Commonwealth Rent Assistance, income support, crisis payments"),
            ReferenceSource("https://www.revenue.nsw.gov.au", "Revenue NSW", "Rental bond refunds, payment plans, financial hardship"),
        ]),
        SourceCategory("Housing Statistics & Data", [
            ReferenceSource("https://www.abs.gov.au", "Australian Bureau of Statistics", "Rental stress statistics, median rent trends, household income data"),
            ReferenceSource("https://www.planningportal.nsw.gov.au", "NSW Planning Portal", "Housing data, development applications, zoning information"),
        ]),
        SourceCategory("Planning & Development", [
            ReferenceSource("https://www.planning.nsw.gov.au", "NSW Dept. of Planning", "Housing supply policy, development frameworks, urban planning"),
        ]),
        SourceCategory("Domestic Violence Housing Protections", [
            ReferenceSource("https://dcj.nsw.gov.au", "Start Safely (DCJ)", "NSW housing program for domestic violence victim-survivors"),
            ReferenceSource("https://www.1800respect.org.au", "1800RESPECT", "DV support and referrals — phone 1800 737 732"),
        ]),
    ],
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
    reference_sources=[
        SourceCategory("Legal Aid & Free Legal Help", [
            ReferenceSource("https://www.legalaid.nsw.gov.au", "Legal Aid NSW", "Free legal services — family law, criminal law, civil law for eligible people"),
            ReferenceSource("https://www.lawaccess.nsw.gov.au", "LawAccess NSW", "Free legal information, referrals, and self-help resources — phone 1300 888 529"),
            ReferenceSource("https://clcnsw.org.au", "Community Legal Centres NSW", "Directory of free community legal centres across NSW"),
        ]),
        SourceCategory("Legislation & Case Law", [
            ReferenceSource("https://legislation.nsw.gov.au", "NSW Legislation", "Official NSW Acts — Tenancy, Criminal, Family, Employment"),
            ReferenceSource("https://www.legislation.gov.au", "Federal Register of Legislation", "Commonwealth laws — Fair Work, Family Law, Privacy Act"),
            ReferenceSource("https://www.austlii.edu.au", "AustLII", "Free Australian case law — NSW/NCAT decisions and precedents"),
        ]),
        SourceCategory("Tenancy & Housing", [
            ReferenceSource("https://www.tenants.org.au", "Tenants' Union of NSW", "Tenancy guides, eviction process, notice periods, repairs"),
            ReferenceSource("https://www.ncat.nsw.gov.au", "NCAT", "NSW Civil & Administrative Tribunal — tenancy disputes"),
        ]),
        SourceCategory("Courts", [
            ReferenceSource("https://www.fcfcoa.gov.au", "Federal Circuit & Family Court", "Divorce, parenting disputes, domestic violence orders"),
            ReferenceSource("https://localcourt.nsw.gov.au", "Local Court NSW", "Criminal, civil, and AVO matters"),
        ]),
        SourceCategory("Employment", [
            ReferenceSource("https://www.fairwork.gov.au", "Fair Work Ombudsman", "Minimum wage, unfair dismissal, workplace rights"),
        ]),
        SourceCategory("Domestic Violence", [
            ReferenceSource("https://www.police.nsw.gov.au/crime/domestic_and_family_violence", "NSW Police — DV", "AVO information and reporting"),
            ReferenceSource("https://www.1800respect.org.au", "1800RESPECT", "Crisis support for domestic and family violence"),
        ]),
        SourceCategory("Debt & Financial", [
            ReferenceSource("https://www.revenue.nsw.gov.au", "Revenue NSW", "Fines, payment plans, financial hardship"),
            ReferenceSource("https://moneysmart.gov.au", "ASIC MoneySmart", "Financial hardship and debt guidance"),
        ]),
        SourceCategory("Migration", [
            ReferenceSource("https://immi.homeaffairs.gov.au", "Dept. of Home Affairs", "Visa, migration, and immigration information"),
        ]),
    ],
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
    reference_sources=[
        SourceCategory("NSW Health Authorities", [
            ReferenceSource("https://www.health.nsw.gov.au", "NSW Health", "Main NSW state health body — conditions, immunisation, mental health, hospital access"),
            ReferenceSource("https://www.cec.health.nsw.gov.au", "Clinical Excellence Commission", "Patient safety, infection prevention, medication safety, sepsis, clinical guidelines"),
            ReferenceSource("https://www.pathology.health.nsw.gov.au", "NSW Health Pathology", "Testing info, lab services, screening programs"),
        ]),
        SourceCategory("Federal Health Authorities", [
            ReferenceSource("https://www.health.gov.au", "Australian Dept. of Health", "Medicare, PBS, aged care, vaccination policy, national health alerts"),
            ReferenceSource("https://www.tga.gov.au", "Therapeutic Goods Administration", "Medicine approvals, safety recalls, vaccine approvals"),
            ReferenceSource("https://immunisationhandbook.health.gov.au", "Australian Immunisation Handbook", "Authoritative vaccination schedules used across NSW"),
        ]),
        SourceCategory("NSW Hospital & Service Access", [
            ReferenceSource("https://www.service.nsw.gov.au", "NSW Service Finder", "Public hospitals, community health centres, mental health services, testing clinics"),
            ReferenceSource("https://www.ambulance.nsw.gov.au", "NSW Ambulance", "Emergency ambulance services across NSW"),
            ReferenceSource("https://www.healthdirect.gov.au", "Healthdirect Australia", "Government-backed symptom checker, triage guidance, service finder"),
        ]),
        SourceCategory("Mental Health", [
            ReferenceSource("https://www.health.nsw.gov.au/mentalhealth", "NSW Mental Health Services", "NSW mental health service directory and resources"),
            ReferenceSource("https://www.lifeline.org.au", "Lifeline Australia", "24/7 crisis support — phone 13 11 14"),
            ReferenceSource("https://www.beyondblue.org.au", "Beyond Blue", "Mental health support, anxiety and depression resources"),
        ]),
        SourceCategory("Infectious Disease & Public Health", [
            ReferenceSource("https://www.health.nsw.gov.au/Infectious", "NSW Infectious Diseases", "COVID, influenza, measles, mpox, RSV guidance"),
            ReferenceSource("https://www.health.nsw.gov.au/news/Pages/alerts.aspx", "NSW Public Health Alerts", "Current outbreaks, food recalls, environmental health warnings"),
        ]),
        SourceCategory("Aged Care & Disability", [
            ReferenceSource("https://www.myagedcare.gov.au", "My Aged Care", "Aged care services, eligibility, and assessment for NSW residents"),
            ReferenceSource("https://www.ndis.gov.au", "NDIS", "National Disability Insurance Scheme — plans, supports, eligibility"),
        ]),
        SourceCategory("Medicines & Pharmacy", [
            ReferenceSource("https://www.pbs.gov.au", "PBS (Pharmaceutical Benefits Scheme)", "Medicine subsidies, safety net, brand/generic listings"),
            ReferenceSource("https://www.nps.org.au", "NPS MedicineWise", "Independent medicine info, drug interactions, consumer resources"),
        ]),
        SourceCategory("Women's & Maternal Health", [
            ReferenceSource("https://www.health.nsw.gov.au/women", "NSW Women's Health", "Maternity services, breast screening, reproductive health"),
        ]),
        SourceCategory("Indigenous Health", [
            ReferenceSource("https://www.ahmrc.org.au", "AH&MRC", "Aboriginal health research and community-controlled health services in NSW"),
            ReferenceSource("https://www.health.nsw.gov.au/aboriginal", "NSW Health — Aboriginal Health", "Closing the Gap, Aboriginal health workers, cultural safety"),
        ]),
        SourceCategory("Environmental Health", [
            ReferenceSource("https://www.health.nsw.gov.au/environment", "NSW Environmental Health", "Air quality, water safety, asbestos, chemical hazards"),
        ]),
        SourceCategory("Healthcare Complaints", [
            ReferenceSource("https://www.hccc.nsw.gov.au", "Health Care Complaints Commission", "Lodge complaints about health practitioners or facilities in NSW"),
        ]),
    ],
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
    reference_sources=[
        SourceCategory("Emergency & Immediate Help", [
            ReferenceSource("https://www.police.nsw.gov.au", "NSW Police Force", "Crime reporting, missing persons, public safety alerts, AVO information"),
            ReferenceSource("https://nsw.crimestoppers.com.au", "Crime Stoppers NSW", "Anonymous crime reporting — phone 1800 333 000"),
        ]),
        SourceCategory("Mental Health & Crisis Support", [
            ReferenceSource("https://www.health.nsw.gov.au/mentalhealth/services", "NSW Mental Health Line", "24/7 mental health support — phone 1800 011 511"),
            ReferenceSource("https://www.lifeline.org.au", "Lifeline", "24/7 crisis support and suicide prevention — phone 13 11 14"),
            ReferenceSource("https://www.1800respect.org.au", "1800RESPECT", "Domestic and family violence crisis support — phone 1800 737 732"),
            ReferenceSource("https://www.beyondblue.org.au", "Beyond Blue", "Mental health support for anxiety, depression, and wellbeing"),
            ReferenceSource("https://kidshelpline.com.au", "Kids Helpline", "Free counselling for young people 5–25 — phone 1800 55 1800"),
        ]),
        SourceCategory("Homelessness & Housing Crisis", [
            ReferenceSource("https://dcj.nsw.gov.au", "NSW Dept. of Communities & Justice", "Emergency accommodation, homelessness services, housing support"),
            ReferenceSource("https://www.missionaustralia.com.au", "Mission Australia", "Homelessness support, crisis accommodation, community services"),
            ReferenceSource("https://www.salvationarmy.org.au", "Salvation Army", "Emergency relief, food, shelter, and crisis support across NSW"),
        ]),
        SourceCategory("Disaster & Environmental Emergencies", [
            ReferenceSource("https://www.ses.nsw.gov.au", "NSW State Emergency Service", "Flood, storm, tsunami, and severe weather response"),
            ReferenceSource("https://www.rfs.nsw.gov.au", "NSW Rural Fire Service", "Bushfire alerts, fire danger ratings, live fire map"),
            ReferenceSource("https://www.nsw.gov.au/emergency", "NSW Emergency Dashboard", "Consolidated disaster alerts and emergency information"),
            ReferenceSource("https://www.bom.gov.au/nsw", "Bureau of Meteorology NSW", "Weather forecasts, severe weather warnings, flood watch"),
        ]),
        SourceCategory("Public Safety & Community Protection", [
            ReferenceSource("https://www.police.nsw.gov.au/crime/domestic_and_family_violence", "NSW Police — Domestic Violence", "AVO applications, DV reporting and community safety"),
            ReferenceSource("https://victimsservices.justice.nsw.gov.au", "Victims Services NSW", "Financial assistance, counselling, and court support for victims"),
            ReferenceSource("https://www.safework.nsw.gov.au", "SafeWork NSW", "Workplace health and safety incidents and reporting"),
        ]),
        SourceCategory("Community Services & Social Support", [
            ReferenceSource("https://www.service.nsw.gov.au", "Service NSW", "Central hub for government services, financial support, transport, licensing"),
            ReferenceSource("https://multicultural.nsw.gov.au", "Multicultural NSW", "Support and services for culturally and linguistically diverse communities"),
            ReferenceSource("https://www.aboriginalaffairs.nsw.gov.au", "Aboriginal Affairs NSW", "Services and support for Aboriginal communities across NSW"),
            ReferenceSource("https://www.carersnsw.org.au", "Carers NSW", "Support, advice, and resources for unpaid carers in NSW"),
        ]),
        SourceCategory("Financial Hardship & Support", [
            ReferenceSource("https://www.servicesaustralia.gov.au", "Services Australia (Centrelink)", "Income support, crisis payments, concession cards, family payments"),
            ReferenceSource("https://www.revenue.nsw.gov.au", "Revenue NSW", "Fines, payment plans, and financial hardship assistance"),
            ReferenceSource("https://ndh.org.au", "National Debt Helpline", "Free financial counselling — phone 1800 007 007"),
        ]),
        SourceCategory("Vulnerable Groups Support", [
            ReferenceSource("https://www.women.nsw.gov.au", "Women NSW", "Programs, services, and safety resources for women in NSW"),
            ReferenceSource("https://www.nsw.gov.au/youth", "Youth NSW", "Youth services, programs, and support across NSW"),
            ReferenceSource("https://www.health.nsw.gov.au/agedcare", "Ageing & Disability Services NSW", "Support services for older adults and people with disability"),
        ]),
    ],
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


def get_use_case_sources_prompt(use_case_id: str) -> str:
    """Format the use-case's reference sources as a prompt-friendly text block.

    Returns an empty string if the use-case has no sources.
    """
    uc = USE_CASE_REGISTRY.get(use_case_id)
    if not uc or not uc.reference_sources:
        return ""

    total_urls = sum(len(cat.sources) for cat in uc.reference_sources)
    lines = [f"\nPRE-CURATED REFERENCE SOURCES for {uc.name} ({total_urls} URLs):"]
    lines.append("These are authoritative, government-verified sources. The agent's "
                 "knowledge_bases MUST include these URLs so it can provide accurate, "
                 "up-to-date information to users.\n")

    for cat in uc.reference_sources:
        lines.append(f"  [{cat.category}]")
        for src in cat.sources:
            lines.append(f"    • {src.url} — {src.label}: {src.description}")
        lines.append("")

    return "\n".join(lines)


def get_use_case_sources_as_kb_configs(use_case_id: str) -> list[dict]:
    """Return the use-case's reference sources as knowledge_base config dicts.

    Each source becomes a KB entry suitable for the GeneratedBlueprint
    knowledge_bases list.
    """
    uc = USE_CASE_REGISTRY.get(use_case_id)
    if not uc or not uc.reference_sources:
        return []

    configs = []
    for cat in uc.reference_sources:
        for src in cat.sources:
            configs.append({
                "name": src.label,
                "description": f"[{cat.category}] {src.description}",
                "source_type": "url",
                "source_value": src.url,
                "chunk_size": 500,
                "chunk_overlap": 50,
            })
    return configs


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
