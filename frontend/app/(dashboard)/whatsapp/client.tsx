"use client";

import { motion } from "framer-motion";
import {
  MessageCircle, Copy, CheckCircle, Phone, Bot, Clock,
  QrCode, Send, Hash, ArrowRight, LogIn, List, User, MessageSquare,
} from "lucide-react";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Topbar } from "@/components/dashboard/topbar";

/* ────────── types ────────── */

interface Session {
  id: string;
  phone: string;
  agentId: string | null;
  agentName: string | null;
  updatedAt: Date;
}

interface Agent {
  id: string;
  name: string;
  isActive: boolean;
}

interface WhatsAppClientProps {
  sessions: Session[];
  agents: Agent[];
  whatsappNumber: string;
}

/* ────────── small helpers ────────── */

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} className="ml-2 text-slate-500 hover:text-indigo-400 transition-colors">
      {copied ? <CheckCircle className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

/* ────────── command reference data ────────── */

const COMMANDS = [
  { cmd: "Hey", desc: "Start or wake up the bot — shows login or main menu", icon: Send, color: "emerald" },
  { cmd: "login email password", desc: "Log into your PublicAI Foundry account", icon: LogIn, color: "indigo" },
  { cmd: "1 / 2 / 3", desc: "Navigate menus by replying with a number", icon: Hash, color: "cyan" },
  { cmd: "0", desc: "Go back to the previous menu", icon: ArrowRight, color: "amber" },
  { cmd: "menu", desc: "Jump to the main menu from anywhere", icon: List, color: "violet" },
  { cmd: "(any text)", desc: "While chatting with an agent, just type naturally", icon: MessageSquare, color: "pink" },
];

const STEPS = [
  {
    step: "1. Say Hey",
    you: "Hey",
    bot: "👋 Welcome to PublicAI Foundry!\n\nTo get started, log in:\nlogin your@email.com password",
    color: "emerald",
  },
  {
    step: "2. Log in",
    you: "login jane@gov.au MyPass123",
    bot: "✅ Welcome, Jane!\n\n1. Chat with an agent\n2. View my agents\n3. My account",
    color: "indigo",
  },
  {
    step: "3. Pick an agent",
    you: "1",
    bot: "💬 Choose an agent:\n1. Health Assistant\n2. Legal Aid\n\n0. Back",
    color: "cyan",
  },
  {
    step: "4. Start chatting",
    you: "2",
    bot: "✅ Now chatting with Legal Aid.\nSend your message. Reply 0 for menu.",
    color: "violet",
  },
  {
    step: "5. Chat freely",
    you: "I need help with my tenancy agreement",
    bot: "I can help with that. Are you experiencing issues with…\n\n(Reply 0 for menu)",
    color: "pink",
  },
];

const colorBorder: Record<string, string> = {
  emerald: "border-emerald-500/30 bg-emerald-500/5",
  indigo: "border-indigo-500/30 bg-indigo-500/5",
  cyan: "border-cyan-500/30 bg-cyan-500/5",
  violet: "border-violet-500/30 bg-violet-500/5",
  pink: "border-pink-500/30 bg-pink-500/5",
  amber: "border-amber-500/30 bg-amber-500/5",
};
const colorDot: Record<string, string> = {
  emerald: "bg-emerald-500", indigo: "bg-indigo-500", cyan: "bg-cyan-500",
  violet: "bg-violet-500", pink: "bg-pink-500", amber: "bg-amber-500",
};
const colorIcon: Record<string, string> = {
  emerald: "text-emerald-400", indigo: "text-indigo-400", cyan: "text-cyan-400",
  violet: "text-violet-400", pink: "text-pink-400", amber: "text-amber-400",
};

/* ══════════════════════════════════════════════════════════════════════════ */

export function WhatsAppClient({ sessions, agents, whatsappNumber }: WhatsAppClientProps) {
  const cleanNumber = whatsappNumber.replace(/\D/g, "");
  const waLink = `https://wa.me/${cleanNumber}?text=Hey`;

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      <Topbar title="WhatsApp" subtitle="Chat with your AI agents from WhatsApp" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl">

        {/* ─── Hero: QR + Number + Quick Start ─── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
        >
          <div className="flex flex-col sm:flex-row items-center gap-8">
            {/* QR Code */}
            <div className="flex-shrink-0 space-y-3 text-center">
              <div className="p-4 rounded-2xl bg-white shadow-lg inline-block">
                <QRCodeSVG
                  value={waLink}
                  size={160}
                  bgColor="#ffffff"
                  fgColor="#111827"
                  level="M"
                  includeMargin={false}
                />
              </div>
              <p className="text-[10px] text-[var(--muted-foreground)] uppercase tracking-wider font-semibold">
                Scan with phone camera
              </p>
            </div>

            {/* Info */}
            <div className="flex-1 text-center sm:text-left space-y-4">
              <div>
                <div className="flex items-center justify-center sm:justify-start gap-2 mb-1">
                  <QrCode className="w-4 h-4 text-emerald-400" />
                  <span className="text-base font-semibold text-[var(--foreground)]">
                    Get Started in Seconds
                  </span>
                </div>
                <p className="text-sm text-[var(--muted-foreground)]">
                  Scan the QR code or tap the link below to open WhatsApp.
                  Send <code className="px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 font-semibold">Hey</code>{" "}
                  to start the conversation.
                </p>
              </div>

              {/* Number row */}
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--accent)] border border-[var(--border)]">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <code className="text-sm font-mono text-[var(--foreground)]">{whatsappNumber}</code>
                <CopyButton text={whatsappNumber} />
              </div>

              {/* Quick-start steps */}
              <div className="space-y-1.5 text-xs text-[var(--muted-foreground)]">
                <p className="font-semibold text-[var(--foreground)] text-sm mb-1">Quick start:</p>
                <p>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-emerald-500/10 text-emerald-400 text-[10px] font-bold mr-1.5">1</span>
                  Open WhatsApp → Send <code className="text-emerald-400 font-mono">Hey</code>
                </p>
                <p>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-indigo-500/10 text-indigo-400 text-[10px] font-bold mr-1.5">2</span>
                  Log in: <code className="text-indigo-400 font-mono">login your@email.com password</code>
                </p>
                <p>
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-bold mr-1.5">3</span>
                  Reply <code className="text-cyan-400 font-mono">1</code> to start chatting with an agent
                </p>
              </div>

              {/* Open WhatsApp button */}
              <a
                href={waLink}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Open WhatsApp
                <ArrowRight className="w-3.5 h-3.5" />
              </a>
            </div>
          </div>
        </motion.div>

        {/* ─── Command Reference ─── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
        >
          <h2 className="text-base font-semibold text-[var(--foreground)] mb-1">Commands Reference</h2>
          <p className="text-xs text-[var(--muted-foreground)] mb-4">
            Everything you can send to the bot. No complicated syntax — just simple messages.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {COMMANDS.map((c, i) => {
              const Icon = c.icon;
              return (
                <div key={i} className={`flex items-start gap-3 rounded-xl border p-3 ${colorBorder[c.color]}`}>
                  <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 bg-[var(--accent)]`}>
                    <Icon className={`w-3.5 h-3.5 ${colorIcon[c.color]}`} />
                  </div>
                  <div className="min-w-0">
                    <code className="text-sm font-mono text-[var(--foreground)] font-semibold">{c.cmd}</code>
                    <p className="text-xs text-[var(--muted-foreground)] mt-0.5">{c.desc}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>

        {/* ─── Step-by-step Flow ─── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
        >
          <h2 className="text-base font-semibold text-[var(--foreground)] mb-1">
            How a Conversation Looks
          </h2>
          <p className="text-xs text-[var(--muted-foreground)] mb-5">
            Follow along — the bot guides you step by step.
          </p>

          <div className="space-y-3">
            {STEPS.map((item, i) => (
              <div key={i} className={`rounded-xl border p-4 ${colorBorder[item.color]}`}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className={`w-5 h-5 rounded-full ${colorDot[item.color]} text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0`}>
                    {i + 1}
                  </span>
                  <span className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider">
                    {item.step}
                  </span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 text-xs">
                  <div className="flex-1 space-y-1">
                    <p className="text-[var(--muted-foreground)] text-[10px] uppercase tracking-wide">You send</p>
                    <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 font-mono text-[var(--foreground)]">
                      {item.you}
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-[var(--muted-foreground)] text-[10px] uppercase tracking-wide">Bot replies</p>
                    <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 font-mono text-[var(--foreground)] whitespace-pre-line leading-relaxed">
                      {item.bot}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--border)] flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--muted-foreground)]">
            <span>Reply <code className="text-amber-400 font-semibold">0</code> → go back</span>
            <span>Reply <code className="text-violet-400 font-semibold">menu</code> → main menu</span>
            <span>While chatting → just type your question</span>
          </div>
        </motion.div>

        {/* ─── Active Sessions ─── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.15 }}
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
        >
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold text-[var(--foreground)]">Active Sessions</h2>
            <span className="text-xs text-[var(--muted-foreground)] bg-[var(--accent)] px-2.5 py-1 rounded-full">
              {sessions.length} connected
            </span>
          </div>

          {sessions.length === 0 ? (
            <div className="text-center py-10">
              <MessageCircle className="w-8 h-8 text-[var(--muted-foreground)] mx-auto mb-3 opacity-40" />
              <p className="text-sm text-[var(--muted-foreground)]">No active sessions yet.</p>
              <p className="text-xs text-[var(--muted-foreground)] mt-1">
                Sessions appear here when users log in from WhatsApp.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div
                  key={s.id}
                  className="flex items-center gap-4 p-3 rounded-xl border border-[var(--border)] hover:bg-[var(--accent)] transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)] truncate">{s.phone}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {s.agentName ? (
                        <span className="flex items-center gap-1 text-xs text-indigo-400">
                          <Bot className="w-3 h-3" />
                          {s.agentName}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--muted-foreground)]">Browsing menu</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                    <Clock className="w-3 h-3" />
                    {new Date(s.updatedAt).toLocaleTimeString([], {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* ─── Available Agents ─── */}
        {agents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.2 }}
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-base font-semibold text-[var(--foreground)]">Available Agents</h2>
              <User className="w-4 h-4 text-[var(--muted-foreground)]" />
            </div>
            <div className="space-y-2">
              {agents.map((a) => (
                <div key={a.id} className="flex items-center gap-3 p-3 rounded-xl border border-[var(--border)]">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${a.isActive ? "bg-emerald-400" : "bg-slate-600"}`} />
                  <span className="text-sm text-[var(--foreground)] flex-1">{a.name}</span>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${
                    a.isActive
                      ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                      : "bg-slate-500/10 text-slate-500 border border-slate-700"
                  }`}>
                    {a.isActive ? "Available on WhatsApp" : "Inactive"}
                  </span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
