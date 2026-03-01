"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Bot, Send, Sparkles, CheckCircle2, ArrowLeft, Loader2,
  Heart, Scale, LifeBuoy, Home, ChevronRight, Monitor, Cloud, Wrench,
  Zap, BookOpen, Search, Shield, MessageCircle, MapPin, BarChart3, Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Topbar } from "@/components/dashboard/topbar";
import { VoiceInputBtn } from "@/components/agents/voice-input-btn";



interface ChatMessage { id: string; role: "human" | "ai"; content: string; }
interface SSEPhaseEvent { phase: string; node: string; message?: string; thread_id?: string; }
interface ChatResponse {
  thread_id: string; phase: string; message: string;
  blueprint?: Record<string, unknown> | null;
  assistant_id?: string | null; kb_id?: string | null; next_action: string;
}

interface ModelProvider {
  id: string; label: string; icon: typeof Cloud;
  models: { value: string; label: string }[];
  color: string; bg: string; description: string;
}

const MODEL_PROVIDERS: ModelProvider[] = [
  {
    id: "mistral", label: "Mistral AI", icon: Cloud,
    models: [
      { value: "mistral-large-latest", label: "Mistral Large (Recommended)" },
      { value: "mistral-small-latest", label: "Mistral Small (Faster)" },
      { value: "open-mistral-7b", label: "Open Mistral 7B" },
    ],
    color: "text-orange-400",
    bg: "bg-orange-500/10 border-orange-500/20 hover:border-orange-500/40",
    description: "Cloud API - fast and powerful",
  },
  {
    id: "ollama", label: "Ollama (Local)", icon: Monitor,
    models: [
      { value: "qwen2.5:3b", label: "Qwen 2.5 3B (Fastest)" },
      { value: "qwen2.5:7b", label: "Qwen 2.5 7B" },
      { value: "llama3.1:8b", label: "Llama 3.1 8B" },
      { value: "mistral:7b", label: "Mistral 7B" },
      { value: "deepseek-r1:8b", label: "DeepSeek R1 8B" },
      { value: "gemma2:9b", label: "Gemma 2 9B" },
    ],
    color: "text-cyan-400",
    bg: "bg-cyan-500/10 border-cyan-500/20 hover:border-cyan-500/40",
    description: "Local inference - private and free",
  },
];

const USE_CASES = [
  { id: "healthcare", label: "Public Health", icon: Heart, color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20 hover:border-rose-500/40",
    prompt: "I need a healthcare assistant that can help residents find GPs, understand Medicare, triage symptoms, and connect to mental health services in NSW." },
  { id: "legal_aid", label: "Legal Aid", icon: Scale, color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20 hover:border-amber-500/40",
    prompt: "I need a legal aid advisor for people who can't afford a lawyer. It should help with tenancy disputes, family law, consumer rights, and refer to Legal Aid NSW." },
  { id: "crisis_support", label: "Crisis Support", icon: LifeBuoy, color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20 hover:border-blue-500/40",
    prompt: "I need a crisis support agent for people in mental health crises, domestic violence situations, or financial hardship. It must be empathetic and escalate to human operators." },
  { id: "housing_crisis", label: "Sydney Housing", icon: Home, color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/40",
    prompt: "I need an agent for Sydney housing crisis. It should help with emergency accommodation, explain tenancy rights, check Rentstart eligibility, and navigate social housing." },
];

const SKILL_ICONS: Record<string, typeof Zap> = {
  deep_research: Search,
  document_analysis: BookOpen,
  eligibility_assessment: BarChart3,
  crisis_response: Shield,
  step_by_step_guidance: Zap,
  empathetic_communication: MessageCircle,
  service_navigation: MapPin,
  comparative_analysis: BarChart3,
  knowledge_retrieval: Database,
};

