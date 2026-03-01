"use client";

import { useState, useRef, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { Components } from "react-markdown";
import {
  Send,
  Bot,
  Volume2,
  VolumeX,
  Trash2,
  Copy,
  Check,
  Wifi,
  WifiOff,
  ChevronDown,
  Lock,
  Plus,
  Pencil,
  Loader2,
  MessageSquare,
  Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { VoiceInputBtn } from "@/components/agents/voice-input-btn";
import { Topbar } from "@/components/dashboard/topbar";

// ─── Types ───────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  voiceId?: string | null;
}

interface Message {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  timestamp: Date;
  toolName?: string;
}

interface SessionMeta {
  id: string;
  agentId: string;
  agentName: string;
  title: string;
  threadId: string;
  updatedAt: string;
}

interface SessionFull extends SessionMeta {
  messages: Array<{ id: string; role: string; content: string; createdAt: string }>;
}

// ─── Model lists ─────────────────────────────────────────────────────────────

const CHAT_MODELS = [
  { id: "mistral-large-latest", label: "Mistral Large", provider: "Mistral", available: true },
  { id: "mistral-small-latest", label: "Mistral Small", provider: "Mistral", available: true },
  { id: "open-mistral-7b", label: "Mistral 7B", provider: "Mistral", available: true },
  { id: "gpt-4o", label: "GPT-4o", provider: "OpenAI", available: false },
  { id: "gpt-4o-mini", label: "GPT-4o Mini", provider: "OpenAI", available: false },
  { id: "claude-opus-4-6", label: "Claude Opus", provider: "Anthropic", available: false },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet", provider: "Anthropic", available: false },
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", provider: "Google", available: false },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", provider: "Google", available: false },
  { id: "llama-3.3-70b", label: "Llama 3.3 70B", provider: "Meta", available: false },
  { id: "deepseek-r1", label: "DeepSeek R1", provider: "DeepSeek", available: false },
];

const VOICE_MODELS = [
  { id: "elevenlabs", label: "ElevenLabs", provider: "ElevenLabs", available: true },
  { id: "openai-tts-1-hd", label: "OpenAI TTS HD", provider: "OpenAI", available: false },
  { id: "openai-tts-1", label: "OpenAI TTS", provider: "OpenAI", available: false },
  { id: "google-wavenet", label: "Google WaveNet", provider: "Google", available: false },
  { id: "azure-neural", label: "Azure Neural TTS", provider: "Microsoft", available: false },
  { id: "aws-polly", label: "Amazon Polly", provider: "AWS", available: false },
  { id: "deepgram-aura", label: "Deepgram Aura", provider: "Deepgram", available: false },
];

const PROVIDER_COLORS: Record<string, string> = {
  Mistral: "text-orange-400",
  OpenAI: "text-emerald-400",
  Anthropic: "text-amber-400",
  Google: "text-blue-400",
  Meta: "text-indigo-400",
  DeepSeek: "text-cyan-400",
  ElevenLabs: "text-violet-400",
  Microsoft: "text-sky-400",
  AWS: "text-yellow-400",
  Deepgram: "text-teal-400",
};

// ─── Markdown component map ───────────────────────────────────────────────────

const MD_COMPONENTS: Components = {
  h1: ({ children }) => (
    <h1 className="text-base font-bold mb-2 mt-3 first:mt-0 border-b border-[var(--border)] pb-1">
      {children}
    </h1>
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
    <blockquote className="border-l-2 border-indigo-500/50 pl-3 my-2 italic text-[var(--muted-foreground)]">
      {children}
    </blockquote>
  ),
  code: ({ children, className }) => (
    <code
      className={`bg-[var(--accent)] rounded px-1 py-0.5 text-[11px] font-mono break-words ${className || ""}`}
    >
      {children}
    </code>
  ),
  pre: ({ children }) => (
    <pre className="mb-3 bg-[var(--accent)] rounded-lg p-3 overflow-x-auto text-[11px] font-mono [&_code]:bg-transparent [&_code]:p-0 [&_code]:px-0">
      {children}
    </pre>
  ),
  table: ({ children }) => (
    <div className="overflow-x-auto mb-3 rounded-lg border border-[var(--border)]">
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-[var(--accent)]">{children}</thead>,
  tr: ({ children }) => (
    <tr className="border-b border-[var(--border)] last:border-0">{children}</tr>
  ),
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold border-r border-[var(--border)] last:border-r-0">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-3 py-2 border-r border-[var(--border)] last:border-r-0">{children}</td>
  ),
  a: ({ children, href }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-indigo-400 hover:text-indigo-300 underline underline-offset-2"
    >
      {children}
    </a>
  ),
  hr: () => <hr className="border-[var(--border)] my-3" />,
};

