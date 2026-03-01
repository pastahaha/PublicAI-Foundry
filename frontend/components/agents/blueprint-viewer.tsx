"use client";

import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Brain,
  Wrench,
  BarChart3,
  UserCheck,
  Sparkles,
  Box,
  Search,
  Globe,
  FileText,
  BookOpen,
  Database,
  ClipboardCheck,
  MapPin,
  Scale,
  AlertTriangle,
  Shield,
  Phone,
  Zap,
  ArrowRight,
  X,
  ChevronRight,
  Layers,
  GitBranch,
  ShieldCheck,
  BookOpenCheck,
  Loader2,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

/* ── Types ─────────────────────────────────────────────────────────── */

interface ToolVis {
  name: string;
  reason: string;
  icon: string;
  color: string;
}

interface SkillVis {
  id: string;
  reason: string;
}

interface NodeVis {
  id: string;
  name: string;
  node_type: string;
  icon: string;
  color: string;
  model_provider: string;
  model_name: string;
  temperature: number;
  has_system_prompt: boolean;
  system_prompt_preview: string;
  tools: ToolVis[];
  skills: SkillVis[];
}

interface EdgeVis {
  source: string;
  target: string;
  edge_type: string;
  condition: string | null;
}

interface KBVis {
  name: string;
  description: string;
  source_type: string;
  source_value: string;
}

interface BlueprintStats {
  total_nodes: number;
  llm_nodes: number;
  tool_nodes: number;
  total_tools: number;
  total_skills: number;
  total_edges: number;
}

interface BlueprintData {
  assistant_id: string;
  name: string;
  description: string;
  goal: string;
  use_case: string;
  agent_type: string;
  entry_point: string;
  max_iterations: number;
  nodes: NodeVis[];
  edges: EdgeVis[];
  knowledge_bases: KBVis[];
  guardrails: Record<string, unknown>;
  stats: BlueprintStats;
}

/* ── Icon registry ─────────────────────────────────────────────────── */

const ICON_MAP: Record<string, LucideIcon> = {
  Brain,
  Wrench,
  BarChart3,
  UserCheck,
  Sparkles,
  Box,
  Search,
  Globe,
  FileText,
  BookOpen,
  Database,
  ClipboardCheck,
  MapPin,
  Scale,
  AlertTriangle,
  Shield,
  Phone,
  Zap,
};

function getIcon(name: string): LucideIcon {
  return ICON_MAP[name] || Box;
}

/* ── Color map for Tailwind v4 ─────────────────────────────────────── */

const COLOR_MAP: Record<string, { bg: string; border: string; text: string; glow: string }> = {
  indigo: { bg: "bg-indigo-500/15", border: "border-indigo-500/30", text: "text-indigo-400", glow: "shadow-indigo-500/20" },
  amber: { bg: "bg-amber-500/15", border: "border-amber-500/30", text: "text-amber-400", glow: "shadow-amber-500/20" },
  cyan: { bg: "bg-cyan-500/15", border: "border-cyan-500/30", text: "text-cyan-400", glow: "shadow-cyan-500/20" },
  rose: { bg: "bg-rose-500/15", border: "border-rose-500/30", text: "text-rose-400", glow: "shadow-rose-500/20" },
  violet: { bg: "bg-violet-500/15", border: "border-violet-500/30", text: "text-violet-400", glow: "shadow-violet-500/20" },
  blue: { bg: "bg-blue-500/15", border: "border-blue-500/30", text: "text-blue-400", glow: "shadow-blue-500/20" },
  emerald: { bg: "bg-emerald-500/15", border: "border-emerald-500/30", text: "text-emerald-400", glow: "shadow-emerald-500/20" },
  red: { bg: "bg-red-500/15", border: "border-red-500/30", text: "text-red-400", glow: "shadow-red-500/20" },
  gray: { bg: "bg-gray-500/15", border: "border-gray-500/30", text: "text-gray-400", glow: "shadow-gray-500/20" },
};

function getColors(color: string) {
  return COLOR_MAP[color] || COLOR_MAP.gray;
}

/* ── SVG stroke colors (raw hex for SVG) ────────────────────────────── */

const STROKE_COLORS: Record<string, string> = {
  indigo: "#818cf8",
  amber: "#fbbf24",
  cyan: "#22d3ee",
  rose: "#fb7185",
  violet: "#a78bfa",
  blue: "#60a5fa",
  emerald: "#34d399",
  red: "#f87171",
  gray: "#9ca3af",
};

/* ── Layout engine ─────────────────────────────────────────────────── */

