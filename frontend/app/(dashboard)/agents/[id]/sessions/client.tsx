"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft, MessageSquare, Wrench, Zap, Clock,
  Hash, BarChart3, Bot, Search, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Topbar } from "@/components/dashboard/topbar";

interface SessionItem {
  thread_id: string;
  message_count: number;
  tools_used: string[];
  skills_used: string[];
  tool_executions: number;
  total_iterations: number;
  total_response_chars: number;
  first_message: string;
  started_at: string | null;
  last_active: string | null;
  assistant_name: string;
}

export function SessionsListClient({ agentId, agentName }: { agentId: string; agentName: string }) {
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetch(`/api/agents/${agentId}/sessions`)
      .then((r) => r.json())
      .then((data) => {
        setSessions(data.sessions || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [agentId]);

  const filtered = sessions.filter(
    (s) =>
      s.first_message.toLowerCase().includes(search.toLowerCase()) ||
      s.tools_used.some((t) => t.toLowerCase().includes(search.toLowerCase())) ||
      s.skills_used.some((sk) => sk.toLowerCase().includes(search.toLowerCase()))
  );

  const timeAgo = (dateStr: string | null) => {
    if (!dateStr) return "—";
    const diff = Date.now() - new Date(dateStr).getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    return `${Math.floor(hrs / 24)}d ago`;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <Link
          href={`/agents/${agentId}`}
          className="flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          {agentName || "Agent"}
        </Link>
        <span className="text-[var(--border)]">/</span>
        <h1 className="text-sm font-semibold text-[var(--foreground)]">Session Analytics</h1>
        <span className="text-xs text-[var(--muted-foreground)] ml-2">
          {sessions.length} session{sessions.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto p-6 dashboard-bg">
        <div className="max-w-4xl mx-auto space-y-4">
          {/* Search */}
          <div className="relative max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <Input
              placeholder="Search sessions..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-[var(--card)] border-[var(--border)] rounded-xl"
            />
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
                <Bot className="w-6 h-6 text-[var(--muted-foreground)]" />
              </motion.div>
            </div>
          )}

          {/* Empty */}
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center py-20 text-center">
              <MessageSquare className="w-10 h-10 text-[var(--muted-foreground)] mb-3 opacity-40" />
              <p className="text-sm font-medium text-[var(--foreground)] mb-1">
                {search ? "No sessions match your search" : "No sessions yet"}
              </p>
              <p className="text-xs text-[var(--muted-foreground)]">
                {search ? "Try a different search term" : "Start a conversation in the Playground to see analytics here"}
              </p>
              {!search && (
                <Button asChild size="sm" className="mt-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs">
                  <Link href={`/playground?agent=${agentId}`}>Open Playground</Link>
                </Button>
              )}
            </div>
          )}

          {/* Session cards */}
          <AnimatePresence mode="popLayout">
            {filtered.map((session, i) => (
              <motion.div
                key={session.thread_id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: i * 0.03 }}
              >
                <Link href={`/agents/${agentId}/sessions/${session.thread_id}`}>
                  <div className="group bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 hover:border-indigo-500/40 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/5 transition-all cursor-pointer">
                    <div className="flex items-start gap-4">
                      {/* Left: info */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--foreground)] line-clamp-1 mb-1">
                          {session.first_message || "New session"}
                        </p>
                        <div className="flex items-center gap-3 text-[10px] text-[var(--muted-foreground)] mb-3">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" />{timeAgo(session.started_at)}</span>
                          <span className="flex items-center gap-1"><Hash className="w-3 h-3" />{session.message_count} turns</span>
                          <span className="flex items-center gap-1"><Wrench className="w-3 h-3" />{session.tool_executions} tool calls</span>
                        </div>

                        {/* Tools & Skills badges */}
                        <div className="flex flex-wrap gap-1.5">
                          {session.tools_used.map((t) => (
                            <Badge key={t} variant="outline" className="text-[9px] rounded-full px-2 py-0.5 text-amber-400 border-amber-500/20 bg-amber-500/5">
                              <Wrench className="w-2.5 h-2.5 mr-1" />{t.replace(/_/g, " ")}
                            </Badge>
                          ))}
                          {session.skills_used.map((s) => (
                            <Badge key={s} variant="outline" className="text-[9px] rounded-full px-2 py-0.5 text-violet-400 border-violet-500/20 bg-violet-500/5">
                              <Zap className="w-2.5 h-2.5 mr-1" />{s.replace(/_/g, " ")}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {/* Right: arrow */}
                      <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        <span className="text-[10px] text-indigo-400">Analyse</span>
                        <ArrowRight className="w-4 h-4 text-indigo-400" />
                      </div>
                    </div>
                  </div>
                </Link>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