// ─── SpeakerButton ───────────────────────────────────────────────────────────

function SpeakerButton({ text, voiceId }: { text: string; voiceId?: string | null }) {
  const [loading, setLoading] = useState(false);

  const speak = async () => {
    if (loading || !text) return;
    setLoading(true);
    try {
      const res = await fetch("/api/voice/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, ...(voiceId ? { voiceId } : {}) }),
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const audio = new Audio(url);
        audio.play();
        audio.onended = () => URL.revokeObjectURL(url);
      }
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      onClick={speak}
      disabled={loading}
      title="Listen"
      className="p-1 rounded hover:bg-[var(--accent)] text-[var(--muted-foreground)] hover:text-indigo-400 transition-colors disabled:opacity-50"
    >
      {loading ? (
        <Loader2 className="w-3 h-3 animate-spin" />
      ) : (
        <Volume2 className="w-3 h-3" />
      )}
    </button>
  );
}

// ─── SessionSidebar ──────────────────────────────────────────────────────────

function SessionSidebar({
  sessions,
  currentSessionId,
  onSelect,
  onNew,
  onRename,
  onDelete,
}: {
  sessions: SessionMeta[];
  currentSessionId: string | null;
  onSelect: (session: SessionMeta) => void;
  onNew: () => void;
  onRename: (id: string, title: string) => void;
  onDelete: (id: string) => void;
}) {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const commitRename = (id: string) => {
    if (renameValue.trim()) onRename(id, renameValue.trim());
    setRenamingId(null);
  };

  const timeAgo = (dateStr: string) => {
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="w-56 flex-shrink-0 border-r border-[var(--border)] flex flex-col bg-[var(--background)]">
      <div className="px-3 py-3 border-b border-[var(--border)]">
        <button
          onClick={onNew}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-400 text-xs font-medium transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 space-y-0.5">
        {sessions.length === 0 ? (
          <div className="flex flex-col items-center py-10 px-3 text-center">
            <MessageSquare className="w-6 h-6 text-[var(--muted-foreground)] mb-2 opacity-40" />
            <p className="text-[11px] text-[var(--muted-foreground)]">No conversations yet</p>
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => renamingId !== session.id && onSelect(session)}
              className={`group relative mx-2 px-3 py-2 rounded-xl cursor-pointer transition-colors ${
                currentSessionId === session.id
                  ? "bg-indigo-600/10 text-indigo-400"
                  : "hover:bg-[var(--accent)] text-[var(--foreground)]"
              }`}
            >
              {renamingId === session.id ? (
                <input
                  value={renameValue}
                  onChange={(e) => setRenameValue(e.target.value)}
                  onBlur={() => commitRename(session.id)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") commitRename(session.id);
                    if (e.key === "Escape") setRenamingId(null);
                  }}
                  autoFocus
                  className="w-full bg-transparent text-xs border-b border-indigo-500 outline-none pr-1"
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <>
                  <p className="text-xs font-medium truncate pr-10">{session.title}</p>
                  <p className="text-[10px] text-[var(--muted-foreground)] truncate">
                    {session.agentName} · {timeAgo(session.updatedAt)}
                  </p>
                  <div className="absolute right-2 top-1/2 -translate-y-1/2 hidden group-hover:flex items-center gap-0.5 bg-[var(--card)] rounded-lg p-0.5 border border-[var(--border)]">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setRenamingId(session.id);
                        setRenameValue(session.title);
                      }}
                      className="p-1 hover:text-indigo-400 rounded transition-colors"
                      title="Rename"
                    >
                      <Pencil className="w-2.5 h-2.5" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onDelete(session.id);
                      }}
                      className="p-1 hover:text-red-400 rounded transition-colors"
                      title="Delete"
                    >
                      <Trash2 className="w-2.5 h-2.5" />
                    </button>
                  </div>
                </>
              )}
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ─── ModelPicker ─────────────────────────────────────────────────────────────