const NODE_WIDTH = 260;
const NODE_HEIGHT = 120;
const H_GAP = 80;
const V_GAP = 80;

interface LayoutNode {
  id: string;
  x: number;
  y: number;
  node: NodeVis;
}

function layoutNodes(
  nodes: NodeVis[],
  edges: EdgeVis[],
  entryPoint: string
): LayoutNode[] {
  // Build adjacency
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    if (!adj.has(e.source)) adj.set(e.source, []);
    adj.get(e.source)!.push(e.target);
  }

  // BFS for levels
  const levels = new Map<string, number>();
  const queue: string[] = [entryPoint];
  levels.set(entryPoint, 0);
  // Also handle nodes that aren't the entry point
  const nodeById = new Map(nodes.map((n) => [n.id, n]));

  while (queue.length > 0) {
    const curr = queue.shift()!;
    const currLevel = levels.get(curr)!;
    for (const next of adj.get(curr) || []) {
      if (next === "__end__") continue;
      if (!levels.has(next)) {
        levels.set(next, currLevel + 1);
        queue.push(next);
      }
    }
  }

  // Add any orphan nodes
  for (const n of nodes) {
    if (!levels.has(n.id)) {
      levels.set(n.id, 0);
    }
  }

  // Group by level
  const byLevel = new Map<number, string[]>();
  for (const [id, level] of levels) {
    if (!byLevel.has(level)) byLevel.set(level, []);
    byLevel.get(level)!.push(id);
  }

  const maxLevel = Math.max(...byLevel.keys(), 0);
  const result: LayoutNode[] = [];

  for (let level = 0; level <= maxLevel; level++) {
    const ids = byLevel.get(level) || [];
    const totalHeight = ids.length * NODE_HEIGHT + (ids.length - 1) * V_GAP;
    const startY = -totalHeight / 2;

    ids.forEach((id, i) => {
      const node = nodeById.get(id);
      if (!node) return;
      result.push({
        id,
        x: level * (NODE_WIDTH + H_GAP),
        y: startY + i * (NODE_HEIGHT + V_GAP),
        node,
      });
    });
  }

  // Add __end__ node as virtual
  const hasEnd = edges.some((e) => e.target === "__end__");
  if (hasEnd) {
    result.push({
      id: "__end__",
      x: (maxLevel + 1) * (NODE_WIDTH + H_GAP),
      y: 0,
      node: {
        id: "__end__",
        name: "END",
        node_type: "end",
        icon: "ArrowRight",
        color: "gray",
        model_provider: "",
        model_name: "",
        temperature: 0,
        has_system_prompt: false,
        system_prompt_preview: "",
        tools: [],
        skills: [],
      },
    });
  }

  return result;
}

/* ── Detail panel ──────────────────────────────────────────────────── */