const SKILL_COLORS: Record<string, { text: string; bg: string }> = {
  research: { text: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/20" },
  analysis: { text: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20" },
  assessment: { text: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/20" },
  safety: { text: "text-rose-400", bg: "bg-rose-500/10 border-rose-500/20" },
  communication: { text: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20" },
  navigation: { text: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
  knowledge: { text: "text-indigo-400", bg: "bg-indigo-500/10 border-indigo-500/20" },
  general: { text: "text-gray-400", bg: "bg-gray-500/10 border-gray-500/20" },
};

// ─── Markdown component map ───────────────────────────────────────────────────

const MD_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="text-base font-bold mb-2 mt-3 first:mt-0 border-b border-(--border) pb-1">{children}</h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-sm font-semibold mb-2 mt-3 first:mt-0">{children}</h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-sm font-semibold mb-1 mt-2 first:mt-0">{children}</h3>
  ),
  p: ({ children }) => <p className="mb-2.5 last:mb-0 leading-relaxed">{children}</p>,
  ul: ({ children }) => <ul className="list-disc pl-4 mb-2.5 space-y-1">{children}</ul>,
  ol: ({ children }) => <ol className="list-decimal pl-4 mb-2.5 space-y-1">{children}</ol>,
  li: ({ children }) => <li className="leading-relaxed">{children}</li>,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  em: ({ children }) => <em className="italic">{children}</em>,
  blockquote: ({ children }) => (
    <blockquote className="border-l-2 border-indigo-500/50 pl-3 my-2 italic text-(--muted-foreground)">{children}</blockquote>
  ),
  code: ({ children, className }) => (
    <code className={`bg-(--accent) rounded px-1 py-0.5 text-[11px] font-mono wrap-break-word ${className || ""}`}>{children}</code>
  ),
  pre: ({ children }) => (
    <pre className="mb-3 bg-(--accent) rounded-lg p-3 overflow-x-auto text-[11px] font-mono [&_code]:bg-transparent [&_code]:p-0 [&_code]:px-0">{children}</pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-3 rounded-lg border border-(--border)">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-(--accent)">{children}</thead>,
  tr: ({ children }) => <tr className="border-b border-(--border) last:border-0">{children}</tr>,
  th: ({ children }) => <th className="px-3 py-2 text-left font-semibold border-r border-(--border) last:border-r-0">{children}</th>,
  td: ({ children }) => <td className="px-3 py-2 border-r border-(--border) last:border-r-0">{children}</td>,
  a: ({ children, href }) => (
    <a href={href} target="_blank" rel="noopener noreferrer" className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2">{children}</a>
  ),
  hr: () => <hr className="border-(--border) my-3" />,
};

const PHASES = ["clarifying", "researching", "planning", "reviewing", "finalised"];
const PHASE_LABELS: Record<string, string> = {
  clarifying: "Clarifying", researching: "Researching", planning: "Planning",
  reviewing: "Reviewing", finalised: "Finalised", awaiting_name: "Finalised", saved: "Saved",
};
const PHASE_DESCRIPTIONS: Record<string, string> = {
  started: "Initializing session...", clarifying: "Understanding your requirements...",
  researching: "Researching best tools & architecture...", planning: "Generating agent blueprint...",
  reviewing: "Quality-checking the design...", finalised: "Blueprint ready!", continuing: "Processing your response...",
};

function PhaseBar({ phase }: { phase: string }) {
  const currentIdx = PHASES.indexOf(phase === "awaiting_name" ? "finalised" : phase);
  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-(--card) border-b border-(--border)">
      {PHASES.map((p, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={p} className="flex items-center gap-1">
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
              done ? "bg-emerald-500/15 text-emerald-400" : active ? "bg-indigo-500/15 text-indigo-400" : "text-(--muted-foreground)"
            }`}>
              {done && <CheckCircle2 className="w-2.5 h-2.5" />}
              {active && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
              {PHASE_LABELS[p] || p}
            </div>
            {i < PHASES.length - 1 && <ChevronRight className="w-3 h-3 text-(--muted-foreground)/40" />}
          </div>
        );
      })}
    </div>
  );
}

function StreamingStatus({ phase, node }: { phase: string; node: string }) {
  const desc = PHASE_DESCRIPTIONS[phase] || `Working on ${node}...`;
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }} className="mb-2">
      <div className="flex items-center gap-2 px-3 py-2 bg-indigo-500/5 border border-indigo-500/15 rounded-xl text-xs text-indigo-300">
        <Loader2 className="w-3 h-3 animate-spin shrink-0" />
        <span>{desc}</span>
        <span className="ml-auto text-[10px] text-(--muted-foreground) font-mono">{node}</span>
      </div>
    </motion.div>
  );
}

function BlueprintPreview({ blueprint }: { blueprint: Record<string, unknown> }) {
  const nodes = (blueprint.nodes as unknown[]) || [];
  const tools = nodes.flatMap((n: unknown) => {
    const nd = n as Record<string, unknown>;
    return ((nd.tools as unknown[]) || []).map((t: unknown) => {
      const tl = t as Record<string, unknown>;
      return (tl.name as string) || String(t);
    });
  });
  const skills = nodes.flatMap((n: unknown) => {
    const nd = n as Record<string, unknown>;
    return ((nd.skills as unknown[]) || []).map((s: unknown) => {
      const sl = s as Record<string, unknown>;
      return (sl.id as string) || String(s);
    });
  });
  const uniqueTools = [...new Set(tools)];
  const uniqueSkills = [...new Set(skills)];
  return (
    <div className="mt-3 p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl text-xs space-y-1.5">
      <p className="font-semibold text-indigo-400 flex items-center gap-1"><Sparkles className="w-3 h-3" /> Blueprint Generated</p>
      <p className="text-(--muted-foreground)">
        <span className="text-(--foreground) font-medium">{(blueprint.name as string) || "Untitled Agent"}</span>
        {" --- "}{(blueprint.description as string) || ""}
      </p>
      <div className="flex flex-wrap gap-1 pt-1">
        <span className="px-1.5 py-0.5 bg-(--accent) rounded text-[10px]">{nodes.length} node{nodes.length !== 1 ? "s" : ""}</span>
        {uniqueTools.slice(0, 5).map((t) => (
          <span key={t} className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-300 rounded text-[10px]">{t}</span>
        ))}
        {uniqueTools.length > 5 && <span className="px-1.5 py-0.5 bg-(--accent) rounded text-[10px]">+{uniqueTools.length - 5} more</span>}
      </div>
      {uniqueSkills.length > 0 && (
        <div className="flex flex-wrap gap-1 pt-0.5">
          <span className="px-1.5 py-0.5 bg-violet-500/10 text-violet-300 rounded text-[10px] font-medium">Skills:</span>
          {uniqueSkills.map((s) => (
            <span key={s} className="px-1.5 py-0.5 bg-violet-500/10 text-violet-300 rounded text-[10px]">{s.replace(/_/g, " ")}</span>
          ))}
        </div>
      )}
    </div>
  );
}

function parseSSE(text: string): { event: string; data: string }[] {
  const events: { event: string; data: string }[] = [];
  const blocks = text.split("\n\n").filter(Boolean);
  for (const block of blocks) {
    const lines = block.split("\n");
    let event = "message";
    let data = "";
    for (const line of lines) {
      if (line.startsWith("event: ")) event = line.slice(7);
      else if (line.startsWith("data: ")) data = line.slice(6);
    }
    if (data) events.push({ event, data });
  }
  return events;
}

interface OrchestratorChatProps {
  initialPrompt?: string;
  initialUseCase?: string;
}

export function OrchestratorChat({ initialPrompt, initialUseCase }: OrchestratorChatProps = {}) {
  const router = useRouter();
  const [modelProvider, setModelProvider] = useState("mistral");
  const [modelName, setModelName] = useState("mistral-large-latest");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>("idle");
  const [blueprint, setBlueprint] = useState<Record<string, unknown> | null>(null);
  const [agentName, setAgentName] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);
  const [streamingNode, setStreamingNode] = useState("");
  const [streamingPhase, setStreamingPhase] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasSentInitial = useRef(false);

  useEffect(() => { messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, loading, streamingPhase]);

  useEffect(() => {
    if (initialPrompt && !hasSentInitial.current) {
      hasSentInitial.current = true;
      const t = setTimeout(() => sendMessage(initialPrompt, initialUseCase), 50);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback(async (text: string, useCase?: string) => {
    const trimmed = text.trim();
    if (!trimmed || loading) return;
    setInput("");
    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "human", content: trimmed }]);
    setLoading(true);
    setStreamingNode("");
    setStreamingPhase("");
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/orchestrator/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmed,
          thread_id: threadId || undefined,
          use_case: useCase || undefined,
          model_provider: modelProvider,
          model_name: modelName,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Unknown error" }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }

      const contentType = res.headers.get("content-type") || "";
      if (contentType.includes("text/event-stream") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const parts = buffer.split("\n\n");
          buffer = parts.pop() || "";
          for (const part of parts) {
            if (!part.trim()) continue;
            const events = parseSSE(part + "\n\n");
            for (const { event, data } of events) {
              try {
                const parsed = JSON.parse(data);
                switch (event) {
                  case "phase": {
                    const pe = parsed as SSEPhaseEvent;
                    setStreamingNode(pe.node);
                    setStreamingPhase(pe.phase);
                    if (pe.thread_id) setThreadId(pe.thread_id);
                    if (PHASES.includes(pe.phase) || pe.phase === "awaiting_name") setPhase(pe.phase);
                    break;
                  }
                  case "blueprint":
                    if (parsed.blueprint) setBlueprint(parsed.blueprint);
                    break;
                  case "done": {
                    const resp = parsed as ChatResponse;
                    setThreadId(resp.thread_id);
                    setPhase(resp.phase);
                    if (resp.blueprint) setBlueprint(resp.blueprint);
                    if (resp.assistant_id) setSavedId(resp.assistant_id);
                    setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "ai", content: resp.message }]);
                    setStreamingNode("");
                    setStreamingPhase("");
                    if (resp.phase === "saved" && resp.assistant_id) {
                      setTimeout(() => { toast.success("Agent saved! Redirecting..."); router.push("/agents"); }, 2000);
                    }
                    break;
                  }
                  case "error":
                    throw new Error(parsed.error || "Stream error");
                }
              } catch (parseErr) { if (event === "error") throw parseErr; }
            }
          }
        }
      } else {
        const data: ChatResponse = await res.json();
        setThreadId(data.thread_id);
        setPhase(data.phase);
        if (data.blueprint) setBlueprint(data.blueprint);
        if (data.assistant_id) setSavedId(data.assistant_id);
        setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "ai", content: data.message }]);
        if (data.phase === "saved" && data.assistant_id) {
          setTimeout(() => { toast.success("Agent saved! Redirecting..."); router.push("/agents"); }, 2000);
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
      setMessages((prev) => [...prev, { id: crypto.randomUUID(), role: "ai", content: `Sorry, I ran into an error: ${msg}. Please try again.` }]);
    } finally {
      setLoading(false);
      setStreamingNode("");
      setStreamingPhase("");
    }
  }, [loading, threadId, router, modelProvider, modelName]);

  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(input); } };
  const handleSave = () => { sendMessage(agentName.trim() ? `yes, call it ${agentName.trim()}` : "yes"); };

  const isIdle = phase === "idle";
  const isFinalised = phase === "finalised" || phase === "awaiting_name";
  const isSaved = phase === "saved" || savedId !== null;
  const isStreaming = !!streamingNode && loading;
  const currentProvider = MODEL_PROVIDERS.find((p) => p.id === modelProvider) || MODEL_PROVIDERS[0];

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Build with AI" subtitle="Describe your agent and let the orchestrator design it" />
      {!isIdle && <PhaseBar phase={phase} />}

      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {isIdle && messages.length === 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col items-center text-center py-8 max-w-2xl mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-xl font-semibold text-(--foreground) mb-2">What kind of agent do you need?</h2>
            <p className="text-sm text-(--muted-foreground) mb-6 max-w-sm">Pick a template to get started instantly, or describe your agent in plain English below.</p>

            <div className="w-full max-w-lg mb-6">
              <p className="text-xs font-medium text-(--muted-foreground) mb-2 text-left">LLM Provider</p>
              <div className="grid grid-cols-2 gap-3 mb-3">
                {MODEL_PROVIDERS.map((prov) => {
                  const Icon = prov.icon;
                  const isActive = modelProvider === prov.id;
                  return (
                    <button key={prov.id}
                      onClick={() => { setModelProvider(prov.id); setModelName(prov.models[0].value); }}
                      className={`flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        isActive ? `${prov.bg} ring-1 ring-offset-0 ${prov.id === "mistral" ? "ring-orange-500/40" : "ring-cyan-500/40"}`
                        : "border-(--border) hover:border-(--foreground)/20"
                      }`}>
                      <Icon className={`w-5 h-5 shrink-0 ${isActive ? prov.color : "text-(--muted-foreground)"}`} />
                      <div>
                        <span className={`text-sm font-medium block ${isActive ? "text-(--foreground)" : "text-(--muted-foreground)"}`}>{prov.label}</span>
                        <span className="text-[10px] text-(--muted-foreground)">{prov.description}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
              <select value={modelName} onChange={(e) => setModelName(e.target.value)}
                className="w-full px-3 py-2 bg-(--card) border border-(--border) rounded-xl text-sm text-(--foreground) focus:outline-none focus:border-indigo-500/50">
                {currentProvider.models.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-3 w-full max-w-lg mb-6">
              {USE_CASES.map((uc) => {
                const Icon = uc.icon;
                return (
                  <button key={uc.id} onClick={() => sendMessage(uc.prompt, uc.id)}
                    className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${uc.bg}`}>
                    <Icon className={`w-5 h-5 shrink-0 ${uc.color}`} />
                    <span className="text-sm font-medium text-(--foreground)">{uc.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Skills showcase */}
            <div className="w-full max-w-lg mb-6">
              <p className="text-xs font-medium text-(--muted-foreground) mb-2 text-left flex items-center gap-1.5">
                <Zap className="w-3 h-3" /> Built-in Skills — auto-attached during build
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: "deep_research", name: "Deep Research", category: "research" },
                  { id: "document_analysis", name: "Doc Analysis", category: "analysis" },
                  { id: "eligibility_assessment", name: "Eligibility", category: "assessment" },
                  { id: "crisis_response", name: "Crisis Response", category: "safety" },
                  { id: "step_by_step_guidance", name: "Step-by-Step", category: "communication" },
                  { id: "empathetic_communication", name: "Empathetic", category: "communication" },
                  { id: "service_navigation", name: "Service Nav", category: "navigation" },
                  { id: "comparative_analysis", name: "Comparison", category: "analysis" },
                  { id: "knowledge_retrieval", name: "KB Retrieval", category: "knowledge" },
                ].map((skill) => {
                  const Icon = SKILL_ICONS[skill.id] || Zap;
                  const colors = SKILL_COLORS[skill.category] || SKILL_COLORS.general;
                  return (
                    <div key={skill.id} className={`flex items-center gap-2 px-2.5 py-2 rounded-lg border text-left ${colors.bg}`}>
                      <Icon className={`w-3.5 h-3.5 shrink-0 ${colors.text}`} />
                      <span className="text-[11px] font-medium text-(--foreground) truncate">{skill.name}</span>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-(--muted-foreground) mt-1.5 text-center">
                The orchestrator automatically selects relevant skills for your agent&apos;s nodes
              </p>
            </div>

            <p className="text-xs text-(--muted-foreground)">Or describe your own agent below</p>
            <Link
              href="/agents/manual"
              className="mt-3 flex items-center gap-1.5 text-xs text-(--muted-foreground) hover:text-(--foreground) transition-colors"
            >
              <Wrench className="w-3 h-3" />
              Prefer to build manually? Use the form builder →
            </Link>
          </motion.div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div key={msg.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.22 }}
              className={`flex ${msg.role === "human" ? "justify-end" : "justify-start"}`}>
              {msg.role === "ai" && (
                <div className="w-7 h-7 rounded-lg bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center mr-2 shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-indigo-400" />
                </div>
              )}
              <div className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                msg.role === "human" ? "bg-indigo-600 text-white rounded-tr-sm" : "bg-(--card) text-(--foreground) border border-(--border) rounded-tl-sm"
              }`}>
                {msg.role === "ai" ? (
                  <div className="prose-sm max-w-none">
                    <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                      {msg.content}
                    </ReactMarkdown>
                  </div>
                ) : (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
                {msg.role === "ai" && blueprint && isFinalised && <BlueprintPreview blueprint={blueprint} />}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        <AnimatePresence>{isStreaming && <StreamingStatus phase={streamingPhase} node={streamingNode} />}</AnimatePresence>

        {loading && !isStreaming && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex items-start gap-2">
            <div className="w-7 h-7 rounded-lg bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center shrink-0">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                <Bot className="w-3.5 h-3.5 text-indigo-400" />
              </motion.div>
            </div>
            <div className="bg-(--card) border border-(--border) rounded-2xl rounded-tl-sm px-4 py-3">
              <div className="flex items-center gap-1.5">
                <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:0ms]" />
                <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:150ms]" />
                <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce [animation-delay:300ms]" />
              </div>
            </div>
          </motion.div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {isFinalised && !isSaved && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="px-6 pb-3 flex items-center gap-2 border-t border-(--border) pt-3">
          <Input value={agentName} onChange={(e) => setAgentName(e.target.value)}
            placeholder='Give your agent a name, e.g. "Housing Help Bot"'
            className="flex-1 bg-(--card) border-(--border) rounded-xl text-sm"
            onKeyDown={(e) => { if (e.key === "Enter") handleSave(); }} />
          <Button onClick={handleSave} disabled={loading} className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4">
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <><CheckCircle2 className="w-4 h-4 mr-1.5" /> Save Agent</>}
          </Button>
        </motion.div>
      )}

      {isSaved && (
        <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="px-6 pb-4 pt-3 border-t border-(--border) flex items-center gap-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-sm text-emerald-400 font-medium">Agent saved! Redirecting...</span>
        </motion.div>
      )}

      {!isSaved && !isFinalised && (
        <div className="px-6 pb-6 pt-3 border-t border-(--border)">
          {!isIdle && (
            <div className="flex items-center gap-2 mb-2">
              <div className="flex items-center gap-1.5 px-2 py-1 bg-(--accent) rounded-lg text-[10px] text-(--muted-foreground)">
                {modelProvider === "ollama" ? <Monitor className="w-3 h-3" /> : <Cloud className="w-3 h-3" />}
                {currentProvider.label} - {modelName}
              </div>
            </div>
          )}
          <div className="flex items-end gap-2 bg-(--card) border border-(--border) rounded-2xl p-3 focus-within:border-indigo-500/50 transition-all">
            <Textarea value={input} onChange={(e) => setInput(e.target.value)} onKeyDown={handleKeyDown}
              placeholder={messages.length === 0 ? "Describe the agent you want to build..." : "Reply to continue..."}
              disabled={loading} rows={1}
              className="flex-1 bg-transparent border-0 p-0 resize-none text-sm text-(--foreground) placeholder:text-(--muted-foreground) focus-visible:ring-0 max-h-32 overflow-y-auto" />
            <VoiceInputBtn
              onTranscript={(text) => { setInput((prev) => (prev ? prev + " " + text : text)); }}
              onInterim={(text) => { setInput((prev) => { const base = prev.replace(/ ?\[…\]$/, ""); return text ? (base ? base + " " + text + " […]" : text + " […]") : base; }); }}
              disabled={loading}
            />
            <Button onClick={() => sendMessage(input)} disabled={!input.trim() || loading} size="sm"
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-9 w-9 p-0 shrink-0">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
            </Button>
          </div>
          <p className="text-xs text-center text-(--muted-foreground) mt-2">
            Press <kbd className="px-1 py-0.5 bg-(--accent) rounded text-[10px]">Enter</kbd> to send,{" "}
            <kbd className="px-1 py-0.5 bg-(--accent) rounded text-[10px]">Shift+Enter</kbd> for new line
          </p>
        </div>
      )}

      {messages.length > 0 && !isSaved && (
        <div className="px-6 pb-3">
          <button onClick={() => router.push("/agents")} className="flex items-center gap-1 text-xs text-(--muted-foreground) hover:text-(--foreground) transition-colors">
            <ArrowLeft className="w-3 h-3" /> Back to agents (progress will be lost)
          </button>
        </div>
      )}
    </div>
  );
}
