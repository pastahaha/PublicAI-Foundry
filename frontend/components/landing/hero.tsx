"use client";

import { motion, AnimatePresence } from "framer-motion";
import Link from "next/link";
import { ArrowRight, Sparkles, Bot, User, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState, useEffect } from "react";

const USE_CASES = [
  "healthcare support",
  "legal aid advice",
  "crisis & community",
  "NSW housing crisis",
  "everything that you can imagine",
];

const CHAT_SEQUENCE = [
  { role: "user", text: "Patient: high fever 39.8°C and chest tightness since this morning" },
  { role: "bot", text: "Activating emergency triage. Connecting to on-call nurse. ETA 2 min." },
  { role: "user", text: "Check if they have any medication allergies on file?" },
  { role: "bot", text: "No known allergies found. Flagging case for human review now." },
];

function TypingText({ text, onDone }: { text: string; onDone?: () => void }) {
  const [displayed, setDisplayed] = useState("");
  useEffect(() => {
    setDisplayed("");
    let i = 0;
    const id = setInterval(() => {
      i++;
      setDisplayed(text.slice(0, i));
      if (i >= text.length) { clearInterval(id); setTimeout(() => onDone?.(), 300); }
    }, 20);
    return () => clearInterval(id);
  }, [text, onDone]);
  return <span>{displayed}<span className="opacity-60">|</span></span>;
}

