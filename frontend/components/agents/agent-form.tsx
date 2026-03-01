"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";
import { motion } from "framer-motion";
import { Save, ChevronRight, ChevronLeft, Eye, Shield, BookOpen, Upload, X, Globe, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { VoiceInputBtn } from "./voice-input-btn";

/** Simple accessible toggle — avoids Radix UI controlled-mode update loop */
function Toggle({ checked }: { checked: boolean }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      className={`pointer-events-none relative w-10 h-[22px] rounded-full transition-colors duration-200 flex-shrink-0 ${
        checked ? "bg-indigo-600" : "bg-[var(--border)]"
      }`}
    >
      <span
        className={`absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
          checked ? "translate-x-[18px]" : "translate-x-0"
        }`}
      />
    </div>
  );
}

const schema = z.object({
  name: z.string().min(1, "Name required"),
  description: z.string().optional(),
  model: z.string().min(1),
  systemPrompt: z.string().min(1, "System prompt required"),
});
type FormData = z.infer<typeof schema>;

const TOOLS = [
  { id: "web_search", label: "Web Search", description: "Search the internet for information" },
  { id: "calculator", label: "Calculator", description: "Perform math calculations" },
  { id: "document_reader", label: "Document Reader", description: "Read uploaded documents" },
  { id: "text_formatter", label: "Text Formatter", description: "Format and structure text" },
];

const MODELS = [
  { value: "mistral-large-latest", label: "Mistral Large (Recommended)" },
  { value: "mistral-small-latest", label: "Mistral Small (Faster)" },
  { value: "open-mistral-7b", label: "Open Mistral 7B (Lightweight)" },
];

interface AgentFormProps {
  initial?: {
    id: string;
    name: string;
    description: string | null;
    model: string;
    systemPrompt: string;
    tools: string;
    guardrails: string;
    knowledgeBase?: string;
  };
  /** When provided, a "Build with AI" button appears on the Review step */
  onBuildWithAI?: (prompt: string, useCase?: string) => void;
}

const TEMPLATE_TO_USE_CASE: Record<string, string> = {
  "Healthcare Assistant": "healthcare",
  "Legal Aid Advisor": "legal_aid",
  "Crisis and Community Support": "crisis_support",
  "NSW Housing Crisis Advisor": "housing_crisis",
};

function buildOrchestratorPrompt({
  name,
  description,
  model,
  systemPrompt,
  tools,
  guardrails,
  knowledgeBase,
  template,
}: {
  name: string;
  description?: string;
  model: string;
  systemPrompt: string;
  tools: string[];
  guardrails: { toxicity: boolean; pii: boolean; maxTokens: boolean; customInstructions: string };
  knowledgeBase: { context: string; templateSources: { url: string; label: string; description: string; category: string }[]; customUrls: string[] };
  template: string | null;
}): string {
  const parts: string[] = ["Build an AI agent with these specifications:"];
  parts.push(`\nName: ${name}`);
  if (description) parts.push(`Description: ${description}`);
  if (template) parts.push(`Based on template: ${template}`);
  parts.push(`Model: ${model}`);
  parts.push(`\nSystem Prompt:\n${systemPrompt}`);

  if (tools.length > 0) parts.push(`\nTools: ${tools.join(", ")}`);

  const activeGuardrails: string[] = [];
  if (guardrails.toxicity) activeGuardrails.push("Toxicity Filter");
  if (guardrails.pii) activeGuardrails.push("PII Redaction");
  if (guardrails.maxTokens) activeGuardrails.push("Response Length Limit");
  if (activeGuardrails.length > 0) parts.push(`\nGuardrails: ${activeGuardrails.join(", ")}`);
  if (guardrails.customInstructions) parts.push(`Custom rules:\n${guardrails.customInstructions}`);

  if (knowledgeBase.context) parts.push(`\nKnowledge Base Context:\n${knowledgeBase.context}`);

  const allUrls = [
    ...knowledgeBase.templateSources.map((s) => `${s.url} — ${s.label}: ${s.description}`),
    ...knowledgeBase.customUrls,
  ];
  if (allUrls.length > 0) {
    parts.push(`\nReference Sources (${allUrls.length} URLs):`);
    allUrls.forEach((u) => parts.push(`- ${u}`));
  }

  parts.push("\nPlease use these specifications as the foundation and generate an optimised, production-ready agent blueprint that incorporates all the reference sources, guardrails, and domain context.");
  return parts.join("\n");
}

const STEPS = ["Basic Info", "Model", "System Prompt", "Tools", "Knowledge Base", "Guardrails", "Review"];

const TEMPLATES: Record<string, { name: string; description: string; systemPrompt: string }> = {
  "Healthcare Assistant": {
    name: "Public Health Assistant",
    description: "24/7 symptom triage and patient support",
    systemPrompt: "You are a compassionate public health assistant. Help users understand their symptoms, provide general health information, and guide them to appropriate medical resources. Always recommend professional medical consultation for serious symptoms. Never diagnose conditions. Be empathetic and clear.",
  },
  "Legal Aid Advisor": {
    name: "Legal Aid Intake Agent",
    description: "Client intake and case type identification",
    systemPrompt: "You are a legal aid intake specialist. Gather information from clients about their legal issues, identify the type of legal matter (family, housing, employment, etc.), explain their rights in plain language, and help them understand next steps. Always recommend speaking with a qualified lawyer for advice on their specific case.",
  },
  "Crisis and Community Support": {
    name: "Crisis & Community Support Agent",
    description: "Mental health first-response with escalation",
    systemPrompt: "You are a compassionate crisis support specialist. Provide empathetic first-response support for people experiencing mental health crises. Listen actively, validate feelings, offer coping strategies, and immediately escalate to emergency services or human counselors when there is risk to life. Always prioritise safety.",
  },
  "NSW Housing Crisis Advisor": {
    name: "Sydney Housing Crisis Advisor",
    description: "Sydney housing rights and assistance guide",
    systemPrompt: "You are a knowledgeable Sydney housing advisor. Help residents navigate housing assistance, emergency accommodation options, tenant rights under NSW law, and government support programs. Provide specific, actionable information about Sydney services and escalate to human case workers for complex situations.",
  },
};

