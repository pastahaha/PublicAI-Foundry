"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  Bot, ChevronLeft, GitBranch, Wrench, Zap, BookOpen,
  MessageSquare, BarChart3, Shield, Brain, Globe,
  Clock, Hash, Layers, Sparkles, ExternalLink, Edit,
  Activity, Database,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

/* ─── Types ─────────────────────────────────────────────────────────── */

interface ToolInfo { name: string; reason: string }
interface SkillInfo { id: string; name: string; description: string; category: string; node: string; reason: string }
interface KBInfo { kb_id: string; name: string; description: string; status: string; document_count: number }

interface AgentInfo {
  assistant_id: string;
  name: string;
  description: string | null;
  model_provider: string;
  model_name: string;
  agent_type: string;
  use_case: string;
  system_prompt_preview: string;
  tools: ToolInfo[];
  skills: SkillInfo[];
  knowledge_bases: KBInfo[];
  guardrails: Record<string, boolean | string | number>;
  node_count: number;
  edge_count: number;
  created_at: string | null;
  updated_at: string | null;
  stats: {
    total_sessions: number;
    total_messages: number;
    total_tool_executions: number;
    total_skill_activations: number;
  };
}

/* ─── Icon maps ─────────────────────────────────────────────────────── */

const TOOL_ICONS: Record<string, typeof Wrench> = {
  web_search: Globe,
  scrape_url: Globe,
  summarize_text: BookOpen,
  document_explainer: BookOpen,
  retrieval_query: Database,
  eligibility_checker: BarChart3,
  service_locator: Globe,
  rights_lookup: Shield,
  crisis_classifier: Zap,
  safety_planner: Shield,
  hotline_directory: MessageSquare,
  human_review: Brain,
};

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

/* ─── Stat Card ─────────────────────────────────────────────────────── */

