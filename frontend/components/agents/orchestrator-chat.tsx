"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Bot,
  Send,
  Sparkles,
  CheckCircle2,
  ArrowLeft,
  Loader2,
  Heart,
  Scale,
  LifeBuoy,
  Home,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Topbar } from "@/components/dashboard/topbar";

// ── Types ──────────────────────────────────────────────────────────────────

interface ChatMessage {
  id: string;
  role: "human" | "ai";
  content: string;
}

interface ChatResponse {
  thread_id: string;
  phase: string;
  message: string;
  blueprint?: Record<string, unknown> | null;
  assistant_id?: string | null;
  kb_id?: string | null;
  next_action: string;
}

// ── Use-case presets ───────────────────────────────────────────────────────

const USE_CASES = [
  {
    id: "healthcare",
    label: "Public Health",
    icon: Heart,
    color: "text-rose-400",
    bg: "bg-rose-500/10 border-rose-500/20 hover:border-rose-500/40",
    prompt:
      "I need a healthcare assistant that can help residents find GPs, understand Medicare, triage symptoms, and connect to mental health services in NSW.",
  },
  {
    id: "legal_aid",
    label: "Legal Aid",
    icon: Scale,
    color: "text-amber-400",
    bg: "bg-amber-500/10 border-amber-500/20 hover:border-amber-500/40",
    prompt:
      "I need a legal aid advisor for people who can't afford a lawyer. It should help with tenancy disputes, family law, consumer rights, and refer to Legal Aid NSW.",
  },
  {
    id: "crisis_support",
    label: "Crisis Support",
    icon: LifeBuoy,
    color: "text-blue-400",
    bg: "bg-blue-500/10 border-blue-500/20 hover:border-blue-500/40",
    prompt:
      "I need a crisis support agent for people in mental health crises, domestic violence situations, or financial hardship. It must be empathetic and escalate to human operators.",
  },
  {
    id: "housing_crisis",
    label: "Sydney Housing",
    icon: Home,
    color: "text-emerald-400",
    bg: "bg-emerald-500/10 border-emerald-500/20 hover:border-emerald-500/40",
    prompt:
      "I need an agent for Sydney's housing crisis. It should help with emergency accommodation, explain tenancy rights, check Rentstart eligibility, and navigate social housing.",
  },
];

// ── Phase display config ────────────────────────────────────────────────────

const PHASES = ["clarifying", "researching", "planning", "reviewing", "finalised"];

const PHASE_LABELS: Record<string, string> = {
  clarifying: "Clarifying",
  researching: "Researching",
  planning: "Planning",
  reviewing: "Reviewing",
  finalised: "Finalised",
  awaiting_name: "Finalised",
  saved: "Saved",
};

