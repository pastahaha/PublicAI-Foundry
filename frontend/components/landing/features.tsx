"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { Mic, Shield, Users, Zap, GitBranch, Eye } from "lucide-react";

const features = [
  {
    icon: Mic,
    title: "Voice-First Creation",
    description: "Speak your agent into existence. Our STT integration lets you describe agent behavior naturally.",
    color: "text-indigo-400",
    bg: "bg-indigo-500/10",
    glow: "rgba(99,102,241,0.2)",
  },
  {
    icon: Shield,
    title: "Built-in Guardrails",
    description: "Toxicity filters, PII redaction, topic restrictions, and hallucination checks — all configurable.",
    color: "text-emerald-400",
    bg: "bg-emerald-500/10",
    glow: "rgba(16,185,129,0.2)",
  },
  {
    icon: Users,
    title: "Human-in-the-Loop",
    description: "Set approval points for sensitive actions. Your team stays in control of every critical decision.",
    color: "text-cyan-400",
    bg: "bg-cyan-500/10",
    glow: "rgba(6,182,212,0.2)",
  },
  {
    icon: Zap,
    title: "Instant Deployment",
    description: "Blueprints compile to live agents in seconds. No infrastructure setup, no Docker, no DevOps.",
    color: "text-amber-400",
    bg: "bg-amber-500/10",
    glow: "rgba(245,158,11,0.2)",
  },
  {
    icon: GitBranch,
    title: "Multi-Agent Orchestration",
    description: "Chain specialist agents — planner, researcher, writer — into powerful workflows.",
    color: "text-violet-400",
    bg: "bg-violet-500/10",
    glow: "rgba(139,92,246,0.2)",
  },
  {
    icon: Eye,
    title: "Full Observability",
    description: "Every conversation logged, every decision traced. Complete audit trail for compliance.",
    color: "text-rose-400",
    bg: "bg-rose-500/10",
    glow: "rgba(244,63,94,0.2)",
  },
];

type Feature = typeof features[0];

function FeatureCard({ f, i, isInView }: { f: Feature; i: number; isInView: boolean }) {
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    setMousePos({ x: e.clientX - rect.left, y: e.clientY - rect.top });
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.5, delay: i * 0.08 }}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className="group relative bg-[var(--l-bg-alt)] border border-[var(--border)] rounded-2xl p-6 overflow-hidden cursor-default"
      style={{
        transform: hovered ? "translateY(-4px)" : "translateY(0)",
        transition: "transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease",
        boxShadow: hovered ? `0 16px 48px -8px ${f.glow}` : "none",
        borderColor: hovered ? f.glow : "",
      }}
    >
      {/* Cursor-following radial glow inside card */}
      {hovered && (
        <div
          className="absolute pointer-events-none rounded-full"
          style={{
            width: 200,
            height: 200,
            left: mousePos.x - 100,
            top: mousePos.y - 100,
            background: `radial-gradient(circle, ${f.glow} 0%, transparent 70%)`,
            transition: "opacity 0.2s",
          }}
        />
      )}

      <div className="relative">
        <div className={`w-10 h-10 rounded-lg ${f.bg} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
          <f.icon className={`w-5 h-5 ${f.color}`} />
        </div>
        <h3 className="text-[var(--foreground)] font-semibold mb-2">{f.title}</h3>
        <p className="text-[var(--muted-foreground)] text-sm leading-relaxed">{f.description}</p>
      </div>
    </motion.div>
  );
}

export function Features() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="py-32 bg-[var(--l-bg)] relative">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center mb-20"
        >
          <p className="text-violet-400 text-sm font-semibold tracking-widest uppercase mb-4">Platform Features</p>
          <h2 className="text-4xl md:text-5xl font-bold text-[var(--foreground)] leading-tight">
            Everything you need.{" "}
            <span className="gradient-text">Nothing you don&apos;t.</span>
          </h2>
        </motion.div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {features.map((f, i) => (
            <FeatureCard key={f.title} f={f} i={i} isInView={isInView} />
          ))}
        </div>
      </div>
    </section>
  );
}