function StatCard({ icon: Icon, label, value, color }: { icon: typeof Bot; label: string; value: string | number; color: string }) {
  return (
    <div className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-4 flex items-center gap-3">
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${color}`}>
        <Icon className="w-5 h-5" />
      </div>
      <div>
        <p className="text-xl font-bold text-[var(--foreground)]">{value}</p>
        <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
      </div>
    </div>
  );
}

/* ─── Main Component ────────────────────────────────────────────────── */

export function AgentDetailClient({ agentId }: { agentId: string }) {
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`/api/agents/${agentId}/info`)
      .then((r) => r.json())
      .then((data) => { setInfo(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, [agentId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3 text-[var(--muted-foreground)]">
          <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 2, ease: "linear" }}>
            <Bot className="w-6 h-6" />
          </motion.div>
          <span>Loading agent info...</span>
        </div>
      </div>
    );
  }

  if (!info) {
    return (
      <div className="flex items-center justify-center h-full text-[var(--muted-foreground)]">
        Agent not found
      </div>
    );
  }

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
      {/* ── Header ── */}
      <div className="flex items-center gap-3 px-6 pt-6 pb-4 border-b border-[var(--border)]">
        <Link
          href="/agents"
          className="flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Agents
        </Link>
        <span className="text-[var(--border)]">/</span>
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-600/20 to-violet-600/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
            <Bot className="w-4 h-4 text-indigo-400" />
          </div>
          <div className="min-w-0">
            <h1 className="text-lg font-bold text-[var(--foreground)] truncate">{info.name}</h1>
            <div className="flex items-center gap-2 text-xs text-[var(--muted-foreground)]">
              <span className="capitalize">{info.agent_type}</span>
              <span>·</span>
              <span>{info.model_name}</span>
              <span>·</span>
              <span>Created {timeAgo(info.created_at)}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="text-xs h-8 rounded-xl text-violet-400 hover:bg-violet-500/10">
            <Link href={`/agents/${agentId}/blueprint`}><GitBranch className="w-3 h-3 mr-1.5" />Blueprint</Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="text-xs h-8 rounded-xl text-cyan-400 hover:bg-cyan-500/10">
            <Link href={`/agents/${agentId}/sessions`}><Activity className="w-3 h-3 mr-1.5" />Sessions</Link>
          </Button>
          <Button asChild size="sm" variant="ghost" className="text-xs h-8 rounded-xl text-amber-400 hover:bg-amber-500/10">
            <Link href={`/agents/${agentId}/edit`}><Edit className="w-3 h-3 mr-1.5" />Edit</Link>
          </Button>
          <Button asChild size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs h-8">
            <Link href={`/playground?agent=${agentId}`}><Sparkles className="w-3 h-3 mr-1.5" />Test</Link>
          </Button>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto p-6 dashboard-bg">
        <div className="max-w-5xl mx-auto space-y-6">

          {/* Description */}
          {info.description && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
              className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5"
            >
              <p className="text-sm text-[var(--foreground)] leading-relaxed">{info.description}</p>
              <div className="flex items-center gap-3 mt-3 flex-wrap">
                <Badge variant="outline" className="text-[10px] rounded-full capitalize">{info.use_case.replace("_", " ")}</Badge>
                <Badge variant="outline" className="text-[10px] rounded-full">{info.node_count} nodes · {info.edge_count} edges</Badge>
              </div>
            </motion.div>
          )}

          {/* Stats Row */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            className="grid grid-cols-2 md:grid-cols-4 gap-3"
          >
            <StatCard icon={MessageSquare} label="Sessions" value={info.stats.total_sessions} color="bg-indigo-500/10 text-indigo-400" />
            <StatCard icon={Hash} label="Messages" value={info.stats.total_messages} color="bg-emerald-500/10 text-emerald-400" />
            <StatCard icon={Wrench} label="Tool Executions" value={info.stats.total_tool_executions} color="bg-amber-500/10 text-amber-400" />
            <StatCard icon={Zap} label="Skill Activations" value={info.stats.total_skill_activations} color="bg-violet-500/10 text-violet-400" />
          </motion.div>

          {/* Tools Section */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15 }}
            className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <Wrench className="w-4 h-4 text-amber-400" />
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Tools ({info.tools.length})</h2>
            </div>
            {info.tools.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">No tools configured</p>
            ) : (
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {info.tools.map((tool) => {
                  const Icon = TOOL_ICONS[tool.name] || Wrench;
                  return (
                    <div key={tool.name} className="flex items-start gap-2.5 p-3 rounded-xl bg-[var(--accent)]/50 border border-[var(--border)]">
                      <div className="w-7 h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center flex-shrink-0">
                        <Icon className="w-3.5 h-3.5 text-amber-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-medium text-[var(--foreground)]">{tool.name.replace(/_/g, " ")}</p>
                        {tool.reason && (
                          <p className="text-[10px] text-[var(--muted-foreground)] line-clamp-2 mt-0.5">{tool.reason}</p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </motion.div>

          {/* Skills Section */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
            className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5"
          >
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-4 h-4 text-violet-400" />
              <h2 className="text-sm font-semibold text-[var(--foreground)]">Skills ({info.skills.length})</h2>
            </div>
            {info.skills.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">No skills assigned</p>
            ) : (
              <div className="space-y-2">
                {info.skills.map((skill) => (
                  <div key={skill.id} className="flex items-start gap-3 p-3 rounded-xl bg-[var(--accent)]/50 border border-[var(--border)]">
                    <div className={`px-2 py-1 rounded-lg text-[10px] font-semibold border flex-shrink-0 ${CATEGORY_COLORS[skill.category] || CATEGORY_COLORS.general}`}>
                      {skill.category}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[var(--foreground)]">{skill.name}</p>
                      {skill.description && (
                        <p className="text-[10px] text-[var(--muted-foreground)] line-clamp-2 mt-0.5">{skill.description}</p>
                      )}
                      {skill.reason && (
                        <p className="text-[10px] text-indigo-400/80 mt-1 italic">&quot;{skill.reason}&quot;</p>
                      )}
                    </div>
                    <span className="text-[10px] text-[var(--muted-foreground)] flex-shrink-0">on {skill.node}</span>
                  </div>
                ))}
              </div>
            )}
          </motion.div>

          {/* Knowledge Bases */}
          {info.knowledge_bases.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25 }}
              className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5"
            >
              <div className="flex items-center gap-2 mb-4">
                <Database className="w-4 h-4 text-cyan-400" />
                <h2 className="text-sm font-semibold text-[var(--foreground)]">Knowledge Bases</h2>
              </div>
              {info.knowledge_bases.map((kb) => (
                <div key={kb.kb_id} className="flex items-center gap-3 p-3 rounded-xl bg-[var(--accent)]/50 border border-[var(--border)]">
                  <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex items-center justify-center">
                    <Database className="w-4 h-4 text-cyan-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-[var(--foreground)]">{kb.name}</p>
                    <p className="text-[10px] text-[var(--muted-foreground)] truncate">{kb.description}</p>
                  </div>
                  <Badge variant="outline" className={`text-[10px] rounded-full ${kb.status === "ready" ? "text-emerald-400 border-emerald-500/20" : "text-amber-400 border-amber-500/20"}`}>
                    {kb.status}
                  </Badge>
                  <span className="text-[10px] text-[var(--muted-foreground)]">{kb.document_count} docs</span>
                </div>
              ))}
            </motion.div>
          )}

          {/* Guardrails */}
          {Object.keys(info.guardrails).length > 0 && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <Shield className="w-4 h-4 text-emerald-400" />
                <h2 className="text-sm font-semibold text-[var(--foreground)]">Guardrails</h2>
              </div>
              <div className="flex flex-wrap gap-2">
                {info.guardrails.toxicity && <Badge variant="outline" className="text-[10px] rounded-full text-emerald-400 border-emerald-500/20">Toxicity Filter</Badge>}
                {info.guardrails.pii && <Badge variant="outline" className="text-[10px] rounded-full text-emerald-400 border-emerald-500/20">PII Protection</Badge>}
                {info.guardrails.maxTokens && <Badge variant="outline" className="text-[10px] rounded-full text-emerald-400 border-emerald-500/20">Token Limit</Badge>}
                {info.guardrails.customInstructions && (
                  <p className="text-[10px] text-[var(--muted-foreground)] mt-1 w-full">{String(info.guardrails.customInstructions)}</p>
                )}
              </div>
            </motion.div>
          )}

          {/* System Prompt Preview */}
          {info.system_prompt_preview && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="bg-[var(--card)] border border-[var(--border)] rounded-xl p-5"
            >
              <div className="flex items-center gap-2 mb-3">
                <Brain className="w-4 h-4 text-indigo-400" />
                <h2 className="text-sm font-semibold text-[var(--foreground)]">System Prompt Preview</h2>
              </div>
              <pre className="text-xs text-[var(--muted-foreground)] whitespace-pre-wrap font-mono bg-[var(--accent)]/50 rounded-lg p-3 border border-[var(--border)]">
                {info.system_prompt_preview}
                {info.system_prompt_preview.length >= 300 && "..."}
              </pre>
            </motion.div>
          )}

          {/* Quick Actions */}
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
            className="flex items-center gap-3 pb-6"
          >
            <Button asChild variant="outline" className="rounded-xl text-xs h-9 border-[var(--border)]">
              <Link href={`/agents/${agentId}/sessions`}>
                <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                View Session Analytics
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl text-xs h-9 border-[var(--border)]">
              <Link href={`/agents/${agentId}/blueprint`}>
                <Layers className="w-3.5 h-3.5 mr-1.5" />
                View Blueprint Graph
              </Link>
            </Button>
            <Button asChild variant="outline" className="rounded-xl text-xs h-9 border-[var(--border)]">
              <Link href={`/playground?agent=${agentId}`}>
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                Open in Playground
              </Link>
            </Button>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