function ModelPicker({
  label,
  models,
  selected,
  onSelect,
}: {
  label: string;
  models: typeof CHAT_MODELS;
  selected: string;
  onSelect: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const current = models.find((m) => m.id === selected) ?? models[0];

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-xl text-xs text-[var(--foreground)] hover:border-indigo-500/40 transition-all"
      >
        <span className={`text-[10px] font-semibold ${PROVIDER_COLORS[current.provider]}`}>
          {current.provider}
        </span>
        <span className="text-[var(--muted-foreground)]">·</span>
        <span className="font-medium">{current.label}</span>
        <ChevronDown
          className={`w-3 h-3 text-[var(--muted-foreground)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.12 }}
              className="absolute top-full left-0 mt-1 w-56 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl z-50 overflow-hidden"
            >
              <div className="px-3 py-2 border-b border-[var(--border)]">
                <p className="text-[10px] font-semibold text-[var(--muted-foreground)] uppercase tracking-wider">
                  {label}
                </p>
              </div>
              <div className="max-h-64 overflow-y-auto py-1">
                {models.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => {
                      if (m.available) {
                        onSelect(m.id);
                        setOpen(false);
                      }
                    }}
                    disabled={!m.available}
                    className={`w-full flex items-center justify-between px-3 py-2 text-xs transition-colors ${
                      m.available
                        ? selected === m.id
                          ? "bg-indigo-600/10 text-indigo-400"
                          : "hover:bg-[var(--accent)] text-[var(--foreground)]"
                        : "opacity-35 cursor-not-allowed text-[var(--muted-foreground)]"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[10px] font-semibold w-16 text-left ${PROVIDER_COLORS[m.provider]}`}
                      >
                        {m.provider}
                      </span>
                      <span>{m.label}</span>
                    </div>
                    {!m.available && <Lock className="w-2.5 h-2.5 flex-shrink-0" />}
                    {m.available && selected === m.id && (
                      <div className="w-1.5 h-1.5 rounded-full bg-indigo-400" />
                    )}
                  </button>
                ))}
              </div>
              <div className="px-3 py-2 border-t border-[var(--border)] bg-[var(--accent)]/50">
                <p className="text-[10px] text-[var(--muted-foreground)]">
                  <Lock className="w-2.5 h-2.5 inline mr-1" />
                  Locked providers coming soon
                </p>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── PlaygroundClient ─────────────────────────────────────────────────────────

export function PlaygroundClient({ agents }: { agents: Agent[] }) {
  const [selectedAgent, setSelectedAgent] = useState<Agent | null>(agents[0] ?? null);
  const [chatModel, setChatModel] = useState("mistral-large-latest");
  const [voiceModel, setVoiceModel] = useState("elevenlabs");
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [muted, setMuted] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("playgroundMuted") === "true";
    }
    return false;
  });
  const [backendOnline, setBackendOnline] = useState<boolean | null>(null);
  const [copied, setCopied] = useState(false);
  const [agentPickerOpen, setAgentPickerOpen] = useState(false);

  // Session state
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
  const [threadId, setThreadId] = useState(() => crypto.randomUUID());

  // Refs for async access in callbacks
  const currentSessionIdRef = useRef<string | null>(null);
  const threadIdRef = useRef<string>(threadId);
  const selectedAgentRef = useRef<Agent | null>(selectedAgent);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => { currentSessionIdRef.current = currentSessionId; }, [currentSessionId]);
  useEffect(() => { threadIdRef.current = threadId; }, [threadId]);
  useEffect(() => { selectedAgentRef.current = selectedAgent; }, [selectedAgent]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Load sessions on mount
  useEffect(() => {
    fetch("/api/sessions")
      .then((r) => r.json())
      .then((data) => setSessions(Array.isArray(data) ? data : []))
      .catch(() => {});
  }, []);

  // Backend health check (via server-side proxy to avoid NEXT_PUBLIC issues)
  useEffect(() => {
    const check = async () => {
      try {
        const res = await fetch("/api/health", { signal: AbortSignal.timeout(4000) });
        setBackendOnline(res.ok);
      } catch {
        setBackendOnline(false);
      }
    };
    check();
    const interval = setInterval(check, 15000);
    return () => clearInterval(interval);
  }, []);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    localStorage.setItem("playgroundMuted", String(next));
    if (next && audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    toast(next ? "Voice muted" : "Voice enabled");
  };

  const speakText = useCallback(
    async (text: string) => {
      if (muted || !text) return;
      try {
        const agent = selectedAgentRef.current;
        const res = await fetch("/api/voice/tts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            text,
            ...(agent?.voiceId ? { voiceId: agent.voiceId } : {}),
          }),
        });
        if (!res.ok) return;
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        if (audioRef.current) audioRef.current.pause();
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.play();
        audio.onended = () => URL.revokeObjectURL(url);
      } catch {
        // silent
      }
    },
    [muted]
  );

  // Fire-and-forget session message save
  const saveMessage = (sessionId: string, role: string, content: string) => {
    fetch(`/api/sessions/${sessionId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, content }),
    })
      .then(() => {
        // Bubble session to top in sidebar
        setSessions((prev) => {
          const s = prev.find((x) => x.id === sessionId);
          if (!s) return prev;
          return [
            { ...s, updatedAt: new Date().toISOString() },
            ...prev.filter((x) => x.id !== sessionId),
          ];
        });
      })
      .catch(() => {});
  };

  const sendMessage = useCallback(
    async (text: string) => {
      const agent = selectedAgentRef.current;
      if (!text.trim() || streaming || !agent) return;

      const userMsg: Message = {
        id: crypto.randomUUID(),
        role: "user",
        content: text.trim(),
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, userMsg]);
      setInput("");
      setThinking(true);

      const assistantId = crypto.randomUUID();
      abortRef.current = new AbortController();

      // Create session on first message
      let sessionId = currentSessionIdRef.current;
      if (!sessionId) {
        try {
          const res = await fetch("/api/sessions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              agentId: agent.id,
              agentName: agent.name,
              threadId: threadIdRef.current,
              title: text.trim().slice(0, 80),
            }),
          });
          if (res.ok) {
            const newSession: SessionMeta = await res.json();
            sessionId = newSession.id;
            setCurrentSessionId(newSession.id);
            currentSessionIdRef.current = newSession.id;
            setSessions((prev) => [newSession, ...prev]);
          }
        } catch {
          // continue without session persistence
        }
      }

      // Save user message
      if (sessionId) saveMessage(sessionId, "user", text.trim());

      try {
        const res = await fetch("/api/proxy/run", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            agentId: agent.id,
            message: text.trim(),
            threadId: threadIdRef.current,
            chatModel,
          }),
          signal: abortRef.current.signal,
        });

        setThinking(false);
        setStreaming(true);
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: "", timestamp: new Date() },
        ]);

        if (!res.body) throw new Error("No response body");
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let fullText = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          for (const line of chunk.split("\n")) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6).trim();
              if (data === "[DONE]") break;
              try {
                const parsed = JSON.parse(data);

                // Handle greeting event — insert as a separate assistant message before the response
                if (parsed.greeting) {
                  const greetingId = crypto.randomUUID();
                  setMessages((prev) => {
                    // Insert greeting BEFORE the current empty assistant message
                    const idx = prev.findIndex((m) => m.id === assistantId);
                    if (idx === -1) return prev;
                    const before = prev.slice(0, idx);
                    const after = prev.slice(idx);
                    return [
                      ...before,
                      {
                        id: greetingId,
                        role: "assistant" as const,
                        content: parsed.greeting,
                        timestamp: new Date(),
                      },
                      ...after,
                    ];
                  });
                  if (sessionId) saveMessage(sessionId, "assistant", parsed.greeting);
                  continue;
                }

                // Handle tool execution events — insert subtle tool status messages
                if (parsed.tool_event) {
                  const te = parsed.tool_event;
                  const toolMsgId = crypto.randomUUID();
                  setMessages((prev) => {
                    // Insert tool event BEFORE the current assistant message
                    const idx = prev.findIndex((m) => m.id === assistantId);
                    if (idx === -1) return prev;
                    const before = prev.slice(0, idx);
                    const after = prev.slice(idx);
                    return [
                      ...before,
                      {
                        id: toolMsgId,
                        role: "tool" as const,
                        content: te.tool,
                        toolName: te.tool,
                        timestamp: new Date(),
                      },
                      ...after,
                    ];
                  });
                  continue;
                }

                const delta =
                  parsed.choices?.[0]?.delta?.content || parsed.content || parsed.text || "";
                if (delta) {
                  fullText += delta;
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m))
                  );
                }
              } catch {
                /* non-JSON SSE line */
              }
            }
          }
        }

        if (sessionId && fullText) saveMessage(sessionId, "assistant", fullText);
        speakText(fullText);
      } catch (err: unknown) {
        setThinking(false);
        if (err instanceof Error && err.name === "AbortError") return;
        const errorMsg =
          "I couldn't reach the backend server. Please check that all services are running.";
        setMessages((prev) => [
          ...prev,
          { id: assistantId, role: "assistant", content: errorMsg, timestamp: new Date() },
        ]);
      } finally {
        setStreaming(false);
      }
    },
    [streaming, chatModel, speakText]
  );

  const loadSession = async (session: SessionMeta) => {
    try {
      const res = await fetch(`/api/sessions/${session.id}`);
      if (!res.ok) return;
      const full: SessionFull = await res.json();

      const agent = agents.find((a) => a.id === full.agentId);
      if (agent) setSelectedAgent(agent);

      setThreadId(full.threadId);
      setCurrentSessionId(full.id);
      setMessages(
        full.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant" | "tool",
          content: m.content,
          timestamp: new Date(m.createdAt),
        }))
      );
    } catch {
      toast.error("Failed to load conversation");
    }
  };

  const newChat = useCallback(() => {
    if (audioRef.current) audioRef.current.pause();
    setMessages([]);
    setCurrentSessionId(null);
    setThreadId(crypto.randomUUID());
  }, []);

  const renameSession = async (id: string, title: string) => {
    await fetch(`/api/sessions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
    setSessions((prev) => prev.map((s) => (s.id === id ? { ...s, title } : s)));
  };

  const deleteSession = async (id: string) => {
    await fetch(`/api/sessions/${id}`, { method: "DELETE" });
    setSessions((prev) => prev.filter((s) => s.id !== id));
    if (currentSessionId === id) newChat();
    toast("Conversation deleted");
  };

  const clearChat = () => {
    if (audioRef.current) audioRef.current.pause();
    setMessages([]);
    setCurrentSessionId(null);
    setThreadId(crypto.randomUUID());
    toast("Conversation cleared");
  };

  const copyLastResponse = () => {
    const last = [...messages].reverse().find((m) => m.role === "assistant");
    if (last) {
      navigator.clipboard.writeText(last.content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Playground" subtitle="Test your agents via voice or text" />

      <div className="flex flex-1 overflow-hidden">
        {/* ── Session Sidebar ── */}
        <SessionSidebar
          sessions={sessions}
          currentSessionId={currentSessionId}
          onSelect={loadSession}
          onNew={newChat}
          onRename={renameSession}
          onDelete={deleteSession}
        />

        {/* ── Main chat area ── */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--border)] flex-wrap gap-y-2">
            {/* Agent picker */}
            <div className="relative">
              <button
                onClick={() => setAgentPickerOpen((o) => !o)}
                className="flex items-center gap-2 px-3 py-1.5 bg-[var(--card)] border border-[var(--border)] rounded-xl text-sm text-[var(--foreground)] hover:border-indigo-500/40 transition-all max-w-[180px]"
              >
                <Bot className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0" />
                <span className="flex-1 text-left truncate text-xs font-medium">
                  {selectedAgent ? selectedAgent.name : "Select agent"}
                </span>
                <ChevronDown
                  className={`w-3 h-3 text-[var(--muted-foreground)] transition-transform flex-shrink-0 ${agentPickerOpen ? "rotate-180" : ""}`}
                />
              </button>
              <AnimatePresence>
                {agentPickerOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAgentPickerOpen(false)} />
                    <motion.div
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.12 }}
                      className="absolute top-full left-0 w-56 mt-1 bg-[var(--card)] border border-[var(--border)] rounded-xl shadow-2xl z-50 overflow-hidden"
                    >
                      {agents.length === 0 ? (
                        <p className="text-xs text-[var(--muted-foreground)] p-3 text-center">
                          No agents yet
                        </p>
                      ) : (
                        agents.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => {
                              setSelectedAgent(a);
                              setAgentPickerOpen(false);
                              newChat();
                            }}
                            className={`w-full text-left px-3 py-2.5 text-xs transition-colors hover:bg-[var(--accent)] ${
                              selectedAgent?.id === a.id
                                ? "text-indigo-400 font-medium"
                                : "text-[var(--foreground)]"
                            }`}
                          >
                            <p className="font-medium">{a.name}</p>
                            {a.description && (
                              <p className="text-[var(--muted-foreground)] truncate">
                                {a.description}
                              </p>
                            )}
                          </button>
                        ))
                      )}
                    </motion.div>
                  </>
                )}
              </AnimatePresence>
            </div>

            <div className="w-px h-5 bg-[var(--border)]" />

            <ModelPicker
              label="Chat Model"
              models={CHAT_MODELS}
              selected={chatModel}
              onSelect={setChatModel}
            />
            <ModelPicker
              label="Voice Model"
              models={VOICE_MODELS}
              selected={voiceModel}
              onSelect={setVoiceModel}
            />

            <div className="flex items-center gap-1.5 ml-auto">
              {/* Backend status */}
              <div className="flex items-center gap-1.5 text-[10px] px-2 py-1 rounded-lg bg-[var(--accent)]">
                {backendOnline === null ? (
                  <div className="w-1.5 h-1.5 rounded-full bg-yellow-400 animate-pulse" />
                ) : backendOnline ? (
                  <Wifi className="w-3 h-3 text-emerald-400" />
                ) : (
                  <WifiOff className="w-3 h-3 text-red-400" />
                )}
                <span
                  className={
                    backendOnline
                      ? "text-emerald-400"
                      : backendOnline === false
                      ? "text-red-400"
                      : "text-yellow-400"
                  }
                >
                  {backendOnline === null ? "Checking..." : backendOnline ? "Online" : "Offline"}
                </span>
              </div>

              <Button
                variant="ghost"
                size="sm"
                onClick={copyLastResponse}
                disabled={messages.filter((m) => m.role === "assistant").length === 0}
                className="rounded-xl h-7 w-7 p-0"
                title="Copy last response"
              >
                {copied ? (
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </Button>

              <Button
                variant="ghost"
                size="sm"
                onClick={clearChat}
                disabled={messages.length === 0}
                className="rounded-xl h-7 w-7 p-0"
                title="Clear conversation"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>

              <Button
                variant={muted ? "outline" : "ghost"}
                size="sm"
                onClick={toggleMute}
                className={`rounded-xl h-7 w-7 p-0 transition-all ${
                  muted
                    ? "border-[var(--border)] text-[var(--muted-foreground)]"
                    : "text-indigo-400"
                }`}
                title={muted ? "Unmute auto-voice" : "Mute auto-voice"}
              >
                {muted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
              </Button>
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
            {messages.length === 0 && !thinking && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex flex-col items-center justify-center h-full text-center py-16"
              >
                <motion.div
                  animate={{ y: [0, -8, 0] }}
                  transition={{ repeat: Infinity, duration: 3, ease: "easeInOut" }}
                  className="w-20 h-20 rounded-2xl bg-indigo-600/10 border border-indigo-500/20 flex items-center justify-center mb-4"
                >
                  <Bot className="w-10 h-10 text-indigo-400" />
                </motion.div>
                <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">
                  {selectedAgent ? `Say hello to ${selectedAgent.name}!` : "Pick an agent to start"}
                </h3>
                <p className="text-sm text-[var(--muted-foreground)] max-w-xs">
                  {selectedAgent
                    ? "Type a message or hold the mic button to speak."
                    : "Select an agent from the dropdown above to get started."}
                </p>
                {!muted && (
                  <p className="text-xs text-[var(--muted-foreground)] mt-2 flex items-center gap-1">
                    <Volume2 className="w-3 h-3" /> Responses will be spoken aloud automatically
                  </p>
                )}
              </motion.div>
            )}

            <AnimatePresence initial={false}>
              {messages.map((msg) => (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 12 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {/* Tool execution event — subtle inline indicator */}
                  {msg.role === "tool" ? (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[11px] font-medium">
                      <Wrench className="w-3 h-3" />
                      <span>{msg.toolName || msg.content}</span>
                      <span className="text-amber-400/60">executed</span>
                    </div>
                  ) : (
                    <>
                      {msg.role === "assistant" && (
                        <div className="w-7 h-7 rounded-lg bg-indigo-600/15 border border-indigo-500/20 flex items-center justify-center mr-2 flex-shrink-0 mt-0.5">
                          <Bot className="w-3.5 h-3.5 text-indigo-400" />
                        </div>
                      )}

                      {msg.role === "user" ? (
                        <div className="max-w-[72%] rounded-2xl px-4 py-3 text-sm leading-relaxed bg-indigo-600 text-white rounded-tr-sm">
                          {msg.content}
                        </div>
                      ) : (
                        <div className="max-w-[72%] group">
                          <div className="bg-[var(--card)] text-[var(--foreground)] border border-[var(--border)] rounded-2xl rounded-tl-sm px-4 py-3 text-sm">
                            {msg.content ? (
                              <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                                {msg.content}
                              </ReactMarkdown>
                            ) : (
                              <span className="flex items-center gap-1.5 text-[var(--muted-foreground)]">
                                <span className="thinking-dot w-1.5 h-1.5 bg-current rounded-full" />
                                <span className="thinking-dot w-1.5 h-1.5 bg-current rounded-full" />
                                <span className="thinking-dot w-1.5 h-1.5 bg-current rounded-full" />
                              </span>
                            )}
                          </div>
                          {/* Per-message speaker button */}
                          {msg.content && (
                            <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <SpeakerButton text={msg.content} voiceId={selectedAgent?.voiceId} />
                              <span className="text-[10px] text-[var(--muted-foreground)]">
                                Listen
                              </span>
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              ))}
            </AnimatePresence>

            {thinking && (
              <motion.div
                initial={{ opacity: 0, y: 12 }}
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
                    <span className="thinking-dot w-2 h-2 bg-indigo-400 rounded-full" />
                    <span className="thinking-dot w-2 h-2 bg-indigo-400 rounded-full" />
                    <span className="thinking-dot w-2 h-2 bg-indigo-400 rounded-full" />
                  </div>
                </div>
              </motion.div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Input area */}
          <div className="px-4 pb-4 pt-3 border-t border-[var(--border)]">
            <div className="flex items-end gap-2 bg-[var(--card)] border border-[var(--border)] rounded-2xl p-3 focus-within:border-indigo-500/50 transition-all">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={
                  selectedAgent ? `Message ${selectedAgent.name}...` : "Select an agent first..."
                }
                disabled={!selectedAgent || streaming}
                rows={1}
                className="flex-1 bg-transparent border-0 p-0 resize-none text-sm text-[var(--foreground)] placeholder:text-[var(--muted-foreground)] focus-visible:ring-0 max-h-32 overflow-y-auto"
              />
              <div className="flex items-center gap-2 flex-shrink-0">
                <VoiceInputBtn
                  onTranscript={(text) => setInput((prev) => (prev ? prev + " " + text : text))}
                  onInterim={(text) => { setInput((prev) => { const base = prev.replace(/ ?\[…\]$/, ""); return text ? (base ? base + " " + text + " […]" : text + " […]") : base; }); }}
                  disabled={!selectedAgent || streaming}
                />
                <Button
                  onClick={() => sendMessage(input)}
                  disabled={!input.trim() || !selectedAgent || streaming}
                  size="sm"
                  className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl h-9 w-9 p-0"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </div>
            </div>
            <p className="text-xs text-center text-[var(--muted-foreground)] mt-2">
              Press{" "}
              <kbd className="px-1 py-0.5 bg-[var(--accent)] rounded text-[10px]">Enter</kbd> to
              send,{" "}
              <kbd className="px-1 py-0.5 bg-[var(--accent)] rounded text-[10px]">Shift+Enter</kbd>{" "}
              for new line
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
