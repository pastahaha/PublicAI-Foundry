"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronLeft, Bot, User, Wrench, Zap, Clock,
  Hash, BarChart3, MessageSquare, Brain, Award,
  TrendingUp, Activity, Target,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

/* ─── Types ─────────────────────────────────────────────────────────── */

interface ConversationMessage {
  role: string;
  content: string;
  timestamp: string | null;
}

interface RunTimelineItem {
  run_id: string;
  turn: number;
  user_message: string;
  response_length: number;
  tools_used: string[];
  skills_used: string[];
  tool_events: Array<{ tool: string; node: string; status: string }>;
  iterations: number;
  status: string;
  timestamp: string | null;
}

interface SkillUsed {
  id: string;
  name: string;
  category: string;
  description: string;
}

interface SessionAnalysis {
  assistant_id: string;
  assistant_name: string;
  thread_id: string;
  summary: string;
  conversation: ConversationMessage[];
  run_timeline: RunTimelineItem[];
  tools_used: string[];
  skills_used: SkillUsed[];
  tool_events: Array<{ tool: string; node: string; status: string }>;
  metrics: {
    total_turns: number;
    total_iterations: number;
    total_response_chars: number;
    avg_response_length: number;
    tool_executions: number;
    duration_seconds: number | null;
  };
  scores: {
    responsiveness: number;
    tool_utilization: number;
    skill_coverage: number;
    conversation_depth: number;
    overall: number;
  };
  started_at: string | null;
  ended_at: string | null;
}

/* ─── Score Ring ─────────────────────────────────────────────────────── */

function ScoreRing({ score, label, size = 72, color }: { score: number; label: string; size?: number; color: string }) {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (score / 100) * circumference;

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="currentColor" strokeWidth={strokeWidth}
            className="text-[var(--border)]"
          />
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke={color} strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            className="transition-all duration-1000 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-sm font-bold text-[var(--foreground)]">{score}</span>
        </div>
      </div>
      <p className="text-[10px] text-[var(--muted-foreground)] text-center">{label}</p>
    </div>
  );
}

/* ─── Category colors ───────────────────────────────────────────────── */

const CATEGORY_COLORS: Record<string, string> = {
  research: "bg-blue-500/10 text-blue-400 border-blue-500/20",
  analysis: "bg-violet-500/10 text-violet-400 border-violet-500/20",
  assessment: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
  safety: "bg-red-500/10 text-red-400 border-red-500/20",
  communication: "bg-amber-500/10 text-amber-400 border-amber-500/20",
  navigation: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20",
  knowledge: "bg-indigo-500/10 text-indigo-400 border-indigo-500/20",
  general: "bg-gray-500/10 text-gray-400 border-gray-500/20",
};

/* ─── Main Component ────────────────────────────────────────────────── */