const TEMPLATE_SOURCE_URLS: Record<string, { category: string; sources: { url: string; label: string; description: string }[] }[]> = {
  "Healthcare Assistant": [
    {
      category: "NSW Health Authorities",
      sources: [
        { url: "https://www.health.nsw.gov.au", label: "NSW Health", description: "Main NSW state health body — conditions, immunisation, mental health, hospital access" },
        { url: "https://www.cec.health.nsw.gov.au", label: "Clinical Excellence Commission", description: "Patient safety, infection prevention, medication safety, sepsis, clinical guidelines" },
        { url: "https://www.pathology.health.nsw.gov.au", label: "NSW Health Pathology", description: "Testing info, lab services, screening programs" },
      ],
    },
    {
      category: "Federal Health Authorities",
      sources: [
        { url: "https://www.health.gov.au", label: "Australian Dept. of Health", description: "Medicare, PBS, aged care, vaccination policy, national health alerts" },
        { url: "https://www.tga.gov.au", label: "Therapeutic Goods Administration", description: "Medicine approvals, safety recalls, vaccine approvals" },
        { url: "https://immunisationhandbook.health.gov.au", label: "Australian Immunisation Handbook", description: "Authoritative vaccination schedules used across NSW" },
      ],
    },
    {
      category: "NSW Hospital & Service Access",
      sources: [
        { url: "https://www.service.nsw.gov.au", label: "NSW Service Finder", description: "Public hospitals, community health centres, mental health services, testing clinics" },
        { url: "https://www.ambulance.nsw.gov.au", label: "NSW Ambulance", description: "Emergency ambulance services across NSW" },
        { url: "https://www.healthdirect.gov.au", label: "Healthdirect Australia", description: "Government-backed symptom checker, triage guidance, service finder" },
      ],
    },
    {
      category: "Mental Health",
      sources: [
        { url: "https://www.health.nsw.gov.au/mentalhealth", label: "NSW Mental Health Services", description: "NSW mental health service directory and resources" },
        { url: "https://www.lifeline.org.au", label: "Lifeline Australia", description: "24/7 crisis support — phone 13 11 14" },
        { url: "https://www.beyondblue.org.au", label: "Beyond Blue", description: "Mental health support, anxiety and depression resources" },
      ],
    },
    {
      category: "Infectious Disease & Public Health",
      sources: [
        { url: "https://www.health.nsw.gov.au/Infectious", label: "NSW Infectious Diseases", description: "COVID, influenza, measles, mpox, RSV guidance" },
        { url: "https://www.health.nsw.gov.au/news/Pages/alerts.aspx", label: "NSW Public Health Alerts", description: "Current outbreaks, food recalls, environmental health warnings" },
      ],
    },
    {
      category: "Aged Care & Disability",
      sources: [
        { url: "https://www.myagedcare.gov.au", label: "My Aged Care", description: "Aged care services, eligibility, and assessment for NSW residents" },
        { url: "https://www.ndis.gov.au", label: "NDIS", description: "National Disability Insurance Scheme — plans, supports, eligibility" },
      ],
    },
    {
      category: "Medicines & Pharmaceutical",
      sources: [
        { url: "https://www.pbs.gov.au", label: "PBS", description: "Pharmaceutical Benefits Scheme — subsidised medications and cost estimates" },
        { url: "https://www.health.nsw.gov.au/aod/Pages/opioid-treatment.aspx", label: "NSW Opioid Treatment", description: "NSW opioid treatment programs and support" },
      ],
    },
    {
      category: "Women's & Family Health",
      sources: [
        { url: "https://www.health.nsw.gov.au/women", label: "NSW Women's Health", description: "Women's health services and information across NSW" },
        { url: "https://www.fpnsw.org.au", label: "Family Planning NSW", description: "Sexual and reproductive health, counselling, clinical services" },
      ],
    },
    {
      category: "Indigenous Health",
      sources: [
        { url: "https://www.health.nsw.gov.au/aboriginal", label: "NSW Aboriginal Health", description: "Aboriginal and Torres Strait Islander health programs in NSW" },
        { url: "https://www.amsnsw.org.au", label: "Aboriginal Medical Services NSW", description: "Aboriginal community-controlled health organisations across NSW" },
      ],
    },
    {
      category: "Environmental Health & Safety",
      sources: [
        { url: "https://www.foodauthority.nsw.gov.au", label: "NSW Food Authority", description: "Food safety standards, recalls, business compliance" },
        { url: "https://www.safework.nsw.gov.au", label: "SafeWork NSW", description: "Workplace health and safety regulations and guidance" },
      ],
    },
    {
      category: "Healthcare Complaints & Rights",
      sources: [
        { url: "https://www.hccc.nsw.gov.au", label: "Health Care Complaints Commission", description: "Lodge and resolve complaints about NSW health services" },
        { url: "https://www.ahpra.gov.au", label: "AHPRA", description: "Australian Health Practitioner Regulation Agency — practitioner registration" },
      ],
    },
  ],

  "Legal Aid Advisor": [
    {
      category: "Legal Aid & Services",
      sources: [
        { url: "https://www.legalaid.nsw.gov.au", label: "Legal Aid NSW", description: "Official legal aid — plain English guides, factsheets, referrals" },
        { url: "https://www.lawaccess.nsw.gov.au", label: "LawAccess NSW", description: "Free government legal info and triage pathways" },
        { url: "https://www.clcnsw.org.au", label: "NSW Community Legal Centres", description: "Find specialist legal centres (youth, immigration, tenancy)" },
      ],
    },
    {
      category: "NSW & Federal Legislation",
      sources: [
        { url: "https://legislation.nsw.gov.au", label: "NSW Legislation", description: "Official NSW Acts — Tenancy, Criminal, Family, Employment" },
        { url: "https://www.legislation.gov.au", label: "Federal Register of Legislation", description: "Commonwealth laws — Fair Work, Family Law, Privacy Act" },
        { url: "https://www.austlii.edu.au", label: "AustLII", description: "Free Australian case law — NSW/NCAT decisions and precedents" },
      ],
    },
    {
      category: "Tenancy & Housing",
      sources: [
        { url: "https://www.tenants.org.au", label: "Tenants' Union of NSW", description: "Tenancy guides, eviction process, notice periods, repairs" },
        { url: "https://www.ncat.nsw.gov.au", label: "NCAT", description: "NSW Civil & Administrative Tribunal — tenancy disputes" },
      ],
    },
    {
      category: "Courts",
      sources: [
        { url: "https://www.fcfcoa.gov.au", label: "Federal Circuit & Family Court", description: "Divorce, parenting disputes, domestic violence orders" },
        { url: "https://localcourt.nsw.gov.au", label: "Local Court NSW", description: "Criminal, civil, and AVO matters" },
      ],
    },
    {
      category: "Employment",
      sources: [
        { url: "https://www.fairwork.gov.au", label: "Fair Work Ombudsman", description: "Minimum wage, unfair dismissal, workplace rights" },
      ],
    },
    {
      category: "Domestic Violence",
      sources: [
        { url: "https://www.police.nsw.gov.au/crime/domestic_and_family_violence", label: "NSW Police — DV", description: "AVO information and reporting" },
        { url: "https://www.1800respect.org.au", label: "1800RESPECT", description: "Crisis support for domestic and family violence" },
      ],
    },
    {
      category: "Debt & Financial",
      sources: [
        { url: "https://www.revenue.nsw.gov.au", label: "Revenue NSW", description: "Fines, payment plans, financial hardship" },
        { url: "https://moneysmart.gov.au", label: "ASIC MoneySmart", description: "Financial hardship and debt guidance" },
      ],
    },
    {
      category: "Migration",
      sources: [
        { url: "https://immi.homeaffairs.gov.au", label: "Dept. of Home Affairs", description: "Visa, migration, and immigration information" },
      ],
    },
  ],

  "Crisis and Community Support": [
    {
      category: "Emergency & Immediate Help",
      sources: [
        { url: "https://www.police.nsw.gov.au", label: "NSW Police Force", description: "Crime reporting, missing persons, public safety alerts, AVO information" },
        { url: "https://nsw.crimestoppers.com.au", label: "Crime Stoppers NSW", description: "Anonymous crime reporting — phone 1800 333 000" },
      ],
    },
    {
      category: "Mental Health & Crisis Support",
      sources: [
        { url: "https://www.health.nsw.gov.au/mentalhealth/services", label: "NSW Mental Health Line", description: "24/7 mental health support — phone 1800 011 511" },
        { url: "https://www.lifeline.org.au", label: "Lifeline", description: "24/7 crisis support and suicide prevention — phone 13 11 14" },
        { url: "https://www.1800respect.org.au", label: "1800RESPECT", description: "Domestic and family violence crisis support — phone 1800 737 732" },
        { url: "https://www.beyondblue.org.au", label: "Beyond Blue", description: "Mental health support for anxiety, depression, and wellbeing" },
        { url: "https://kidshelpline.com.au", label: "Kids Helpline", description: "Free counselling for young people 5–25 — phone 1800 55 1800" },
      ],
    },
    {
      category: "Homelessness & Housing Crisis",
      sources: [
        { url: "https://dcj.nsw.gov.au", label: "NSW Dept. of Communities & Justice", description: "Emergency accommodation, homelessness services, housing support" },
        { url: "https://www.missionaustralia.com.au", label: "Mission Australia", description: "Homelessness support, crisis accommodation, community services" },
        { url: "https://www.salvationarmy.org.au", label: "Salvation Army", description: "Emergency relief, food, shelter, and crisis support across NSW" },
      ],
    },
    {
      category: "Disaster & Environmental Emergencies",
      sources: [
        { url: "https://www.ses.nsw.gov.au", label: "NSW State Emergency Service", description: "Flood, storm, tsunami, and severe weather response" },
        { url: "https://www.rfs.nsw.gov.au", label: "NSW Rural Fire Service", description: "Bushfire alerts, fire danger ratings, live fire map" },
        { url: "https://www.nsw.gov.au/emergency", label: "NSW Emergency Dashboard", description: "Consolidated disaster alerts and emergency information" },
        { url: "https://www.bom.gov.au/nsw", label: "Bureau of Meteorology NSW", description: "Weather forecasts, severe weather warnings, flood watch" },
      ],
    },
    {
      category: "Public Safety & Community Protection",
      sources: [
        { url: "https://www.police.nsw.gov.au/crime/domestic_and_family_violence", label: "NSW Police — Domestic Violence", description: "AVO applications, DV reporting and community safety" },
        { url: "https://victimsservices.justice.nsw.gov.au", label: "Victims Services NSW", description: "Financial assistance, counselling, and court support for victims" },
        { url: "https://www.safework.nsw.gov.au", label: "SafeWork NSW", description: "Workplace health and safety incidents and reporting" },
      ],
    },
    {
      category: "Community Services & Social Support",
      sources: [
        { url: "https://www.service.nsw.gov.au", label: "Service NSW", description: "Central hub for government services, financial support, transport, licensing" },
        { url: "https://multicultural.nsw.gov.au", label: "Multicultural NSW", description: "Support and services for culturally and linguistically diverse communities" },
        { url: "https://www.aboriginalaffairs.nsw.gov.au", label: "Aboriginal Affairs NSW", description: "Services and support for Aboriginal communities across NSW" },
        { url: "https://www.carersnsw.org.au", label: "Carers NSW", description: "Support, advice, and resources for unpaid carers in NSW" },
      ],
    },
    {
      category: "Financial Hardship & Support",
      sources: [
        { url: "https://www.servicesaustralia.gov.au", label: "Services Australia (Centrelink)", description: "Income support, crisis payments, concession cards, family payments" },
        { url: "https://www.revenue.nsw.gov.au", label: "Revenue NSW", description: "Fines, payment plans, and financial hardship assistance" },
        { url: "https://ndh.org.au", label: "National Debt Helpline", description: "Free financial counselling — phone 1800 007 007" },
      ],
    },
    {
      category: "Vulnerable Groups Support",
      sources: [
        { url: "https://www.women.nsw.gov.au", label: "Women NSW", description: "Programs, services, and safety resources for women in NSW" },
        { url: "https://www.nsw.gov.au/youth", label: "Youth NSW", description: "Youth services, programs, and support across NSW" },
        { url: "https://www.health.nsw.gov.au/agedcare", label: "Ageing & Disability Services NSW", description: "Support services for older adults and people with disability" },
      ],
    },
  ],

  "NSW Housing Crisis Advisor": [
    {
      category: "NSW Housing Authorities",
      sources: [
        { url: "https://dcj.nsw.gov.au", label: "NSW Dept. of Communities & Justice", description: "Social housing, emergency accommodation, Rent Choice, Start Safely, waitlist info" },
        { url: "https://www.housingpathways.nsw.gov.au", label: "NSW Housing Pathways", description: "Apply for social housing — eligibility rules, required documents, waiting times" },
      ],
    },
    {
      category: "Tenancy Law",
      sources: [
        { url: "https://legislation.nsw.gov.au", label: "NSW Legislation", description: "Residential Tenancies Act 2010, notice periods, eviction grounds, bond handling" },
      ],
    },
    {
      category: "Tribunal & Dispute Resolution",
      sources: [
        { url: "https://www.ncat.nsw.gov.au", label: "NCAT", description: "Challenge evictions, bond disputes, repair orders, payment plans" },
      ],
    },
    {
      category: "Tenancy Support",
      sources: [
        { url: "https://www.tenants.org.au", label: "Tenants' Union of NSW", description: "Plain English guides — eviction, rent increases, repairs, DV termination rights" },
        { url: "https://www.tenants.org.au/taas", label: "Tenants Advice & Advocacy Services", description: "Free tenant support and local advice centres across NSW" },
      ],
    },
    {
      category: "Homelessness & Emergency Housing",
      sources: [
        { url: "https://www.missionaustralia.com.au", label: "Mission Australia Housing", description: "Crisis accommodation, homelessness services across NSW" },
        { url: "https://www.salvationarmy.org.au", label: "Salvation Army Housing", description: "Emergency relief and housing support" },
        { url: "https://www.vinnies.org.au/nsw", label: "St Vincent de Paul NSW", description: "Emergency assistance, accommodation referrals, welfare support" },
      ],
    },
    {
      category: "Financial Assistance & Rental Relief",
      sources: [
        { url: "https://www.service.nsw.gov.au", label: "Service NSW", description: "Rent Choice, bond loans, rental subsidies, energy rebates" },
        { url: "https://www.servicesaustralia.gov.au", label: "Services Australia", description: "Commonwealth Rent Assistance, income support, crisis payments" },
        { url: "https://www.revenue.nsw.gov.au", label: "Revenue NSW", description: "Rental bond refunds, payment plans, financial hardship" },
      ],
    },
    {
      category: "Housing Statistics & Data",
      sources: [
        { url: "https://www.abs.gov.au", label: "Australian Bureau of Statistics", description: "Rental stress statistics, median rent trends, household income data" },
        { url: "https://www.planningportal.nsw.gov.au", label: "NSW Planning Portal", description: "Housing data, development applications, zoning information" },
      ],
    },
    {
      category: "Planning & Development",
      sources: [
        { url: "https://www.planning.nsw.gov.au", label: "NSW Dept. of Planning", description: "Housing supply policy, development frameworks, urban planning" },
      ],
    },
    {
      category: "Domestic Violence Housing Protections",
      sources: [
        { url: "https://dcj.nsw.gov.au", label: "Start Safely (DCJ)", description: "NSW housing program for domestic violence victim-survivors" },
        { url: "https://www.1800respect.org.au", label: "1800RESPECT", description: "DV support and referrals — phone 1800 737 732" },
      ],
    },
  ],
};