function LiveChatCard() {
  const [visible, setVisible] = useState<number[]>([]);
  const [typing, setTyping] = useState(false);
  const [typingIdx, setTypingIdx] = useState(-1);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setVisible([]); setTyping(false); setTypingIdx(-1);
      for (let i = 0; i < CHAT_SEQUENCE.length; i++) {
        if (cancelled) return;
        await new Promise((r) => setTimeout(r, i === 0 ? 700 : 800));
        if (cancelled) return;
        if (CHAT_SEQUENCE[i].role === "bot") {
          setTyping(true);
          await new Promise((r) => setTimeout(r, 650));
          if (cancelled) return;
          setTyping(false); setTypingIdx(i);
          await new Promise((r) => setTimeout(r, CHAT_SEQUENCE[i].text.length * 20 + 400));
          if (cancelled) return;
          setVisible((p) => [...p, i]); setTypingIdx(-1);
        } else {
          setVisible((p) => [...p, i]);
          await new Promise((r) => setTimeout(r, 200));
        }
      }
      await new Promise((r) => setTimeout(r, 2800));
      if (!cancelled) run();
    };
    run();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="relative w-full max-w-[340px]">
      <div className="absolute -inset-6 rounded-3xl bg-indigo-500/8 blur-3xl" />
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
        className="relative bg-slate-900/90 backdrop-blur border border-slate-700/60 rounded-2xl overflow-hidden shadow-2xl"
      >
        {/* macOS titlebar */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-800 bg-[#111118]">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/70" />
            <div className="w-2.5 h-2.5 rounded-full bg-emerald-500/70" />
          </div>
          <div className="flex items-center gap-2 ml-1">
            <div className="w-4 h-4 rounded bg-indigo-600 flex items-center justify-center">
              <Sparkles className="w-2.5 h-2.5 text-white" />
            </div>
            <span className="text-[11px] text-slate-400 font-medium">Public Health Assistant</span>
          </div>
          <div className="ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[9px] text-emerald-400">Live</span>
          </div>
        </div>

        {/* Guardrail strip */}
        <div className="flex items-center gap-1.5 px-4 py-1.5 bg-emerald-500/5 border-b border-emerald-500/10">
          <Shield className="w-2.5 h-2.5 text-emerald-400 flex-shrink-0" />
          <span className="text-[9px] text-emerald-400 font-medium tracking-wide">Guardrails on · PII redacted · HITL enabled</span>
        </div>

        {/* Messages */}
        <div className="p-4 space-y-3 min-h-[200px]">
          <AnimatePresence>
            {CHAT_SEQUENCE.map((msg, i) => {
              const show = visible.includes(i);
              const isTyping = typingIdx === i;
              if (!show && !isTyping) return null;
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.28 }}
                  className={`flex gap-2 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  {msg.role === "bot" && (
                    <div className="w-5 h-5 rounded-md bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <Bot className="w-2.5 h-2.5 text-indigo-400" />
                    </div>
                  )}
                  <div className={`max-w-[82%] rounded-xl px-3 py-2 text-[11px] leading-relaxed ${
                    msg.role === "user"
                      ? "bg-indigo-600 text-white rounded-tr-sm"
                      : "bg-slate-800 text-slate-200 border border-slate-700/60 rounded-tl-sm"
                  }`}>
                    {isTyping ? <TypingText text={msg.text} /> : msg.text}
                  </div>
                  {msg.role === "user" && (
                    <div className="w-5 h-5 rounded-md bg-slate-700 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User className="w-2.5 h-2.5 text-slate-300" />
                    </div>
                  )}
                </motion.div>
              );
            })}
            {typing && (
              <motion.div key="dots" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex gap-2">
                <div className="w-5 h-5 rounded-md bg-indigo-600/20 border border-indigo-500/30 flex items-center justify-center flex-shrink-0">
                  <Bot className="w-2.5 h-2.5 text-indigo-400" />
                </div>
                <div className="bg-slate-800 border border-slate-700/60 rounded-xl rounded-tl-sm px-3 py-2">
                  <div className="flex gap-1">
                    <span className="thinking-dot w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                    <span className="thinking-dot w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                    <span className="thinking-dot w-1.5 h-1.5 bg-indigo-400 rounded-full" />
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Input bar */}
        <div className="px-4 py-2.5 border-t border-slate-800 bg-[#111118] flex items-center gap-2">
          <div className="flex-1 bg-slate-800/80 rounded-lg px-3 py-1.5 text-[10px] text-slate-600">
            Type or hold mic to speak...
          </div>
          <div className="w-6 h-6 rounded-lg bg-indigo-600/20 flex items-center justify-center flex-shrink-0">
            <ArrowRight className="w-3 h-3 text-indigo-400" />
          </div>
        </div>
      </motion.div>

      {/* Floating badges */}
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.2, duration: 0.5 }}
        className="absolute -right-4 top-16 bg-slate-900 border border-emerald-500/30 rounded-xl px-3 py-2 shadow-xl"
      >
        <p className="text-[10px] text-emerald-400 font-semibold">✓ Guardrails</p>
        <p className="text-[9px] text-slate-500">Toxicity blocked</p>
      </motion.div>
      <motion.div
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        transition={{ delay: 1.5, duration: 0.5 }}
        className="absolute -left-4 bottom-20 bg-slate-900 border border-indigo-500/30 rounded-xl px-3 py-2 shadow-xl"
      >
        <p className="text-[10px] text-indigo-400 font-semibold">⚡ Mistral Large</p>
        <p className="text-[9px] text-slate-500">128k context</p>
      </motion.div>
    </div>
  );
}

export function Hero() {
  const [wordIndex, setWordIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setWordIndex((i) => (i + 1) % USE_CASES.length), 2200);
    return () => clearInterval(id);
  }, []);

  return (
    <section className="relative min-h-screen flex items-center overflow-hidden bg-[var(--l-bg)]">
      <div className="absolute inset-0 hero-gradient" />
      <div
        className="absolute inset-0 opacity-[0.025]"
        style={{
          backgroundImage: "linear-gradient(to right,#fff 1px,transparent 1px),linear-gradient(to bottom,#fff 1px,transparent 1px)",
          backgroundSize: "72px 72px",
        }}
      />

      {/* Orbs */}
      <motion.div className="absolute top-1/3 left-1/5 w-[500px] h-[500px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle,rgba(99,102,241,0.13) 0%,transparent 70%)" }}
        animate={{ scale: [1, 1.18, 1], x: [0, 24, 0], y: [0, -18, 0] }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute bottom-1/4 right-1/4 w-[380px] h-[380px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle,rgba(6,182,212,0.08) 0%,transparent 70%)" }}
        animate={{ scale: [1.1, 1, 1.1], x: [0, -18, 0], y: [0, 18, 0] }}
        transition={{ duration: 10, repeat: Infinity, ease: "easeInOut" }} />
      <motion.div className="absolute top-1/2 right-1/3 w-[280px] h-[280px] rounded-full pointer-events-none"
        style={{ background: "radial-gradient(circle,rgba(139,92,246,0.07) 0%,transparent 70%)" }}
        animate={{ scale: [1, 1.25, 1] }}
        transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }} />

      <div className="relative z-10 max-w-7xl mx-auto px-6 pt-28 pb-16 w-full">
        <div className="flex flex-col lg:flex-row items-center gap-16">

          {/* Left */}
          <div className="flex-1 text-center lg:text-left max-w-2xl">
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5 }}
              className="inline-flex items-center gap-2 mb-8 px-4 py-2 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 text-sm font-medium"
            >
              <Sparkles className="w-3.5 h-3.5" />
              No code required · Human-supervised · Open source
            </motion.div>

            <div className="overflow-hidden">
              <motion.h1
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, delay: 0.1 }}
                className="text-5xl md:text-6xl lg:text-7xl font-bold text-[var(--foreground)] leading-[1.05] tracking-tight mb-4"
              >
                Safe AI Agents
                <br />
                <span className="text-[var(--l-text-tertiary)] font-light">built for</span>{" "}
                <span className="relative inline-block min-w-[6ch]">
                  <AnimatePresence mode="wait">
                    <motion.span
                      key={wordIndex}
                      initial={{ opacity: 0, y: 24, filter: "blur(10px)" }}
                      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
                      exit={{ opacity: 0, y: -24, filter: "blur(10px)" }}
                      transition={{ duration: 0.38, ease: "easeOut" }}
                      className="gradient-text"
                    >
                      {USE_CASES[wordIndex]}.
                    </motion.span>
                  </AnimatePresence>
                </span>
              </motion.h1>
            </div>

            <motion.p
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.25 }}
              className="text-lg text-[var(--muted-foreground)] mb-10 leading-relaxed max-w-xl"
            >
              Deploy guardrail-protected, voice-first AI agents for public services —
              Personal Health Assistant, Legal Aid Advisor, Crisis & Community Support Agent, NSW Housing Crisis Advisor, and anything that you can imagine — without writing a single line of code.
            </motion.p>

            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, delay: 0.35 }}
              className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start"
            >
              <Button asChild size="lg"
                className="group bg-indigo-600 hover:bg-indigo-500 text-white font-semibold px-8 py-6 text-base rounded-xl glow-primary transition-all duration-300 hover:scale-[1.03]"
              >
                <Link href="/signup">
                  Start Building Free
                  <ArrowRight className="ml-2 w-4 h-4 group-hover:translate-x-1 transition-transform duration-200" />
                </Link>
              </Button>
              <Button asChild size="lg" variant="outline"
                className="border-[var(--border)] text-[var(--l-text-secondary)] hover:bg-[var(--accent)] hover:text-[var(--foreground)] px-8 py-6 text-base rounded-xl transition-all duration-300 hover:scale-[1.03]"
              >
                <Link href="/login">Sign In</Link>
              </Button>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.6 }}
              className="mt-12 flex items-center gap-10 justify-center lg:justify-start"
            >
              {[
                { value: "4", label: "Pre-built templates" },
                { value: "60s", label: "To your first agent" },
                { value: "0", label: "Lines of code" },
              ].map((s, i) => (
                <motion.div
                  key={s.label}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.7 + i * 0.1 }}
                  className="text-center lg:text-left"
                >
                  <p className="text-2xl font-bold text-[var(--foreground)]">{s.value}</p>
                  <p className="text-xs text-[var(--muted-foreground)] mt-0.5 whitespace-nowrap">{s.label}</p>
                </motion.div>
              ))}
            </motion.div>
          </div>

          {/* Right — live chat */}
          <motion.div
            initial={{ opacity: 0, x: 50, scale: 0.96 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            transition={{ duration: 0.8, delay: 0.4, ease: "easeOut" }}
            className="flex-shrink-0 w-full lg:w-auto flex justify-center lg:justify-end"
          >
            <LiveChatCard />
          </motion.div>
        </div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 1.8 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-[var(--l-text-subtle)]"
      >
        <span className="text-[9px] tracking-[0.2em] uppercase">Scroll</span>
        <motion.div
          className="w-px h-8 bg-gradient-to-b from-slate-600 to-transparent"
          animate={{ scaleY: [0, 1, 0], opacity: [0, 1, 0] }}
          transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        />
      </motion.div>
    </section>
  );
}
