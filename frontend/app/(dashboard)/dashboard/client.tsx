"use client";

import { motion } from "framer-motion";
import Link from "next/link";
import {
  Bot, Zap, Activity, Plus, Gamepad2,
  Heart, Scale, AlertTriangle, Home, ArrowRight, Clock,
  TrendingUp, Layers, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { StatCard } from "@/components/dashboard/stat-card";
import { Topbar } from "@/components/dashboard/topbar";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  isActive: boolean;
  updatedAt: Date;
}

interface Props {
  user: { name: string; email: string };
  stats: { totalAgents: number; activeAgents: number };
  recentAgents: Agent[];
}

const templates = [
  {
    icon: Heart,
    name: "Public Health Assistant",
    description: "24/7 symptom triage and patient support",
    color: "from-rose-500/15 to-pink-500/15 border-rose-500/25",
    iconColor: "bg-rose-500/20 text-rose-400",
    tag: "Healthcare",
    tagColor: "bg-rose-500/10 text-rose-400",
  },
  {
    icon: Scale,
    name: "Legal Aid Intake",
    description: "Client intake and case type identification",
    color: "from-violet-500/15 to-indigo-500/15 border-violet-500/25",
    iconColor: "bg-violet-500/20 text-violet-400",
    tag: "Legal",
    tagColor: "bg-violet-500/10 text-violet-400",
  },
  {
    icon: AlertTriangle,
    name: "Crisis Support",
    description: "Mental health first-response with escalation",
    color: "from-amber-500/15 to-orange-500/15 border-amber-500/25",
    iconColor: "bg-amber-500/20 text-amber-400",
    tag: "Mental Health",
    tagColor: "bg-amber-500/10 text-amber-400",
  },
  {
    icon: Home,
    name: "Housing Advisor",
    description: "Sydney housing rights and assistance guide",
    color: "from-teal-500/15 to-cyan-500/15 border-teal-500/25",
    iconColor: "bg-teal-500/20 text-teal-400",
    tag: "Housing",
    tagColor: "bg-teal-500/10 text-teal-400",
  },
];