function NodeDetailPanel({
  node,
  onClose,
}: {
  node: NodeVis;
  onClose: () => void;
}) {
  const colors = getColors(node.color);
  const Icon = getIcon(node.icon);

  return (
    <motion.div
      initial={{ x: 360, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: 360, opacity: 0 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className="absolute top-0 right-0 w-[340px] h-full bg-[var(--card)] border-l border-[var(--border)] overflow-y-auto z-30"
    >
      <div className="p-5">
        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl ${colors.bg} ${colors.border} border flex items-center justify-center`}>
              <Icon className={`w-5 h-5 ${colors.text}`} />
            </div>
            <div>
              <h3 className="font-semibold text-[var(--foreground)] text-sm">{node.name}</h3>
              <span className={`text-xs ${colors.text} capitalize`}>{node.node_type}</span>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-lg hover:bg-[var(--accent)] flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-[var(--muted-foreground)]" />
          </button>
        </div>

        {/* Model info */}
        {node.model_provider && (
          <div className="mb-4 p-3 rounded-xl bg-[var(--accent)]/50 border border-[var(--border)]">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 font-medium">Model</p>
            <p className="text-sm text-[var(--foreground)] font-mono">
              {node.model_provider}/{node.model_name}
            </p>
            <p className="text-xs text-[var(--muted-foreground)] mt-1">
              Temperature: {node.temperature}
            </p>
          </div>
        )}

        {/* System prompt */}
        {node.has_system_prompt && (
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-1.5 font-medium">System Prompt</p>
            <div className="p-3 rounded-xl bg-[var(--accent)]/30 border border-[var(--border)] text-xs text-[var(--muted-foreground)] leading-relaxed whitespace-pre-wrap">
              {node.system_prompt_preview}
              {node.system_prompt_preview.length >= 200 && (
                <span className="text-[var(--muted-foreground)]/50">…</span>
              )}
            </div>
          </div>
        )}

        {/* Tools */}
        {node.tools.length > 0 && (
          <div className="mb-4">
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-2 font-medium">
              Tools ({node.tools.length})
            </p>
            <div className="space-y-1.5">
              {node.tools.map((t) => {
                const tc = getColors(t.color);
                const TIcon = getIcon(t.icon);
                return (
                  <div
                    key={t.name}
                    className={`flex items-center gap-2.5 p-2 rounded-lg ${tc.bg} border ${tc.border}`}
                  >
                    <TIcon className={`w-3.5 h-3.5 ${tc.text} flex-shrink-0`} />
                    <div className="min-w-0">
                      <p className={`text-xs font-medium ${tc.text}`}>{t.name.replace(/_/g, " ")}</p>
                      <p className="text-[10px] text-[var(--muted-foreground)] truncate">{t.reason}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Skills */}
        {node.skills.length > 0 && (
          <div>
            <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-2 font-medium">
              Skills ({node.skills.length})
            </p>
            <div className="space-y-1.5">
              {node.skills.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-2.5 p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20"
                >
                  <Zap className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-emerald-400">{s.id.replace(/_/g, " ")}</p>
                    <p className="text-[10px] text-[var(--muted-foreground)] truncate">{s.reason}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/* ── Stat card ─────────────────────────────────────────────────────── */

function StatPill({
  icon: Icon,
  label,
  value,
  color,
}: {
  icon: LucideIcon;
  label: string;
  value: number;
  color: string;
}) {
  const c = getColors(color);
  return (
    <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full ${c.bg} border ${c.border}`}>
      <Icon className={`w-3.5 h-3.5 ${c.text}`} />
      <span className="text-xs text-[var(--muted-foreground)]">{label}</span>
      <span className={`text-xs font-semibold ${c.text}`}>{value}</span>
    </div>
  );
}

/* ── Graph canvas ──────────────────────────────────────────────────── */

function GraphCanvas({
  data,
  selectedNode,
  onSelectNode,
}: {
  data: BlueprintData;
  selectedNode: string | null;
  onSelectNode: (id: string | null) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pan, setPan] = useState({ x: 60, y: 0 });
  const [scale, setScale] = useState(1);
  const [dragging, setDragging] = useState(false);
  const lastMouse = useRef({ x: 0, y: 0 });

  const layouted = useMemo(
    () => layoutNodes(data.nodes, data.edges, data.entry_point),
    [data.nodes, data.edges, data.entry_point]
  );

  // Center vertically on mount
  useEffect(() => {
    if (containerRef.current) {
      const h = containerRef.current.clientHeight;
      setPan((p) => ({ ...p, y: h / 2 }));
    }
  }, []);

  // Pan handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    // Only start panning if clicking on the canvas background (SVG)
    if ((e.target as HTMLElement).closest("[data-graph-node]")) return;
    setDragging(true);
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (!dragging) return;
      const dx = e.clientX - lastMouse.current.x;
      const dy = e.clientY - lastMouse.current.y;
      lastMouse.current = { x: e.clientX, y: e.clientY };
      setPan((p) => ({ x: p.x + dx, y: p.y + dy }));
    },
    [dragging]
  );

  const handleMouseUp = useCallback(() => setDragging(false), []);

  // Zoom
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setScale((s) => Math.max(0.3, Math.min(2, s - e.deltaY * 0.001)));
  }, []);

  // Build position lookup
  const posMap = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const ln of layouted) {
      m.set(ln.id, { x: ln.x, y: ln.y });
    }
    return m;
  }, [layouted]);

  return (
    <div
      ref={containerRef}
      className="flex-1 relative overflow-hidden cursor-grab active:cursor-grabbing"
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
    >
      {/* Grid pattern background */}
      <svg className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.03]">
        <defs>
          <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#grid)" />
      </svg>

      <div
        style={{
          transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
          transformOrigin: "0 0",
        }}
        className="absolute"
      >
        {/* SVG layer for edges */}
        <svg
          className="absolute pointer-events-none"
          style={{
            top: -2000,
            left: -2000,
            width: 6000,
            height: 6000,
          }}
        >
          <defs>
            <marker
              id="arrowhead"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#6366f1" opacity="0.6" />
            </marker>
            <marker
              id="arrowhead-conditional"
              markerWidth="8"
              markerHeight="6"
              refX="8"
              refY="3"
              orient="auto"
            >
              <polygon points="0 0, 8 3, 0 6" fill="#fbbf24" opacity="0.6" />
            </marker>
          </defs>
          {data.edges.map((edge, i) => {
            const from = posMap.get(edge.source);
            const to = posMap.get(edge.target);
            if (!from || !to) return null;

            const x1 = from.x + NODE_WIDTH + 2000;
            const y1 = from.y + NODE_HEIGHT / 2 + 2000;
            const x2 = to.x + 2000;
            const y2 = to.y + NODE_HEIGHT / 2 + 2000;
            const midX = (x1 + x2) / 2;

            const isConditional = edge.edge_type === "conditional";
            const strokeColor = isConditional ? "#fbbf24" : "#6366f180";
            const markerId = isConditional ? "arrowhead-conditional" : "arrowhead";

            return (
              <g key={`${edge.source}-${edge.target}-${i}`}>
                <path
                  d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={2}
                  strokeDasharray={isConditional ? "6 4" : undefined}
                  markerEnd={`url(#${markerId})`}
                  opacity={0.6}
                />
                {edge.condition && (
                  <text
                    x={midX}
                    y={(y1 + y2) / 2 - 8}
                    textAnchor="middle"
                    fill="#fbbf24"
                    fontSize="10"
                    opacity="0.7"
                  >
                    {edge.condition}
                  </text>
                )}
              </g>
            );
          })}
        </svg>

        {/* Node cards */}
        {layouted.map((ln) => {
          const n = ln.node;
          const isEnd = n.id === "__end__";
          const colors = getColors(n.color);
          const Icon = isEnd ? ArrowRight : getIcon(n.icon);
          const isSelected = selectedNode === n.id;

          return (
            <motion.div
              key={ln.id}
              data-graph-node
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{
                opacity: 1,
                scale: 1,
                boxShadow: isSelected ? `0 0 24px 4px ${STROKE_COLORS[n.color] || "#6366f1"}30` : "none",
              }}
              transition={{ delay: 0.1, duration: 0.35 }}
              onClick={(e) => {
                e.stopPropagation();
                if (!isEnd) onSelectNode(isSelected ? null : n.id);
              }}
              className={`absolute rounded-2xl border backdrop-blur-sm transition-all duration-200 ${
                isEnd
                  ? "w-16 h-16 flex items-center justify-center bg-[var(--accent)]/50 border-[var(--border)] cursor-default"
                  : `cursor-pointer hover:-translate-y-0.5 hover:shadow-lg ${colors.glow} bg-[var(--card)] ${isSelected ? colors.border : "border-[var(--border)] hover:" + colors.border}`
              }`}
              style={{
                left: ln.x,
                top: ln.y,
                width: isEnd ? 64 : NODE_WIDTH,
                height: isEnd ? 64 : NODE_HEIGHT,
              }}
            >
              {isEnd ? (
                <div className="w-8 h-8 rounded-full bg-[var(--border)] flex items-center justify-center">
                  <ArrowRight className="w-4 h-4 text-[var(--muted-foreground)]" />
                </div>
              ) : (
                <div className="p-4 h-full flex flex-col">
                  {/* Node header */}
                  <div className="flex items-center gap-2.5 mb-2">
                    <div className={`w-8 h-8 rounded-lg ${colors.bg} ${colors.border} border flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${colors.text}`} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <h4 className="text-sm font-semibold text-[var(--foreground)] truncate leading-tight">
                        {n.name}
                      </h4>
                      <p className={`text-[10px] ${colors.text} capitalize`}>{n.node_type === "brain" ? "conversational core" : n.node_type}</p>
                    </div>
                    <ChevronRight className="w-3.5 h-3.5 text-[var(--muted-foreground)] opacity-0 group-hover:opacity-100 flex-shrink-0" />
                  </div>
                  {/* Meta row */}
                  <div className="mt-auto flex items-center gap-2 text-[10px] text-[var(--muted-foreground)]">
                    {n.model_name && (
                      <span className="truncate max-w-[120px] px-1.5 py-0.5 rounded bg-[var(--accent)] border border-[var(--border)]">
                        {n.model_name}
                      </span>
                    )}
                    {n.tools.length > 0 && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-500/20 text-amber-400">
                        <Wrench className="w-2.5 h-2.5" />
                        {n.tools.length}
                      </span>
                    )}
                    {n.skills.length > 0 && (
                      <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
                        <Zap className="w-2.5 h-2.5" />
                        {n.skills.length}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex items-center gap-1 bg-[var(--card)] border border-[var(--border)] rounded-xl p-1 z-20">
        <button
          onClick={() => setScale((s) => Math.min(2, s + 0.15))}
          className="w-7 h-7 rounded-lg hover:bg-[var(--accent)] flex items-center justify-center text-sm text-[var(--muted-foreground)] transition-colors"
        >
          +
        </button>
        <span className="text-[10px] text-[var(--muted-foreground)] w-10 text-center font-mono">
          {Math.round(scale * 100)}%
        </span>
        <button
          onClick={() => setScale((s) => Math.max(0.3, s - 0.15))}
          className="w-7 h-7 rounded-lg hover:bg-[var(--accent)] flex items-center justify-center text-sm text-[var(--muted-foreground)] transition-colors"
        >
          −
        </button>
      </div>
    </div>
  );
}

/* ── Main component ────────────────────────────────────────────────── */

export function BlueprintViewer({ agentId }: { agentId: string }) {
  const [data, setData] = useState<BlueprintData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/agents/${agentId}/blueprint`);
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || `HTTP ${res.status}`);
        }
        const json: BlueprintData = await res.json();
        if (!cancelled) setData(json);
      } catch (err: unknown) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load blueprint");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [agentId]);

  // Loading
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-indigo-400 animate-spin" />
          <p className="text-sm text-[var(--muted-foreground)]">Loading blueprint…</p>
        </div>
      </div>
    );
  }

  // Error
  if (error || !data) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center max-w-sm">
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl bg-red-500/10 border border-red-500/20 flex items-center justify-center">
            <AlertTriangle className="w-7 h-7 text-red-400" />
          </div>
          <p className="text-sm font-medium text-[var(--foreground)] mb-1">Failed to load blueprint</p>
          <p className="text-xs text-[var(--muted-foreground)]">{error}</p>
        </div>
      </div>
    );
  }

  const selectedNodeData = data.nodes.find((n) => n.id === selectedNode) || null;

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Top bar with agent info + stats */}
      <div className="flex-shrink-0 px-5 py-4 border-b border-[var(--border)] bg-[var(--card)]">
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-semibold text-[var(--foreground)]">{data.name}</h2>
            <p className="text-xs text-[var(--muted-foreground)] mt-0.5 max-w-lg truncate">
              {data.description || data.goal}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] bg-[var(--accent)] px-2 py-1 rounded-full border border-[var(--border)]">
              {data.agent_type}
            </span>
            <span className="text-[10px] uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2 py-1 rounded-full border border-indigo-500/20">
              {data.use_case}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <StatPill icon={Layers} label="Nodes" value={data.stats.total_nodes} color="indigo" />
          <StatPill icon={GitBranch} label="Edges" value={data.stats.total_edges} color="violet" />
          <StatPill icon={Wrench} label="Tools" value={data.stats.total_tools} color="amber" />
          <StatPill icon={Zap} label="Skills" value={data.stats.total_skills} color="emerald" />
          {data.knowledge_bases.length > 0 && (
            <StatPill icon={BookOpenCheck} label="KBs" value={data.knowledge_bases.length} color="cyan" />
          )}
          {Object.keys(data.guardrails).length > 0 && (
            <StatPill icon={ShieldCheck} label="Guardrails" value={Object.keys(data.guardrails).length} color="rose" />
          )}
        </div>
      </div>

      {/* Graph area + detail panel */}
      <div className="flex-1 flex relative overflow-hidden">
        <GraphCanvas
          data={data}
          selectedNode={selectedNode}
          onSelectNode={setSelectedNode}
        />

        <AnimatePresence>
          {selectedNodeData && (
            <NodeDetailPanel node={selectedNodeData} onClose={() => setSelectedNode(null)} />
          )}
        </AnimatePresence>
      </div>

      {/* Knowledge bases bar */}
      {data.knowledge_bases.length > 0 && (
        <div className="flex-shrink-0 px-5 py-3 border-t border-[var(--border)] bg-[var(--card)]">
          <p className="text-[10px] uppercase tracking-wider text-[var(--muted-foreground)] mb-2 font-medium">Knowledge Bases</p>
          <div className="flex items-center gap-2 overflow-x-auto">
            {data.knowledge_bases.map((kb) => (
              <div
                key={kb.name}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 flex-shrink-0"
              >
                <Database className="w-3.5 h-3.5 text-cyan-400" />
                <div>
                  <p className="text-xs text-cyan-400 font-medium">{kb.name}</p>
                  <p className="text-[10px] text-[var(--muted-foreground)]">{kb.source_type}: {kb.source_value}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