function PhaseBar({ phase }: { phase: string }) {
  const currentIdx = PHASES.indexOf(phase === "awaiting_name" ? "finalised" : phase);

  return (
    <div className="flex items-center gap-1 px-4 py-2 bg-[var(--card)] border-b border-[var(--border)]">
      {PHASES.map((p, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx;
        return (
          <div key={p} className="flex items-center gap-1">
            <div
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium transition-all ${
                done
                  ? "bg-emerald-500/15 text-emerald-400"
                  : active
                  ? "bg-indigo-500/15 text-indigo-400"
                  : "text-[var(--muted-foreground)]"
              }`}
            >
              {done && <CheckCircle2 className="w-2.5 h-2.5" />}
              {active && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
              {PHASE_LABELS[p] || p}
            </div>
            {i < PHASES.length - 1 && (
              <ChevronRight className="w-3 h-3 text-[var(--muted-foreground)]/40" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Blueprint preview ──────────────────────────────────────────────────────

function BlueprintPreview({ blueprint }: { blueprint: Record<string, unknown> }) {
  const nodes = (blueprint.nodes as unknown[]) || [];
  const tools = nodes.flatMap((n: unknown) => {
    const node = n as Record<string, unknown>;
    return ((node.tools as unknown[]) || []).map((t: unknown) => {
      const tool = t as Record<string, unknown>;
      return (tool.name as string) || String(t);
    });
  });
  const uniqueTools = [...new Set(tools)];

  return (
    <div className="mt-3 p-3 bg-indigo-500/5 border border-indigo-500/20 rounded-xl text-xs space-y-1.5">
      <p className="font-semibold text-indigo-400 flex items-center gap-1">
        <Sparkles className="w-3 h-3" /> Blueprint Generated
      </p>
      <p className="text-[var(--muted-foreground)]">
        <span className="text-[var(--foreground)] font-medium">
          {(blueprint.name as string) || "Untitled Agent"}
        </span>
        {" — "}
        {(blueprint.description as string) || ""}
      </p>
      <div className="flex flex-wrap gap-1 pt-1">
        <span className="px-1.5 py-0.5 bg-[var(--accent)] rounded text-[10px]">
          {nodes.length} node{nodes.length !== 1 ? "s" : ""}
        </span>
        {uniqueTools.slice(0, 5).map((t) => (
          <span key={t} className="px-1.5 py-0.5 bg-indigo-500/10 text-indigo-300 rounded text-[10px]">
            {t}
          </span>
        ))}
        {uniqueTools.length > 5 && (
          <span className="px-1.5 py-0.5 bg-[var(--accent)] rounded text-[10px]">
            +{uniqueTools.length - 5} more
          </span>
        )}
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

interface OrchestratorChatProps {
  /** When set, this message is auto-sent on mount (e.g. from the form wizard) */
  initialPrompt?: string;
  /** Use-case ID to scope the orchestrator (e.g. "legal_aid") */
  initialUseCase?: string;
}

export function OrchestratorChat({ initialPrompt, initialUseCase }: OrchestratorChatProps = {}) {
  const router = useRouter();

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [threadId, setThreadId] = useState<string | null>(null);
  const [phase, setPhase] = useState<string>("idle");
  const [blueprint, setBlueprint] = useState<Record<string, unknown> | null>(null);
  const [agentName, setAgentName] = useState("");
  const [savedId, setSavedId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const hasSentInitial = useRef(false);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-send the initial prompt from the form wizard (runs only once)
  useEffect(() => {
    if (initialPrompt && !hasSentInitial.current) {
      hasSentInitial.current = true;
      // Defer to next tick so sendMessage is fully initialised
      const t = setTimeout(() => sendMessage(initialPrompt, initialUseCase), 50);
      return () => clearTimeout(t);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sendMessage = useCallback(
    async (text: string, useCase?: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setInput("");
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "human", content: trimmed },
      ]);
      setLoading(true);

      try {
        const res = await fetch("/api/orchestrator", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            thread_id: threadId || undefined,
            use_case: useCase || undefined,
          }),
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: "Unknown error" }));
          throw new Error(err.error || `HTTP ${res.status}`);
        }

        const data: ChatResponse = await res.json();

        setThreadId(data.thread_id);
        setPhase(data.phase);

        if (data.blueprint) setBlueprint(data.blueprint);
        if (data.assistant_id) {
          setSavedId(data.assistant_id);
        }

        setMessages((prev) => [
          ...prev,
          { id: crypto.randomUUID(), role: "ai", content: data.message },
        ]);

        // If the agent was just saved, redirect after a short delay
        if (data.phase === "saved" && data.assistant_id) {
          setTimeout(() => {
            toast.success("Agent saved! Redirecting to your agents…");
            router.push("/agents");
          }, 2000);
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Something went wrong";
        toast.error(msg);
        setMessages((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            role: "ai",
            content: `Sorry, I ran into an error: ${msg}. Please try again.`,
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [loading, threadId, router]
  );

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleSave = () => {
    const confirmMsg =
      agentName.trim()
        ? `yes, call it ${agentName.trim()}`
        : "yes";
    sendMessage(confirmMsg);
  };

  const isIdle = phase === "idle";
  const isFinalised = phase === "finalised" || phase === "awaiting_name";
  const isSaved = phase === "saved" || savedId !== null;

  return (
    <div className="flex flex-col h-full">
      <Topbar
        title="Build with AI"
        subtitle="Describe your agent and let the orchestrator design it"
      />

      {/* Phase progress bar — shown once conversation starts */}
      {!isIdle && <PhaseBar phase={phase} />}

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-6 py-6 space-y-4">
        {/* Idle state — use-case picker */}
        {isIdle && messages.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex flex-col items-center text-center py-8 max-w-2xl mx-auto"
          >
            <div className="w-16 h-16 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4">
              <Sparkles className="w-8 h-8 text-indigo-400" />
            </div>
            <h2 className="text-xl font-semibold text-[var(--foreground)] mb-2">
              What kind of agent do you need?
            </h2>
            <p className="text-sm text-[var(--muted-foreground)] mb-8 max-w-sm">
              Pick a template to get started instantly, or describe your agent in plain English below.
            </p>

            {/* Use-case pills */}
            <div className="grid grid-cols-2 gap-3 w-full max-w-lg mb-6">
              {USE_CASES.map((uc) => {
                const Icon = uc.icon;
                return (
                  <button
                    key={uc.id}
                    onClick={() => sendMessage(uc.prompt, uc.id)}
                    className={`flex items-center gap-3 p-4 rounded-xl border transition-all text-left ${uc.bg}`}
                  >
                    <Icon className={`w-5 h-5 flex-shrink-0 ${uc.color}`} />
                    <span className="text-sm font-medium text-[var(--foreground)]">
                      {uc.label}
                    </span>
                  </button>
                );
              })}
            </div>

            <p className="text-xs text-[var(--muted-foreground)]">
              Or describe your own agent below ↓
            </p>
          </motion.div>
        )}

        {/* Conversation messages */}
        <AnimatePresence initial={false}>
          {messages.map((msg) => (
            <motion.div
              key={msg.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22 }}
              className={`flex ${msg.role === "human" ? "justify-end" : "justify-start"}`}
            >
              {msg.role === "ai" && (
                <div className="w-7 h-7 rounded-lg bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                  <Bot className="w-3.5 h-3.5 text-indigo-400" />
                </div>
              )}
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                  msg.role === "human"
                    ? "bg-indigo-600 text-white rounded-tr-sm"
                    : "bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-tl-sm"
                }`}
              >
                <div className="whitespace-pre-wrap">{msg.content}</div>
                {/* Show blueprint card on the finalised AI message */}
                {msg.role === "ai" && blueprint && isFinalised && (
                  <BlueprintPreview blueprint={blueprint} />
                )}
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* Loading indicator */}
        {loading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-start gap-2"
          >
            <div className="w-7 h-7 rounded-lg bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              >
                <Bot className="w-3.5 h-3.5 text-indigo-400" />
              </motion.div>
            </div>
            <div className="bg-[var(--card)] border border-[var(--border)] rounded-2xl rounded-tl-sm px-4 py-3">
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

      {/* Save / name input shown when blueprint is ready */}
      {isFinalised && !isSaved && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-6 pb-3 flex items-center gap-2 border-t border-[var(--border)] pt-3"
        >
          <Input
            value={agentName}
            onChange={(e) => setAgentName(e.target.value)}
            placeholder='Give your agent a name, e.g. "Housing Help Bot"'
            className="flex-1 bg-[var(--card)] border-[var(--border)] rounded-xl text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter") handleSave();
            }}
          />
          <Button
            onClick={handleSave}
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl px-4"
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4 mr-1.5" /> Save Agent
              </>
            )}
          </Button>
        </motion.div>
      )}

      {/* Success state */}
      {isSaved && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="px-6 pb-4 pt-3 border-t border-[var(--border)] flex items-center gap-3"
        >
          <CheckCircle2 className="w-5 h-5 text-emerald-400" />
          <span className="text-sm text-emerald-400 font-medium">Agent saved! Redirecting…</span>
        </motion.div>
      )}

      {/* Chat input — hidden when saved */}
      {!isSaved && !isFinalised && (
        <div className="px-6 pb-6 pt-3 border-t border-[var(--border)]">
          <div className="flex items-end gap-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3 focus-within:border-indigo-500/50 transition-all">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={
                messages.length === 0
                  ? "Describe the agent you want to build…"
                  : "Reply to continue…"
              }
              disabled={loading}
              rows={1}
              className="flex-1 bg-transparent border-0 p-0 resize-none text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus-visible:ring-0 max-h-32 overflow-y-auto"
            />
            <Button
              onClick={() => sendMessage(input)}
              disabled={!input.trim() || loading}
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-9 w-9 p-0 flex-shrink-0"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-center text-[var(--muted-foreground)] mt-2">
            Press{" "}
            <kbd className="px-1 py-0.5 bg-[var(--accent)] rounded text-[10px]">Enter</kbd> to
            send,{" "}
            <kbd className="px-1 py-0.5 bg-[var(--accent)] rounded text-[10px]">
              Shift+Enter
            </kbd>{" "}
            for new line
          </p>
        </div>
      )}

      {/* Back button when in conversation */}
      {messages.length > 0 && !isSaved && (
        <div className="px-6 pb-3">
          <button
            onClick={() => router.push("/agents")}
            className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
          >
            <ArrowLeft className="w-3 h-3" /> Back to agents (progress will be lost)
          </button>
        </div>
      )}
    </div>
  );
}