export function DashboardClient({ user, stats, recentAgents }: Props) {
  const firstName = user.name.split(" ")[0];
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Dashboard" subtitle={`${greeting}, ${firstName}`} />

      <div className="flex-1 overflow-y-auto dashboard-bg">
        {/* Hero banner */}
        <div className="relative overflow-hidden border-b border-[var(--border)] px-6 py-8">
          {/* Background gradient */}
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-600/8 via-transparent to-violet-600/5 pointer-events-none" />
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-bl from-indigo-500/10 to-transparent rounded-full blur-3xl pointer-events-none" />

          <div className="relative flex items-start justify-between gap-4">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-8 h-8 rounded-xl bg-indigo-600/15 border border-indigo-500/25 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-indigo-400" />
                </div>
                <span className="text-xs font-medium text-indigo-400 bg-indigo-500/10 border border-indigo-500/20 px-2.5 py-1 rounded-full">
                  PublicAI Foundry
                </span>
              </div>
              <h2 className="text-2xl font-bold text-[var(--foreground)] mb-1">
                {stats.totalAgents === 0
                  ? "Build your first AI agent"
                  : `You have ${stats.totalAgents} agent${stats.totalAgents !== 1 ? "s" : ""} deployed`}
              </h2>
              <p className="text-[var(--muted-foreground)] text-sm max-w-md">
                {stats.totalAgents === 0
                  ? "Create safe, human-supervised AI agents for public good — no code required."
                  : `${stats.activeAgents} active · Powered by Mistral AI · Ready to serve`}
              </p>
            </div>
            <Button asChild className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl flex-shrink-0 shadow-lg shadow-indigo-500/20">
              <Link href="/agents/create">
                <Plus className="w-4 h-4 mr-1.5" />
                Create Agent
              </Link>
            </Button>
          </div>
        </div>

        <div className="p-6 space-y-8">
          {/* Stats row */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard label="Total Agents" value={stats.totalAgents} icon={Bot} color="bg-indigo-500" delay={0} />
            <StatCard label="Active Agents" value={stats.activeAgents} icon={Zap} color="bg-emerald-500" delay={0.05} />
            <StatCard label="Model" value="Mistral" icon={Activity} color="bg-violet-500" delay={0.1} />
            <StatCard label="Status" value="Online" icon={TrendingUp} color="bg-cyan-500" delay={0.15} />
          </div>

          <div className="grid lg:grid-cols-5 gap-6">
            {/* Recent agents - takes 3 columns */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="lg:col-span-3 bg-[var(--card)] border border-[var(--border)] rounded-2xl overflow-hidden"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--border)]">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-indigo-400" />
                  <h3 className="font-semibold text-[var(--foreground)]">Your Agents</h3>
                </div>
                <Link href="/agents" className="text-sm text-indigo-400 hover:text-indigo-300 flex items-center gap-1 transition-colors">
                  View all <ArrowRight className="w-3.5 h-3.5" />
                </Link>
              </div>

              {recentAgents.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center px-6">
                  <motion.div
                    animate={{ y: [0, -8, 0] }}
                    transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
                    className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500/15 to-violet-500/15 border border-indigo-500/20 flex items-center justify-center mb-4"
                  >
                    <Bot className="w-7 h-7 text-indigo-400" />
                  </motion.div>
                  <p className="text-[var(--muted-foreground)] text-sm mb-4">No agents yet — create one to get started</p>
                  <Button asChild size="sm" className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                    <Link href="/agents/create"><Plus className="w-3.5 h-3.5 mr-1" /> Create Agent</Link>
                  </Button>
                </div>
              ) : (
                <div className="divide-y divide-[var(--border)]">
                  {recentAgents.map((agent, i) => (
                    <motion.div
                      key={agent.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.25 + i * 0.04 }}
                    >
                      <Link
                        href={`/agents/${agent.id}`}
                        className="flex items-center gap-3 px-5 py-3.5 hover:bg-[var(--accent)]/60 transition-colors group"
                      >
                        <div className="w-9 h-9 rounded-xl bg-indigo-600/10 border border-indigo-500/15 flex items-center justify-center flex-shrink-0">
                          <Bot className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-[var(--foreground)] truncate">{agent.name}</p>
                          <p className="text-xs text-[var(--muted-foreground)] truncate">{agent.model}</p>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant={agent.isActive ? "default" : "secondary"} className={`text-xs ${agent.isActive ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30" : ""}`}>
                            {agent.isActive ? "Active" : "Off"}
                          </Badge>
                          <Clock className="w-3 h-3 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 transition-opacity" />
                        </div>
                      </Link>
                    </motion.div>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Quick actions - takes 2 columns */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.25 }}
              className="lg:col-span-2 space-y-3"
            >
              {/* Playground CTA */}
              <Link
                href="/playground"
                className="flex items-center gap-3 p-4 bg-gradient-to-r from-cyan-600/10 to-indigo-600/10 border border-cyan-500/20 rounded-2xl hover:border-cyan-500/40 hover:-translate-y-0.5 transition-all duration-200 group"
              >
                <div className="w-10 h-10 rounded-xl bg-cyan-500/20 flex items-center justify-center flex-shrink-0">
                  <Gamepad2 className="w-5 h-5 text-cyan-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[var(--foreground)]">Test in Playground</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Chat via voice or text</p>
                </div>
                <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-cyan-400 transition-colors flex-shrink-0" />
              </Link>

              {/* Create agent CTA */}
              <Link
                href="/agents/create"
                className="flex items-center gap-3 p-4 bg-gradient-to-r from-indigo-600/10 to-violet-600/10 border border-indigo-500/20 rounded-2xl hover:border-indigo-500/40 hover:-translate-y-0.5 transition-all duration-200 group"
              >
                <div className="w-10 h-10 rounded-xl bg-indigo-500/20 flex items-center justify-center flex-shrink-0">
                  <Plus className="w-5 h-5 text-indigo-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-[var(--foreground)]">Create Agent</p>
                  <p className="text-xs text-[var(--muted-foreground)]">Deploy in minutes</p>
                </div>
                <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)] group-hover:text-indigo-400 transition-colors flex-shrink-0" />
              </Link>

              {/* Stat highlight */}
              <div className="p-4 bg-gradient-to-br from-emerald-500/8 to-teal-500/5 border border-emerald-500/20 rounded-2xl">
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-6 h-6 rounded-lg bg-emerald-500/20 flex items-center justify-center">
                    <Zap className="w-3 h-3 text-emerald-400" />
                  </div>
                  <p className="text-xs font-semibold text-emerald-400 uppercase tracking-wider">System Status</p>
                </div>
                <p className="text-2xl font-bold text-[var(--foreground)]">{stats.activeAgents}/{stats.totalAgents}</p>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Agents active right now</p>
                <div className="mt-2 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: stats.totalAgents > 0 ? `${(stats.activeAgents / stats.totalAgents) * 100}%` : "0%" }}
                    transition={{ delay: 0.5, duration: 0.8, ease: "easeOut" }}
                    className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 rounded-full"
                  />
                </div>
              </div>
            </motion.div>
          </div>

          {/* Quick-start templates */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-[var(--foreground)]">Quick-Start Templates</h3>
                <p className="text-xs text-[var(--muted-foreground)] mt-0.5">Pre-built blueprints for common public services</p>
              </div>
              <span className="text-xs text-[var(--muted-foreground)] bg-[var(--accent)] px-2.5 py-1 rounded-full border border-[var(--border)]">
                4 blueprints
              </span>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {templates.map((tmpl, i) => (
                <motion.div
                  key={tmpl.name}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.35 + i * 0.05 }}
                >
                  <Link
                    href={`/agents/create?template=${encodeURIComponent(tmpl.name)}`}
                    className={`flex flex-col gap-3 p-4 rounded-2xl border bg-gradient-to-br ${tmpl.color} hover:-translate-y-1 transition-all duration-200 group h-full`}
                  >
                    <div className="flex items-center justify-between">
                      <div className={`w-9 h-9 rounded-xl ${tmpl.iconColor} flex items-center justify-center`}>
                        <tmpl.icon className="w-4 h-4" />
                      </div>
                      <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${tmpl.tagColor} border border-current/20`}>
                        {tmpl.tag}
                      </span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-[var(--foreground)] leading-tight">{tmpl.name}</p>
                      <p className="text-xs text-[var(--muted-foreground)] mt-1 leading-snug">{tmpl.description}</p>
                    </div>
                    <div className="flex items-center gap-1 text-xs text-[var(--muted-foreground)] group-hover:text-[var(--foreground)] transition-colors mt-auto">
                      <span>Use template</span>
                      <ArrowRight className="w-3 h-3 group-hover:translate-x-0.5 transition-transform" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}
