"use client";

import { motion } from "framer-motion";

const TOP_ITEMS = [
  "PUBLIC HEALTH ASSISTANT", "LEGAL AID INTAKE AGENT", "CRISIS & COMMUNITY SUPPORT AGENT", "SYDNEY HOUSING CRISIS ADVISOR",
  "NO CODE", "SAFE AI", "VOICE FIRST", "PUBLIC GOOD",
  "GUARDRAILS", "HUMAN IN THE LOOP", "OPEN SOURCE", "BLUEPRINT DRIVEN",
];

const BOT_ITEMS = [
  "MISTRAL LARGE", "ELEVEN LABS", "LANGGRAPH", "LANGSMITH", "FASTAPI", "POSTGRESQL", "Next.js",
  "PII REDACTION", "TOXICITY FILTER", "WHATSAPP ACCESSIBLE", "24/7 UPTIME",
  "HUMAN SUPERVISED", "ZERO CODE", "SQLITE",
];

function MarqueeRow({
  items,
  reverse = false,
}: {
  items: string[];
  reverse?: boolean;
}) {
  const tripled = [...items, ...items, ...items];
  return (
    <div className="overflow-hidden flex">
      <motion.div
        className="flex gap-10 whitespace-nowrap flex-shrink-0"
        animate={{
          x: reverse ? ["-33.33%", "0%"] : ["0%", "-33.33%"],
        }}
        transition={{
          duration: 28,
          ease: "linear",
          repeat: Infinity,
        }}
      >
        {tripled.map((item, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-4 text-[10px] font-bold tracking-[0.22em] uppercase text-[var(--l-text-subtle)] hover:text-[var(--muted-foreground)] transition-colors duration-300 cursor-default"
          >
            <span className="w-1 h-1 rounded-full bg-indigo-500/40 flex-shrink-0" />
            {item}
          </span>
        ))}
      </motion.div>
    </div>
  );
}

export function MarqueeStrip() {
  return (
    <div className="py-7 bg-[var(--l-bg)] border-y border-[var(--border)]/50 relative overflow-hidden">
      {/* fade edges */}
      <div className="absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[var(--l-bg)] to-transparent z-10 pointer-events-none" />
      <div className="absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[var(--l-bg)] to-transparent z-10 pointer-events-none" />
      <div className="space-y-3.5">
        <MarqueeRow items={TOP_ITEMS} />
        <MarqueeRow items={BOT_ITEMS} reverse />
      </div>
    </div>
  );
}
