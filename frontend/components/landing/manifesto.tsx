"use client";

import { motion, useInView } from "framer-motion";
import { useRef } from "react";

const WORDS = [
  { text: "Public", cls: "text-[var(--l-text-tertiary)]" },
  { text: "services", cls: "text-[var(--l-text-tertiary)]" },
  { text: "deserve", cls: "text-[var(--foreground)]" },
  { text: "AI", cls: "gradient-text" },
  { text: "that's", cls: "text-[var(--foreground)]" },
  { text: "safe,", cls: "text-indigo-400" },
  { text: "supervised,", cls: "text-indigo-400" },
  { text: "and", cls: "text-[var(--foreground)]" },
  { text: "actually", cls: "text-[var(--foreground)]" },
  { text: "works.", cls: "text-[var(--foreground)]" },
];

export function Manifesto() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-120px" });

  return (
    <section
      ref={ref}
      className="py-28 md:py-36 bg-[var(--l-bg)] relative overflow-hidden"
    >
      {/* subtle noise grain */}
      <div
        className="absolute inset-0 opacity-[0.018] pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* background accent */}
      <motion.div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] rounded-full pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse, rgba(99,102,241,0.06) 0%, transparent 65%)",
        }}
        animate={{ scale: [1, 1.08, 1] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />

      <div className="relative max-w-5xl mx-auto px-6">
        {/* editorial label */}
        <motion.p
          initial={{ opacity: 0, y: 16 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.5 }}
          className="text-[10px] text-[var(--l-text-subtle)] tracking-[0.35em] uppercase font-semibold mb-10 text-center"
        >
          Our Belief · Est. 2026
        </motion.p>

        {/* big statement */}
        <h2 className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-center leading-[1.08] tracking-tight">
          {WORDS.map((word, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 48, filter: "blur(8px)" }}
              animate={
                isInView
                  ? { opacity: 1, y: 0, filter: "blur(0px)" }
                  : {}
              }
              transition={{
                duration: 0.65,
                delay: i * 0.075,
                ease: [0.22, 1, 0.36, 1],
              }}
              className={`text-5xl md:text-7xl lg:text-8xl font-bold ${word.cls}`}
            >
              {word.text}
            </motion.span>
          ))}
        </h2>

        {/* signature line */}
        <motion.div
          initial={{ opacity: 0, scaleX: 0 }}
          animate={isInView ? { opacity: 1, scaleX: 1 } : {}}
          transition={{ duration: 0.8, delay: 0.9 }}
          className="mt-14 flex items-center justify-center gap-6"
        >
          <div className="h-px flex-1 max-w-[120px] bg-gradient-to-r from-transparent to-[var(--l-text-subtle)]" />
          <p className="text-[10px] text-[var(--l-text-subtle)] tracking-[0.3em] uppercase font-medium">
            PublicAI Foundry — Building Safe AI for Public Good
          </p>
          <div className="h-px flex-1 max-w-[120px] bg-gradient-to-l from-transparent to-[var(--l-text-subtle)]" />
        </motion.div>
      </div>
    </section>
  );
}