export function SessionAnalysisClient({ agentId, threadId }: { agentId: string; threadId: string }) {
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [showConversation, setShowConversation] = useState(false);

  useEffect(() => {
    fetch(`/api/agents/${agentId}/sessions/${threadId}`)
      .then((r) => r.json())
      .then((data) => { setAnalysis(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [agentId, threadId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-[var(--muted-foreground)]">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
            <BarChart3 className="w-6 h-6" />
          </motion.div>
          <span>Analysing session...</span>
        </div>
      </div>
    );
  }

  if (!analysis) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
        Session analysis not available
      </div>
    );
  }

  const formatDuration = (seconds: number | null) => {
    if (!seconds) return "—";
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}m ${secs}s`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <Link
          href={`/agents/${agentId}/sessions`}
          className="flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Sessions
        </Link>
        <span className="text-[var(--border)]">/</span>
        <h1 className="text-sm font-semibold text-[var(--foreground)]">Session Analysis</h1>
        <span className="text-xs text-[var(--muted-foreground)] ml-2">
          {analysis.assistant_name}
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 dashboard-bg">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* ── Summary ── */}
          {analysis.summary && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="bg-gradient-to-r from-indigo-600/5 to-violet-600/5 border border-indigo-500/20 rounded-xl p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-semibold text-[var(--foreground)]">AI Summary</h2>
              </div>
              <p className="text-sm text-[var(--foreground)] leading-relaxed">{analysis.summary}</p>
            </motion.div>
          )}

          {/* ── Scores ── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5"
          >
            <div className="flex items-center gap-2 mb-5">
              <Award className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Quality Scores</h2>
            </div>
            <div className="flex items-center justify-around flex-wrap gap-6">
              <ScoreRing score={analysis.scores.overall} label="Overall" size={80} color="#818cf8" />
              <ScoreRing score={analysis.scores.responsiveness} label="Responsiveness" color="#34d399" />
              <ScoreRing score={analysis.scores.tool_utilization} label="Tool Utilization" color="#fbbf24" />
              <ScoreRing score={analysis.scores.skill_coverage} label="Skill Coverage" color="#c084fc" />
              <ScoreRing score={analysis.scores.conversation_depth} label="Depth" color="#38bdf8" />
            </div>
          </motion.div>

          {/* ── Metrics ── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="grid grid-cols-2 md:grid-cols-5 gap-3"
          >
            {[
              { icon: MessageSquare, label: "Turns", value: analysis.metrics.total_turns, color: "text-indigo-400" },
              { icon: Hash, label: "Iterations", value: analysis.metrics.total_iterations, color: "text-emerald-400" },
              { icon: Wrench, label: "Tool Calls", value: analysis.metrics.tool_executions, color: "text-amber-400" },
              { icon: TrendingUp, label: "Avg Response", value: `${analysis.metrics.avg_response_length} chars`, color: "text-violet-400" },
              { icon: Clock, label: "Duration", value: formatDuration(analysis.metrics.duration_seconds), color: "text-cyan-400" },
            ].map((m) => (
              <div key={m.label} className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-3 text-center">
                <m.icon className={`w-4 h-4 mx-auto mb-1 ${m.color}`} />
                <p className="text-lg font-bold text-[var(--foreground)]">{m.value}</p>
                <p className="text-[10px] text-[var(--muted-foreground)]">{m.label}</p>
              </div>
            ))}
          </motion.div>

          {/* ── Tools Used ── */}
          {analysis.tools_used.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <Wrench className="w-4 h-4 text-amber-400" />
                <h2 className="text-sm font-semibold text-[var(--foreground)]">Tools Executed</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {analysis.tools_used.map((t) => (
                  <Badge key={t} variant="outline" className="text-[10px] rounded-full px-2.5 py-1 text-amber-400 border-amber-500/20 bg-amber-500/5">
                    <Wrench className="w-3 h-3 mr-1" />{t.replace(/_/g, " ")}
                  </Badge>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Skills Used ── */}
          {analysis.skills_used.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
              className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-violet-400" />
                <h2 className="text-sm font-semibold text-[var(--foreground)]">Skills Activated</h2>
              </div>
              <div className="space-y-2">
                {analysis.skills_used.map((s) => (
                  <div key={s.id} className="flex items-start gap-3 p-3 rounded-xl bg-[var(--accent)]/50 border border-[var(--border)]">
                    <Badge variant="outline" className={`text-[9px] rounded-full flex-shrink-0 ${CATEGORY_COLORS[s.category] || CATEGORY_COLORS.general}`}>
                      {s.category}
                    </Badge>
                    <div>
                      <p className="text-xs font-medium text-[var(--foreground)]">{s.name}</p>
                      <p className="text-[10px] text-[var(--muted-foreground)]">{s.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {/* ── Execution Timeline ── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
            className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Execution Timeline</h2>
            </div>
            <div className="space-y-3">
              {analysis.run_timeline.map((run) => (
                <div key={run.run_id} className="relative pl-6 pb-3 border-l-2 border-[var(--border)] last:border-0">
                  <div className="absolute -left-1.5 top-0 w-3 h-3 rounded-full bg-indigo-500 border-2 border-[var(--background)]" />
                  <div className="flex items-start gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-semibold text-indigo-400">Turn {run.turn}</span>
                        <span className="text-[10px] text-[var(--muted-foreground)]">{run.iterations} iteration{run.iterations !== 1 ? "s" : ""}</span>
                        <span className="text-[10px] text-[var(--muted-foreground)]">{run.response_length} chars</span>
                      </div>
                      <p className="text-xs text-[var(--foreground)] line-clamp-1 mb-1">&ldquo;{run.user_message}&rdquo;</p>
                      <div className="flex flex-wrap gap-1">
                        {run.tools_used.map((t) => (
                          <Badge key={t} variant="outline" className="text-[8px] rounded-full px-1.5 py-0 text-amber-400 border-amber-500/20">
                            {t.replace(/_/g, " ")}
                          </Badge>
                        ))}
                        {run.skills_used.map((s) => (
                          <Badge key={s} variant="outline" className="text-[8px] rounded-full px-1.5 py-0 text-violet-400 border-violet-500/20">
                            {s.replace(/_/g, " ")}
                          </Badge>
                        ))}
                      </div>
                    </div>
                    <Badge variant="outline" className={`text-[9px] rounded-full flex-shrink-0 ${run.status === "completed" ? "text-emerald-400 border-emerald-500/20" : "text-red-400 border-red-500/20"}`}>
                      {run.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* ── Conversation Replay ── */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
            className="bg-[var(--card)] border border-[var(--border)] rounded-xl overflow-hidden"
          >
            <button
              onClick={() => setShowConversation(!showConversation)}
              className="w-full flex items-center gap-2 p-5 text-left hover:bg-[var(--accent)]/50 transition-colors"
            >
              <MessageSquare className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-semibold text-[var(--foreground)] flex-1">
                Conversation Replay ({analysis.conversation.length} messages)
              </h2>
              <ChevronLeft className={`w-4 h-4 text-[var(--muted-foreground)] transition-transform ${showConversation ? "-rotate-90" : ""}`} />
            </button>

            {showConversation && (
              <div className="px-5 pb-5 space-y-3 border-t border-[var(--border)] pt-4">
                {analysis.conversation.map((msg, i) => (
                  <div key={i} className={`flex gap-3 ${msg.role === "user" ? "" : ""}`}>
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5 ${
                      msg.role === "user"
                        ? "bg-indigo-600/15 border border-indigo-500/20"
                        : "bg-violet-600/15 border border-violet-500/20"
                    }`}>
                      {msg.role === "user" ? (
                        <User className="w-3.5 h-3.5 text-indigo-400" />
                      ) : (
                        <Bot className="w-3.5 h-3.5 text-violet-400" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-[10px] font-semibold text-[var(--foreground)]">
                          {msg.role === "user" ? "User" : "Agent"}
                        </span>
                        {msg.timestamp && (
                          <span className="text-[9px] text-[var(--muted-foreground)]">
                            {new Date(msg.timestamp).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-[var(--muted-foreground)] leading-relaxed prose-sm">
                        <ReactMarkdown remarkPlugins={[remarkGfm]}>
                          {msg.content}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

        </div>
      </div>
    </div>
  );
}
