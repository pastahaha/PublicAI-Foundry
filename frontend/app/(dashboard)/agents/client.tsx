"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Bot, Plus, Edit, Trash2, MoreVertical, Search,
  Zap, ZapOff, Copy
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { Topbar } from "@/components/dashboard/topbar";

interface Agent {
  id: string;
  name: string;
  description: string | null;
  model: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export function AgentsClient({ agents: initial }: { agents: Agent[] }) {
  const router = useRouter();
  const [agents, setAgents] = useState(initial);
  const [search, setSearch] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const filtered = agents.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      (a.description || "").toLowerCase().includes(search.toLowerCase())
  );

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/agents/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setAgents((prev) => prev.filter((a) => a.id !== id));
      toast.success("Agent deleted");
    } catch {
      toast.error("Failed to delete agent");
    } finally {
      setDeleting(null);
    }
  };

  const handleToggle = async (agent: Agent) => {
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: !agent.isActive }),
      });
      if (!res.ok) throw new Error();
      setAgents((prev) =>
        prev.map((a) => (a.id === agent.id ? { ...a, isActive: !a.isActive } : a))
      );
      toast.success(`Agent ${!agent.isActive ? "activated" : "deactivated"}`);
    } catch {
      toast.error("Failed to update agent");
    }
  };

  const handleDuplicate = async (agent: Agent) => {
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${agent.name} (copy)`,
          description: agent.description,
          model: agent.model,
          systemPrompt: "(duplicate)",
          tools: [],
          guardrails: {},
        }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setAgents((prev) => [json.agent, ...prev]);
      toast.success("Agent duplicated — edit it to update the system prompt");
      router.push(`/agents/${json.agent.id}`);
    } catch {
      toast.error("Failed to duplicate");
    }
  };

  return (
    <div className="flex flex-col h-full">
      <Topbar title="Agents" subtitle="Create and manage your AI agents" />

      <div className="flex-1 p-6 overflow-y-auto dashboard-bg">
        {/* Toolbar */}
        <div className="flex items-center gap-3 mb-6">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--muted-foreground)]" />
            <Input
              placeholder="Search agents..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 bg-[var(--card)] border-[var(--border)] rounded-xl"
            />
          </div>
          <div className="ml-auto flex items-center gap-2">
            <span className="text-sm text-[var(--muted-foreground)]">{agents.length} agent{agents.length !== 1 ? "s" : ""}</span>
            <Button asChild className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
              <Link href="/agents/create">
                <Plus className="w-4 h-4 mr-1.5" />
                Create Agent
              </Link>
            </Button>
          </div>
        </div>

        {/* Grid */}
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <motion.div
              animate={{ y: [0, -8, 0] }}
              transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
              className="w-16 h-16 rounded-2xl bg-[var(--accent)] flex items-center justify-center mb-4"
            >
              <Bot className="w-8 h-8 text-[var(--muted-foreground)]" />
            </motion.div>
            <p className="text-lg font-semibold text-[var(--foreground)] mb-2">
              {search ? "No agents found" : "No agents yet"}
            </p>
            <p className="text-[var(--muted-foreground)] text-sm mb-6">
              {search ? "Try a different search term" : "Create your first AI agent — it only takes a minute"}
            </p>
            {!search && (
              <Button asChild className="bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl">
                <Link href="/agents/create">
                  <Plus className="w-4 h-4 mr-1.5" />
                  Create Agent
                </Link>
              </Button>
            )}
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <AnimatePresence mode="popLayout">
              {filtered.map((agent, i) => (
                <motion.div
                  key={agent.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3, delay: i * 0.04 }}
                  className="group relative overflow-hidden bg-[var(--card)] border border-[var(--border)] rounded-2xl p-5 hover:border-indigo-500/40 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10 transition-all duration-200"
                >
                  {/* Hover glow */}
                  <div className="absolute -top-10 -right-10 w-32 h-32 bg-indigo-500/5 rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />

                  {/* Header */}
                  <div className="relative flex items-start gap-3 mb-3">
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-indigo-600/20 to-violet-600/10 border border-indigo-500/20 flex items-center justify-center flex-shrink-0">
                      <Bot className="w-5 h-5 text-indigo-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-0.5">
                        <h3 className="font-semibold text-[var(--foreground)] truncate">{agent.name}</h3>
                      </div>
                      <div className="flex items-center gap-2">
                        <p className="text-xs text-[var(--muted-foreground)] truncate">{agent.model}</p>
                        <span className={`flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full flex-shrink-0 ${agent.isActive ? "bg-emerald-500/10 text-emerald-400" : "bg-[var(--accent)] text-[var(--muted-foreground)]"}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${agent.isActive ? "bg-emerald-400 animate-pulse" : "bg-[var(--muted-foreground)]"}`} />
                          {agent.isActive ? "Active" : "Off"}
                        </span>
                      </div>
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="w-7 h-7 opacity-0 group-hover:opacity-100 transition-opacity">
                          <MoreVertical className="w-3.5 h-3.5" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-44">
                        <DropdownMenuItem asChild>
                          <Link href={`/agents/${agent.id}`}>
                            <Edit className="w-3.5 h-3.5 mr-2" /> Edit
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleToggle(agent)}>
                          {agent.isActive
                            ? <><ZapOff className="w-3.5 h-3.5 mr-2" /> Deactivate</>
                            : <><Zap className="w-3.5 h-3.5 mr-2" /> Activate</>
                          }
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => handleDuplicate(agent)}>
                          <Copy className="w-3.5 h-3.5 mr-2" /> Duplicate
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onClick={() => handleDelete(agent.id)}
                          disabled={deleting === agent.id}
                          className="text-red-400 focus:text-red-400"
                        >
                          <Trash2 className="w-3.5 h-3.5 mr-2" />
                          {deleting === agent.id ? "Deleting..." : "Delete"}
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  {/* Description */}
                  {agent.description ? (
                    <p className="relative text-sm text-[var(--muted-foreground)] line-clamp-2 mb-4 min-h-[2.5rem]">
                      {agent.description}
                    </p>
                  ) : (
                    <div className="min-h-[2.5rem] mb-4" />
                  )}

                  {/* Footer */}
                  <div className="relative flex items-center gap-2 pt-3 border-t border-[var(--border)]">
                    <Button asChild size="sm" variant="ghost" className="flex-1 rounded-xl text-xs h-8 text-[var(--muted-foreground)] hover:text-[var(--foreground)]">
                      <Link href={`/agents/${agent.id}`}>
                        <Edit className="w-3 h-3 mr-1.5" /> Edit
                      </Link>
                    </Button>
                    <Button
                      asChild
                      size="sm"
                      className="flex-1 bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 rounded-xl text-xs h-8 border border-indigo-500/20 hover:border-indigo-500/40"
                      variant="ghost"
                    >
                      <Link href={`/playground?agent=${agent.id}`}>
                        Test in Playground
                      </Link>
                    </Button>
                  </div>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        )}
      </div>
    </div>
  );
}
