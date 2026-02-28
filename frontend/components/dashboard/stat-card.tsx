"use client";

import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string | number;
  icon: LucideIcon;
  color: string; // "bg-indigo-500" | "bg-emerald-500" | "bg-violet-500" | "bg-cyan-500"
  delay?: number;
}

const colorMap: Record<string, { icon: string; glow: string; border: string; bar: string }> = {
  "bg-indigo-500":  { icon: "bg-indigo-500/15 text-indigo-400 border-indigo-500/20",  glow: "from-indigo-500/8",  border: "hover:border-indigo-500/25 border-[var(--border)]",  bar: "bg-indigo-500" },
  "bg-emerald-500": { icon: "bg-emerald-500/15 text-emerald-400 border-emerald-500/20", glow: "from-emerald-500/8", border: "hover:border-emerald-500/25 border-[var(--border)]", bar: "bg-emerald-500" },
  "bg-violet-500":  { icon: "bg-violet-500/15 text-violet-400 border-violet-500/20",  glow: "from-violet-500/8",  border: "hover:border-violet-500/25 border-[var(--border)]",  bar: "bg-violet-500" },
  "bg-cyan-500":    { icon: "bg-cyan-500/15 text-cyan-400 border-cyan-500/20",        glow: "from-cyan-500/8",    border: "hover:border-cyan-500/25 border-[var(--border)]",    bar: "bg-cyan-500" },
};

export function StatCard({ label, value, icon: Icon, color, delay = 0 }: StatCardProps) {
  const c = colorMap[color] ?? colorMap["bg-indigo-500"];

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay }}
      className={`relative overflow-hidden bg-[var(--card)] ${c.border} border rounded-2xl p-5 hover:-translate-y-1 hover:shadow-xl hover:shadow-black/10 transition-all duration-300 group cursor-default`}
    >
      {/* Ambient corner glow */}
      <div className={`absolute -top-8 -right-8 w-28 h-28 rounded-full bg-gradient-to-br ${c.glow} to-transparent blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500`} />

      {/* Top accent bar */}
      <div className={`absolute top-0 left-6 right-6 h-[2px] ${c.bar} opacity-50 rounded-b-full`} />

      <div className="relative">
        {/* Icon */}
        <div className={`w-10 h-10 rounded-xl ${c.icon} border flex items-center justify-center mb-4`}>
          <Icon className="w-5 h-5" />
        </div>

        {/* Value */}
        <motion.p
          className="text-3xl font-bold text-[var(--foreground)] tracking-tight leading-none mb-1.5"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: delay + 0.15 }}
        >
          {value}
        </motion.p>

        {/* Label */}
        <p className="text-xs font-medium text-[var(--muted-foreground)] uppercase tracking-widest">
          {label}
        </p>
      </div>
    </motion.div>
  );
}
