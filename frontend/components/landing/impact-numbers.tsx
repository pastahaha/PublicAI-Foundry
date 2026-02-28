"use client";

import { motion, useInView, useMotionValue, useTransform, animate } from "framer-motion";
import { useRef, useEffect } from "react";

const STATS = [
  { value: 4, suffix: "", label: "Pre-built blueprints", sub: "ready to deploy" },
  { value: 0, suffix: "", label: "Lines of code needed", sub: "seriously, zero" },
  { value: 60, suffix: "s", label: "To your first agent", sub: "from sign-up" },
  { value: 100, suffix: "%", label: "Human supervised", sub: "always in control" },
];

function CountUp({
  to,
  suffix,
  isInView,
}: {
  to: number;
  suffix: string;
  isInView: boolean;
}) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v));
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!isInView) return;
    const controls = animate(count, to, { duration: 1.6, ease: "easeOut" });
    return controls.stop;
  }, [isInView, to, count]);

  useEffect(() => {
    return rounded.on("change", (v) => {
      if (ref.current) ref.current.textContent = `${v}${suffix}`;
    });
  }, [rounded, suffix]);

  return (
    <span ref={ref}>
      0{suffix}
    </span>
  );
}

export function ImpactNumbers() {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: "-100px" });

  return (
    <section ref={ref} className="py-24 bg-[var(--l-bg-alt)] border-y border-[var(--border)]/40 relative overflow-hidden">
      {/* animated grid lines */}
      <div
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage:
            "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
          backgroundSize: "80px 80px",
        }}
      />

      <div className="relative max-w-5xl mx-auto px-6">
        <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-[var(--border)]/60">
          {STATS.map((stat, i) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, y: 24 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.12 }}
              className="group px-8 py-4 text-center first:pl-0 last:pr-0 relative"
            >
              {/* hover shimmer */}
              <div className="absolute inset-0 bg-indigo-500/0 group-hover:bg-indigo-500/[0.03] transition-colors duration-500 rounded-xl" />

              <p className="text-5xl md:text-6xl font-bold text-[var(--foreground)] mb-1 tabular-nums relative">
                <CountUp to={stat.value} suffix={stat.suffix} isInView={isInView} />
              </p>
              <p className="text-sm font-medium text-[var(--l-text-secondary)] mb-0.5">{stat.label}</p>
              <p className="text-[11px] text-[var(--muted-foreground)] italic">{stat.sub}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}
