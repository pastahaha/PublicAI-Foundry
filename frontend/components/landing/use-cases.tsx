"use client";

import { motion, useInView } from "framer-motion";
import { useRef, useState } from "react";
import { Heart, Scale, AlertTriangle, Home } from "lucide-react";

const cases = [
  {
    icon: Heart,
    title: "Healthcare Assistant",
    description: "Answers patient questions 24/7, triages symptoms, and escalates to human doctors when needed.",
    tags: ["Healthcare", "Triage", "HITL"],
    color: "from-rose-500/20 to-pink-500/20",
    border: "border-rose-500/20",
    glow: "rgba(244,63,94,0.15)",
    iconColor: "text-rose-400",
    iconBg: "bg-rose-500/10",
  },
  {
    icon: Scale,
    title: "Legal Aid Advisor",
    description: "Guides low-income clients through initial legal intake, identifies case types, and books appointments.",
    tags: ["Legal", "Intake", "Guardrails"],
    color: "from-violet-500/20 to-indigo-500/20",
    border: "border-violet-500/20",
    glow: "rgba(139,92,246,0.15)",
    iconColor: "text-violet-400",
    iconBg: "bg-violet-500/10",
  },
  {
    icon: AlertTriangle,
    title: "Crisis and Community Support Agent",
    description: "Provides empathetic first-response support for mental health crises with immediate escalation protocols.",
    tags: ["Mental Health", "Crisis", "24/7"],
    color: "from-amber-500/20 to-orange-500/20",
    border: "border-amber-500/20",
    glow: "rgba(245,158,11,0.15)",
    iconColor: "text-amber-400",
    iconBg: "bg-amber-500/10",
  },
  {
    icon: Home,
    title: "NSW Housing Crisis Advisor",
    description: "Helps Sydney residents navigate housing assistance, emergency accommodation, and tenancy rights.",
    tags: ["Housing", "Sydney", "Advice"],
    color: "from-teal-500/20 to-cyan-500/20",
    border: "border-teal-500/20",
    glow: "rgba(20,184,166,0.15)",
    iconColor: "text-teal-400",
    iconBg: "bg-teal-500/10",
  },
];

type CaseItem = typeof cases[0];

function TiltCard({ c, i, isInView }: { c: CaseItem; i: number; isInView: boolean }) {
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [hovered, setHovered] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const onMove = (e: React.MouseEvent) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;
    const dx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const dy = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    setTilt({ x: dy * -6, y: dx * 6 });
  };

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: i % 2 === 0 ? -40 : 40 }}
      animate={isInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.6, delay: i * 0.1 }}
      onMouseMove={onMove}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setTilt({ x: 0, y: 0 }); }}
      style={{
        transform: hovered
          ? `perspective(800px) rotateX(${tilt.x}deg) rotateY(${tilt.y}deg) scale(1.025)`
          : "perspective(800px) rotateX(0deg) rotateY(0deg) scale(1)",
        transition: hovered ? "transform 0.12s ease-out" : "transform 0.5s ease-out",
        boxShadow: hovered ? `0 24px 60px -12px ${c.glow}` : "none",
      }}
      className={`relative group rounded-2xl border ${c.border} bg-gradient-to-br ${c.color} p-8 cursor-pointer overflow-hidden`}
    >
      <div
        className="absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-400 pointer-events-none"
        style={{ background: `radial-gradient(ellipse at 50% -10%, ${c.glow} 0%, transparent 55%)` }}
      />
      <div className="relative flex items-start gap-4">
        <div className={`w-12 h-12 rounded-xl ${c.iconBg} flex items-center justify-center flex-shrink-0 group-hover:scale-110 transition-transform duration-300`}>
          <c.icon className={`w-6 h-6 ${c.iconColor}`} />
        </div>
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-[var(--foreground)] mb-2">{c.title}</h3>
          <p className="text-[var(--muted-foreground)] text-sm leading-relaxed mb-4">{c.description}</p>
          <div className="flex flex-wrap gap-2">
            {c.tags.map((tag) => (
              <span key={tag} className="text-xs px-2.5 py-1 rounded-full bg-[var(--accent)] text-[var(--muted-foreground)] border border-[var(--border)]/40">
                {tag}
              </span>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

export function UseCases() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="py-32 bg-[var(--l-bg-alt)] relative">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center mb-20"
        >
          <p className="text-cyan-400 text-sm font-semibold tracking-widest uppercase mb-4">Real-World Impact</p>
          <h2 className="text-4xl md:text-5xl font-bold text-[var(--foreground)] leading-tight">
            Agents built for{" "}
            <span className="gradient-text">people who need it most</span>
          </h2>
          <p className="text-[var(--muted-foreground)] mt-4 text-lg max-w-2xl mx-auto">
            Four pre-built blueprints for high-impact public service use cases, ready to deploy in 60 seconds.
          </p>
        </motion.div>

        <div className="grid md:grid-cols-2 gap-6">
          {cases.map((c, i) => (
            <TiltCard key={c.title} c={c} i={i} isInView={isInView} />
          ))}
        </div>
      </div>
    </section>
  );
}