export function AgentForm({ initial, onBuildWithAI }: AgentFormProps) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [selectedTools, setSelectedTools] = useState<string[]>(
    initial ? JSON.parse(initial.tools || "[]") : []
  );
  const [guardrails, setGuardrails] = useState({
    toxicity: true,
    pii: true,
    maxTokens: false,
    customInstructions: "",
    instructionFileNames: [] as string[],
  });
  const [knowledgeBase, setKnowledgeBase] = useState({
    context: (() => {
      try { return JSON.parse(initial?.knowledgeBase || "{}").context || ""; } catch { return ""; }
    })(),
    fileNames: [] as string[],
    templateSources: [] as { url: string; label: string; description: string; category: string }[],
    customUrls: [] as string[],
  });
  const [urlInput, setUrlInput] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors } } = useForm<FormData>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: initial?.name || "",
      description: initial?.description || "",
      model: initial?.model || "mistral-large-latest",
      systemPrompt: initial?.systemPrompt || "",
    },
  });

  // Watch specific fields only — watching all fields with watch() causes infinite re-render loops
  const watchedName = watch("name");
  const watchedDescription = watch("description");
  const watchedModel = watch("model");
  const watchedSystemPrompt = watch("systemPrompt");

  const readFileAsText = (file: File): Promise<string> =>
    new Promise((resolve) => {
      if (file.type === "text/plain" || file.name.endsWith(".txt")) {
        const reader = new FileReader();
        reader.onload = (e) => resolve((e.target?.result as string) || "");
        reader.readAsText(file);
      } else {
        // PDF/DOCX: can't parse client-side without a library — store placeholder
        resolve(`[Attached: ${file.name} — content will be processed on save]`);
      }
    });

  const handleKbFiles = async (files: FileList | null) => {
    if (!files) return;
    const texts: string[] = [];
    const names: string[] = [];
    for (const file of Array.from(files)) {
      const text = await readFileAsText(file);
      texts.push(text);
      names.push(file.name);
    }
    setKnowledgeBase((prev) => ({
      ...prev,
      context: prev.context ? `${prev.context}\n\n${texts.join("\n\n")}` : texts.join("\n\n"),
      fileNames: [...prev.fileNames, ...names],
    }));
  };

  const handleGuardrailFiles = async (files: FileList | null) => {
    if (!files) return;
    const texts: string[] = [];
    const names: string[] = [];
    for (const file of Array.from(files)) {
      const text = await readFileAsText(file);
      texts.push(text);
      names.push(file.name);
    }
    setGuardrails((prev) => ({
      ...prev,
      customInstructions: prev.customInstructions
        ? `${prev.customInstructions}\n\n${texts.join("\n\n")}`
        : texts.join("\n\n"),
      instructionFileNames: [...prev.instructionFileNames, ...names],
    }));
  };

  const appendTranscript = (text: string) => {
    const current = watch("systemPrompt") || "";
    setValue("systemPrompt", current ? `${current} ${text}` : text, { shouldValidate: true });
  };

  const handleTemplateApply = (templateName: string) => {
    const tmpl = TEMPLATES[templateName];
    if (tmpl) {
      setValue("name", tmpl.name);
      setValue("description", tmpl.description);
      setValue("systemPrompt", tmpl.systemPrompt);
      setSelectedTemplate(templateName);
      const groups = TEMPLATE_SOURCE_URLS[templateName] || [];
      const sources = groups.flatMap((g) =>
        g.sources.map((s) => ({ ...s, category: g.category }))
      );
      setKnowledgeBase((prev) => ({ ...prev, templateSources: sources }));
    }
  };

  const handleAddUrl = () => {
    const url = urlInput.trim();
    if (!url) return;
    try {
      new URL(url);
      setKnowledgeBase((prev) => ({
        ...prev,
        customUrls: prev.customUrls.includes(url) ? prev.customUrls : [...prev.customUrls, url],
      }));
      setUrlInput("");
    } catch { /* invalid URL — ignore */ }
  };

  const onSubmit = async (data: FormData) => {
    setSaving(true);
    try {
      if (initial) {
        // Editing an existing agent — use CRUD endpoint
        const res = await fetch(`/api/agents/${initial.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            tools: selectedTools,
            guardrails: {
              toxicity: guardrails.toxicity,
              pii: guardrails.pii,
              maxTokens: guardrails.maxTokens,
              customInstructions: guardrails.customInstructions,
            },
            knowledgeBase: {
              context: knowledgeBase.context,
              urls: [
                ...knowledgeBase.templateSources.map((s) => s.url),
                ...knowledgeBase.customUrls,
              ],
            },
          }),
        });

        if (!res.ok) {
          const j = await res.json();
          throw new Error(j.error);
        }

        toast.success("Agent updated!");
      } else {
        // New agent — route through orchestrator for proper blueprint
        const useCase = selectedTemplate ? TEMPLATE_TO_USE_CASE[selectedTemplate] || undefined : undefined;

        const res = await fetch("/api/orchestrator/build", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            tools: selectedTools,
            guardrails: {
              toxicity: guardrails.toxicity,
              pii: guardrails.pii,
              maxTokens: guardrails.maxTokens,
              customInstructions: guardrails.customInstructions,
            },
            knowledgeBase: {
              context: knowledgeBase.context,
              urls: [
                ...knowledgeBase.templateSources.map((s) => s.url),
                ...knowledgeBase.customUrls,
              ],
            },
            use_case: useCase,
            model_provider: "mistral",
          }),
        });

        if (!res.ok) {
          const j = await res.json();
          throw new Error(j.error);
        }

        toast.success("Agent created with optimised blueprint! 🎉");
      }

      router.push("/agents");
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to save agent");
    } finally {
      setSaving(false);
    }
  };

  const canProceed = () => {
    if (step === 0) return watchedName?.trim().length > 0;
    if (step === 2) return watchedSystemPrompt?.trim().length > 0;
    return true;
  };

  return (
    <form className="flex flex-col h-full">
      {/* Step indicator */}
      <div className="px-6 py-4 border-b border-[var(--border)]">
        <div className="flex items-center gap-1">
          {STEPS.map((s, i) => (
            <div key={s} className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => i <= step && setStep(i)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all ${
                  i === step
                    ? "bg-indigo-600 text-white"
                    : i < step
                    ? "bg-indigo-600/15 text-indigo-400 cursor-pointer"
                    : "text-[var(--muted-foreground)] cursor-not-allowed"
                }`}
              >
                <span className={`w-4 h-4 rounded-full flex items-center justify-center text-[10px] ${i === step ? "bg-white/20" : ""}`}>
                  {i < step ? "✓" : i + 1}
                </span>
                <span className="hidden sm:inline">{s}</span>
              </button>
              {i < STEPS.length - 1 && (
                <div className={`h-0.5 w-4 rounded-full ${i < step ? "bg-indigo-600" : "bg-[var(--border)]"}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Step content */}
      <div className="flex-1 overflow-y-auto p-6">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25 }}
          className="max-w-2xl mx-auto space-y-6"
        >
          {/* Step 0: Basic Info */}
          {step === 0 && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-[var(--foreground)] mb-1">Basic Information</h2>
                <p className="text-[var(--muted-foreground)] text-sm">Give your agent a name and optional description to identify it later. This helps you and others understand its purpose.</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label className="text-sm text-[var(--foreground)]">Agent Name *</Label>
                  <Input
                    placeholder="e.g. Public Health Assistant"
                    className="bg-[var(--card)] border-[var(--border)] rounded-xl"
                    {...register("name")}
                  />
                  {errors.name && <p className="text-red-400 text-xs">{errors.name.message}</p>}
                </div>

                <div className="space-y-2">
                  <Label className="text-sm text-[var(--foreground)]">Description (optional)</Label>
                  <Input
                    placeholder="What does this agent do?"
                    className="bg-[var(--card)] border-[var(--border)] rounded-xl"
                    {...register("description")}
                  />
                </div>
              </div>

              {/* Templates */}
              <div className="space-y-3">
                <p className="text-sm text-[var(--muted-foreground)]">Or start from a template:</p>
                <div className="grid grid-cols-2 gap-2">
                  {Object.keys(TEMPLATES).map((tmpl) => (
                    <button
                      key={tmpl}
                      type="button"
                      onClick={() => handleTemplateApply(tmpl)}
                      className={`text-left p-3 rounded-xl border transition-all text-sm ${
                        selectedTemplate === tmpl
                          ? "border-indigo-500 bg-indigo-500/10 text-indigo-400"
                          : "border-[var(--border)] hover:border-indigo-500/40 hover:bg-indigo-500/5 text-[var(--foreground)]"
                      }`}
                    >
                      {tmpl}
                    </button>
                  ))}
                </div>

                {/* Web sources preview for selected template */}
                {selectedTemplate && TEMPLATE_SOURCE_URLS[selectedTemplate] && (
                  <div className="rounded-xl border border-cyan-500/20 overflow-hidden">
                    <div className="px-4 py-2.5 bg-cyan-500/5 border-b border-cyan-500/10 flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-xs font-semibold text-cyan-400">Web sources included with this template</span>
                      <span className="ml-auto text-xs text-[var(--muted-foreground)]">
                        {TEMPLATE_SOURCE_URLS[selectedTemplate].reduce((sum, g) => sum + g.sources.length, 0)} sources · editable in Knowledge Base step
                      </span>
                    </div>
                    {TEMPLATE_SOURCE_URLS[selectedTemplate].map((group) => (
                      <div key={group.category} className="border-b last:border-b-0 border-[var(--border)]">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] px-4 py-1.5 bg-[var(--accent)]/40">
                          {group.category}
                        </p>
                        {group.sources.map((s) => (
                          <div key={s.url} className="flex items-start gap-3 px-4 py-2 hover:bg-[var(--accent)]/40">
                            <Globe className="w-3 h-3 text-cyan-400 mt-0.5 flex-shrink-0" />
                            <div className="min-w-0">
                              <p className="text-xs font-medium text-[var(--foreground)]">{s.label}</p>
                              <p className="text-[10px] text-[var(--muted-foreground)] truncate">{s.url}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step 1: Model */}
          {step === 1 && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-[var(--foreground)] mb-1">Choose Model</h2>
                <p className="text-[var(--muted-foreground)] text-sm">Select the AI model powering your agent. Models differ in speed, cost, and capability — choose one that fits your needs.</p>
              </div>
              <div className="space-y-3">
                {MODELS.map((m) => (
                  <label
                    key={m.value}
                    className={`flex items-center gap-4 p-4 rounded-xl border cursor-pointer transition-all ${
                      watchedModel === m.value
                        ? "border-indigo-500 bg-indigo-500/10"
                        : "border-[var(--border)] hover:border-[var(--ring)]/30"
                    }`}
                  >
                    <input type="radio" {...register("model")} value={m.value} className="sr-only" />
                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                      watchedModel === m.value ? "border-indigo-500 bg-indigo-500" : "border-[var(--border)]"
                    }`}>
                      {watchedModel === m.value && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                    </div>
                    <span className="text-[var(--foreground)] text-sm font-medium">{m.label}</span>
                  </label>
                ))}
              </div>
            </>
          )}

          {/* Step 2: System Prompt */}
          {step === 2 && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-[var(--foreground)] mb-1">System Prompt</h2>
                <p className="text-[var(--muted-foreground)] text-sm">
                  Define how your agent should behave; this is the “brain” that guides responses. You can type or hold the mic button to speak your instructions.
                </p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="text-sm text-[var(--foreground)]">Prompt *</Label>
                  <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
                    <VoiceInputBtn onTranscript={appendTranscript} />
                    <span>Hold mic to speak</span>
                  </div>
                </div>
                <Textarea
                  placeholder="You are a helpful assistant that... Be empathetic and clear. Always recommend professional consultation for complex cases..."
                  className="bg-[var(--card)] border-[var(--border)] rounded-xl min-h-[200px] resize-none"
                  {...register("systemPrompt")}
                />
                {errors.systemPrompt && <p className="text-red-400 text-xs">{errors.systemPrompt.message}</p>}
                <p className="text-xs text-[var(--muted-foreground)]">
                  {watchedSystemPrompt?.length || 0} characters
                </p>
              </div>
            </>
          )}

          {/* Step 3: Tools */}
          {step === 3 && (
            <>
              <div>
                <h2 className="text-xl font-semibold text-[var(--foreground)] mb-1">Tools</h2>
                <p className="text-[var(--muted-foreground)] text-sm">Select auxiliary features (tools) your agent can access, like web search or calculator. Only enable what the agent truly needs to reduce risk.</p>
              </div>
              <div className="space-y-3">
                {TOOLS.map((tool) => (
                  <button
                    key={tool.id}
                    type="button"
                    className={`w-full flex items-center justify-between p-4 rounded-xl border transition-all text-left ${
                      selectedTools.includes(tool.id)
                        ? "border-indigo-500/50 bg-indigo-500/5"
                        : "border-[var(--border)] hover:border-[var(--ring)]/30"
                    }`}
                    onClick={() =>
                      setSelectedTools((prev) =>
                        prev.includes(tool.id) ? prev.filter((t) => t !== tool.id) : [...prev, tool.id]
                      )
                    }
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">{tool.label}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{tool.description}</p>
                    </div>
                    <Toggle checked={selectedTools.includes(tool.id)} />
                  </button>
                ))}
              </div>
            </>
          )}

          {/* Step 4: Knowledge Base */}
          {step === 4 && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <BookOpen className="w-5 h-5 text-cyan-400" />
                <h2 className="text-xl font-semibold text-[var(--foreground)]">Knowledge Base</h2>
              </div>
              <p className="text-[var(--muted-foreground)] text-sm mb-6">
                Add background information or documents your agent can refer to when answering questions. This makes responses more accurate and context‑aware.
              </p>

              <div className="space-y-5">
                {/* Add link */}
                <div className="space-y-2">
                  <Label className="text-sm text-[var(--foreground)]">Add Link</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="https://example.gov.au/resources"
                      value={urlInput}
                      onChange={(e) => setUrlInput(e.target.value)}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddUrl(); } }}
                      className="bg-[var(--card)] border-[var(--border)] rounded-xl text-sm"
                    />
                    <Button
                      type="button"
                      onClick={handleAddUrl}
                      className="rounded-xl bg-cyan-600/15 text-cyan-400 hover:bg-cyan-600/25 border border-cyan-500/20 px-4"
                    >
                      Add
                    </Button>
                  </div>
                  {knowledgeBase.customUrls.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-1">
                      {knowledgeBase.customUrls.map((url) => (
                        <span key={url} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-400">
                          <Globe className="w-3 h-3 flex-shrink-0" />
                          <span className="max-w-[200px] truncate">{url}</span>
                          <button
                            type="button"
                            onClick={() => setKnowledgeBase((prev) => ({ ...prev, customUrls: prev.customUrls.filter((u) => u !== url) }))}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* File upload */}
                <div className="space-y-2">
                  <Label className="text-sm text-[var(--foreground)]">Upload Documents</Label>
                  <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-dashed border-[var(--border)] rounded-xl cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all">
                    <Upload className="w-6 h-6 text-[var(--muted-foreground)] mb-2" />
                    <span className="text-sm text-[var(--muted-foreground)]">Click to upload PDF, Word, or TXT files</span>
                    <span className="text-xs text-[var(--muted-foreground)]/60 mt-0.5">.pdf, .docx, .doc, .txt supported</span>
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.txt"
                      multiple
                      className="sr-only"
                      onChange={(e) => handleKbFiles(e.target.files)}
                    />
                  </label>
                  {knowledgeBase.fileNames.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {knowledgeBase.fileNames.map((name, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/20 text-xs text-cyan-400">
                          {name}
                          <button
                            type="button"
                            onClick={() => setKnowledgeBase((prev) => ({ ...prev, fileNames: prev.fileNames.filter((_, j) => j !== i) }))}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Context textarea */}
                <div className="space-y-2">
                  <Label className="text-sm text-[var(--foreground)]">Context / Description</Label>
                  <Textarea
                    placeholder="Describe what your agent should know. E.g. 'This agent serves Sydney residents. Key facts: ...' You can also paste text content here directly."
                    className="bg-[var(--card)] border-[var(--border)] rounded-xl min-h-[160px] resize-none"
                    value={knowledgeBase.context}
                    onChange={(e) => setKnowledgeBase((prev) => ({ ...prev, context: e.target.value }))}
                  />
                  <p className="text-xs text-[var(--muted-foreground)]">{knowledgeBase.context.length} characters</p>
                </div>

                {/* Template source URLs — bottom, only shown when a template with sources is active */}
                {knowledgeBase.templateSources.length > 0 && (
                  <div className="rounded-xl border border-cyan-500/20 overflow-hidden">
                    <div className="px-4 py-2 bg-cyan-500/5 border-b border-cyan-500/10 flex items-center gap-2">
                      <Globe className="w-3.5 h-3.5 text-cyan-400" />
                      <span className="text-xs font-semibold text-cyan-400">Template web sources</span>
                      <span className="ml-auto text-xs text-[var(--muted-foreground)]">{knowledgeBase.templateSources.length} sources</span>
                    </div>
                    {Object.entries(
                      knowledgeBase.templateSources.reduce((acc, s) => {
                        (acc[s.category] = acc[s.category] || []).push(s);
                        return acc;
                      }, {} as Record<string, typeof knowledgeBase.templateSources>)
                    ).map(([cat, sources]) => (
                      <div key={cat} className="border-b last:border-b-0 border-[var(--border)]">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-[var(--muted-foreground)] px-4 py-1.5 bg-[var(--accent)]/40">{cat}</p>
                        {sources.map((s) => (
                          <div key={s.url} className="flex items-start gap-3 px-4 py-2.5 hover:bg-[var(--accent)]/40 group">
                            <Globe className="w-3.5 h-3.5 text-cyan-400 mt-0.5 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium text-[var(--foreground)]">{s.label}</p>
                              <p className="text-[11px] text-[var(--muted-foreground)]">{s.description}</p>
                              <span className="text-[10px] text-cyan-500 truncate block">{s.url}</span>
                            </div>
                            <button
                              type="button"
                              onClick={() => setKnowledgeBase((prev) => ({ ...prev, templateSources: prev.templateSources.filter((ts) => ts.url !== s.url) }))}
                              className="opacity-0 group-hover:opacity-100 transition-opacity mt-0.5"
                            >
                              <X className="w-3 h-3 text-[var(--muted-foreground)]" />
                            </button>
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {/* Step 5: Guardrails */}
          {step === 5 && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <Shield className="w-5 h-5 text-emerald-400" />
                <h2 className="text-xl font-semibold text-[var(--foreground)]">Guardrails</h2>
              </div>
              <p className="text-[var(--muted-foreground)] text-sm mb-3">Guardrails limit what the agent can say or do to protect users and help you comply with policies and laws.</p>
              <div className="text-[var(--muted-foreground)] text-xs mb-5 space-y-2">
                <p><strong>PII Redaction:</strong> Personal Identifiable Information (names, addresses, phone numbers, email, ID numbers) will be removed or masked from outputs to protect privacy.</p>
                <p><strong>Toxicity Filter:</strong> Prevents the agent from producing harmful, hateful, or offensive language.</p>
                <p><strong>Response Length:</strong> Restricts large outputs which can reduce accidental data exposure and keep replies concise.</p>
                <p><strong>Human-in-the-loop (HITL):</strong> High-risk conversations can be flagged for human review or escalation—use this for safety-critical agents.</p>
              </div>
              <div className="space-y-3">
                {[
                  { key: "toxicity" as const, label: "Toxicity Filter", description: "Blocks harmful, hateful, or offensive outputs. Helps avoid unsafe language and reduces reputational risk." },
                  { key: "pii" as const, label: "PII Redaction", description: "Automatically detects and redacts personal information (names, addresses, phone numbers, IDs) from agent replies to protect user privacy and comply with data rules." },
                  { key: "maxTokens" as const, label: "Response Length Limit", description: "Caps reply size to avoid very long responses, which helps prevent accidental exposure of sensitive data and reduces compute cost." },
                ].map((g) => (
                  <button
                    key={g.key}
                    type="button"
                    className="w-full flex items-center justify-between p-4 rounded-xl border border-[var(--border)] hover:border-[var(--ring)]/30 transition-colors text-left"
                    onClick={() => setGuardrails((prev) => ({ ...prev, [g.key]: !prev[g.key] }))}
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--foreground)]">{g.label}</p>
                      <p className="text-xs text-[var(--muted-foreground)]">{g.description}</p>
                    </div>
                    <Toggle checked={guardrails[g.key]} />
                  </button>
                ))}

                {/* Custom instructions textarea */}
                <div className="space-y-2 pt-2">
                  <Label className="text-sm text-[var(--foreground)]">Custom Instructions (optional)</Label>
                  <Textarea
                    placeholder="Add specific guardrail rules, e.g. 'Never discuss competitor products. Always redirect medical emergencies to 000. Do not provide legal advice.'"
                    className="bg-[var(--card)] border-[var(--border)] rounded-xl min-h-[120px] resize-none"
                    value={guardrails.customInstructions}
                    onChange={(e) => setGuardrails((prev) => ({ ...prev, customInstructions: e.target.value }))}
                  />
                </div>

                {/* File upload for guardrail docs */}
                <div className="space-y-2">
                  <Label className="text-sm text-[var(--foreground)]">Upload Policy Documents (optional)</Label>
                  <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-[var(--border)] rounded-xl cursor-pointer hover:border-emerald-500/50 hover:bg-emerald-500/5 transition-all">
                    <Upload className="w-5 h-5 text-[var(--muted-foreground)] mb-1.5" />
                    <span className="text-sm text-[var(--muted-foreground)]">Upload policy or compliance documents</span>
                    <span className="text-xs text-[var(--muted-foreground)]/60 mt-0.5">.pdf, .docx, .doc, .txt</span>
                    <input
                      type="file"
                      accept=".pdf,.docx,.doc,.txt"
                      multiple
                      className="sr-only"
                      onChange={(e) => handleGuardrailFiles(e.target.files)}
                    />
                  </label>
                  {guardrails.instructionFileNames.length > 0 && (
                    <div className="flex flex-wrap gap-2 mt-2">
                      {guardrails.instructionFileNames.map((name, i) => (
                        <span key={i} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-400">
                          {name}
                          <button
                            type="button"
                            onClick={() => setGuardrails((prev) => ({ ...prev, instructionFileNames: prev.instructionFileNames.filter((_, j) => j !== i) }))}
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Learn more about guardrails */}
                  <details className="mt-4 p-3 rounded-lg bg-[var(--card)] border border-[var(--border)] text-sm text-[var(--muted-foreground)]">
                    <summary className="cursor-pointer font-medium">Learn more about guardrails</summary>
                    <div className="mt-2 space-y-2 text-xs">
                      <p><strong>Why we redact PII:</strong> Personal data can be sensitive and is protected by privacy rules. Redaction reduces the risk of leaking private information in agent responses.</p>
                      <p><strong>What toxicity filtering does:</strong> Removes or blocks abusive, hateful, or harassing content so users are not exposed to harmful language.</p>
                      <p><strong>Human review / escalation:</strong> For safety‑critical scenarios you can enable workflows to flag conversations for human review before actioning them.</p>
                      <p><strong>Custom rules:</strong> Use the Custom Instructions field to add organisation‑specific policies (e.g., always route emergencies to 000).</p>
                    </div>
                  </details>
                </div>
              </div>
            </>
          )}

          {/* Step 6: Review */}
          {step === 6 && (
            <>
              <div className="flex items-center gap-2 mb-1">
                <Eye className="w-5 h-5 text-indigo-400" />
                <h2 className="text-xl font-semibold text-[var(--foreground)]">Review</h2>
              </div>
              <p className="text-[var(--muted-foreground)] text-sm mb-6">Review your agent configuration before saving.</p>

              <div className="space-y-4">
                {[
                  { label: "Name", value: watchedName },
                  { label: "Description", value: watchedDescription || "—" },
                  { label: "Model", value: watchedModel },
                  { label: "Tools", value: selectedTools.length > 0 ? selectedTools.join(", ") : "None" },
                  { label: "Guardrails", value: [guardrails.toxicity && "toxicity", guardrails.pii && "pii", guardrails.maxTokens && "maxTokens"].filter(Boolean).join(", ") || "None" },
                ].map((item) => (
                  <div key={item.label} className="flex gap-3 p-3 rounded-xl bg-[var(--accent)]">
                    <span className="text-sm text-[var(--muted-foreground)] w-24 flex-shrink-0">{item.label}</span>
                    <span className="text-sm text-[var(--foreground)] font-medium">{item.value}</span>
                  </div>
                ))}
                <div className="p-3 rounded-xl bg-[var(--accent)]">
                  <p className="text-sm text-[var(--muted-foreground)] mb-1">System Prompt</p>
                  <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap line-clamp-4">{watchedSystemPrompt}</p>
                </div>
                {(knowledgeBase.context || knowledgeBase.templateSources.length > 0 || knowledgeBase.customUrls.length > 0) && (
                  <div className="p-3 rounded-xl bg-[var(--accent)]">
                    <p className="text-sm text-[var(--muted-foreground)] mb-1">Knowledge Base</p>
                    {knowledgeBase.context && (
                      <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap line-clamp-3">{knowledgeBase.context}</p>
                    )}
                    {knowledgeBase.fileNames.length > 0 && (
                      <p className="text-xs text-cyan-400 mt-1">{knowledgeBase.fileNames.length} file(s) attached</p>
                    )}
                    {(knowledgeBase.templateSources.length > 0 || knowledgeBase.customUrls.length > 0) && (
                      <p className="text-xs text-cyan-400 mt-1">
                        {knowledgeBase.templateSources.length + knowledgeBase.customUrls.length} web source(s) configured
                      </p>
                    )}
                  </div>
                )}
                {guardrails.customInstructions && (
                  <div className="p-3 rounded-xl bg-[var(--accent)]">
                    <p className="text-sm text-[var(--muted-foreground)] mb-1">Custom Guardrail Instructions</p>
                    <p className="text-sm text-[var(--foreground)] whitespace-pre-wrap line-clamp-3">{guardrails.customInstructions}</p>
                  </div>
                )}
              </div>
            </>
          )}
        </motion.div>
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between p-6 border-t border-[var(--border)]">
        <Button
          type="button"
          variant="ghost"
          onClick={() => setStep((s) => Math.max(0, s - 1))}
          disabled={step === 0}
          className="rounded-xl"
        >
          <ChevronLeft className="w-4 h-4 mr-1" />
          Back
        </Button>

        {step < STEPS.length - 1 ? (
          <Button
            type="button"
            onClick={() => setStep((s) => s + 1)}
            disabled={!canProceed()}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl"
          >
            Continue
            <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            {/* "Build with AI" only shown on create (not edit) when parent provides the callback */}
            {!initial && onBuildWithAI && (
              <Button
                type="button"
                disabled={saving}
                onClick={() => {
                  const prompt = buildOrchestratorPrompt({
                    name: watchedName,
                    description: watchedDescription,
                    model: watchedModel,
                    systemPrompt: watchedSystemPrompt,
                    tools: selectedTools,
                    guardrails,
                    knowledgeBase,
                    template: selectedTemplate,
                  });
                  onBuildWithAI(prompt, selectedTemplate ? TEMPLATE_TO_USE_CASE[selectedTemplate] : undefined);
                }}
                className="bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-400 border border-indigo-500/30 rounded-xl px-4"
              >
                <Sparkles className="w-4 h-4 mr-1.5" />
                Build with AI
              </Button>
            )}
            <Button
              type="button"
              disabled={saving}
              onClick={handleSubmit(onSubmit)}
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-6"
            >
              {saving ? (
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Save className="w-4 h-4" />
                  {initial ? "Save Changes" : "Create Agent"}
                </div>
              )}
            </Button>
          </div>
        )}
      </div>
    </form>
  );
}
