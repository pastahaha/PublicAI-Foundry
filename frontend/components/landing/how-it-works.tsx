"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";
import { FileJson, Cpu, ShieldCheck } from "lucide-react";

const steps = [
  {
    icon: FileJson,
    step: "01",
    title: "Define Your Agent",
    description:
      "Describe your agent in plain language or use our form — no JSON required. Type or speak your instructions.",
    color: "from-indigo-500 to-violet-500",
  },
  {
    icon: Cpu,
    step: "02",
    title: "Deploy Instantly",
    description:
      "Your blueprint compiles into a live agent in seconds. Choose your model, add tools, set guardrails.",
    color: "from-cyan-500 to-blue-500",
  },
  {
    icon: ShieldCheck,
    step: "03",
    title: "Supervise & Refine",
    description:
      "Monitor conversations, approve sensitive actions, and continuously improve your agent with real data.",
    color: "from-emerald-500 to-teal-500",
  },
];

export function HowItWorks() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="py-32 bg-[var(--l-bg)] relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-indigo-950/10 to-transparent" />

      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.7 }}
          className="text-center mb-20"
        >
          <p className="text-indigo-400 text-sm font-semibold tracking-widest uppercase mb-4">
            How It Works
          </p>
          <h2 className="text-4xl md:text-5xl font-bold text-[var(--foreground)] leading-tight">
            From idea to live agent in{" "}
            <span className="gradient-text">minutes</span>
          </h2>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 relative">
          {/* Connecting line */}
          <div className="hidden md:block absolute top-12 left-1/4 right-1/4 h-0.5 bg-gradient-to-r from-indigo-500/50 via-cyan-500/50 to-emerald-500/50" />

          {steps.map((step, i) => (
            <motion.div
              key={step.step}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.15 }}
              className="relative group"
            >
              <div className="bg-[var(--l-bg-alt)] border border-[var(--border)] rounded-2xl p-8 hover:border-indigo-500/40 transition-all duration-300 hover:-translate-y-1">
                <div className={`w-14 h-14 rounded-xl bg-gradient-to-br ${step.color} flex items-center justify-center mb-6 group-hover:scale-110 transition-transform duration-300`}>
                  <step.icon className="w-7 h-7 text-white" />
                </div>
                <div className="text-5xl font-bold text-[var(--l-text-ghost)] mb-3">{step.step}</div>
                <h3 className="text-xl font-semibold text-[var(--foreground)] mb-3">{step.title}</h3>
                <p className="text-[var(--muted-foreground)] leading-relaxed">{step.description}</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
