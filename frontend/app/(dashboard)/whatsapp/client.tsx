"use client";

import { motion } from "framer-motion";
import { MessageCircle, Copy, CheckCircle, Phone, Bot, Clock, QrCode } from "lucide-react";
import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { Topbar } from "@/components/dashboard/topbar";

const WHATSAPP_NUMBER = process.env.NEXT_PUBLIC_TWILIO_WHATSAPP_NUMBER || "";

const MENU_FLOW = [
  {
    step: "Login",
    msg: "login email password",
    reply: "✅ Welcome! What would you like to do?\n1. Chat with an agent\n2. Manage agents\n3. My account",
    color: "indigo",
  },
  {
    step: "Choose option",
    msg: "1",
    reply: "Choose an agent:\n1. Health Assistant\n2. Legal Aid\n0. Back",
    color: "cyan",
  },
  {
    step: "Select agent",
    msg: "2",
    reply: "✅ Now chatting with Legal Aid.\nSend your message. Reply 0 to return to the menu.",
    color: "emerald",
  },
  {
    step: "Chat freely",
    msg: "I need help with my tenancy",
    reply: "I can help with that. Are you experiencing...\n\n_(Reply 0 for menu)_",
    color: "violet",
  },
];

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
}

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

const colorMap: Record<string, string> = {
  indigo: "border-indigo-500/30 bg-indigo-500/5",
  cyan: "border-cyan-500/30 bg-cyan-500/5",
  emerald: "border-emerald-500/30 bg-emerald-500/5",
  violet: "border-violet-500/30 bg-violet-500/5",
};
const bubbleMap: Record<string, string> = {
  indigo: "bg-indigo-600",
  cyan: "bg-cyan-600",
  emerald: "bg-emerald-600",
  violet: "bg-violet-600",
};

export function WhatsAppClient({ sessions, agents }: WhatsAppClientProps) {
  const waLink = WHATSAPP_NUMBER
    ? `https://wa.me/${WHATSAPP_NUMBER.replace(/\D/g, "")}`
    : "";

  return (
    <div className="flex flex-col h-full bg-[var(--background)]">
      <Topbar title="WhatsApp" subtitle="Chat with your agents from WhatsApp" />

      <div className="flex-1 overflow-y-auto p-6 space-y-6 max-w-4xl">

        {/* QR + number hero */}
        {waLink && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 flex flex-col sm:flex-row items-center gap-8"
          >
            <div className="flex-shrink-0 p-4 rounded-2xl bg-white shadow-lg">
              <QRCodeSVG
                value={waLink}
                size={148}
                bgColor="#ffffff"
                fgColor="#111827"
                level="M"
                includeMargin={false}
              />
            </div>
            <div className="flex-1 text-center sm:text-left space-y-3">
              <div className="flex items-center justify-center sm:justify-start gap-2">
                <QrCode className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-semibold text-[var(--foreground)]">Scan to Start Chatting</span>
              </div>
              <p className="text-sm text-[var(--muted-foreground)]">
                Scan with your phone camera to open WhatsApp. The bot guides you through everything — no commands to memorise.
              </p>
              <div className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-[var(--accent)] border border-[var(--border)]">
                <Phone className="w-3.5 h-3.5 text-emerald-400" />
                <code className="text-sm font-mono text-[var(--foreground)]">{WHATSAPP_NUMBER}</code>
                <CopyButton text={WHATSAPP_NUMBER} />
              </div>
              <p className="text-xs text-[var(--muted-foreground)]">
                First time? Send <code className="text-indigo-400">login your@email.com password</code> to get started.
              </p>
            </div>
          </motion.div>
        )}

        {/* Interactive flow preview */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
        >
          <h2 className="text-base font-semibold text-[var(--foreground)] mb-1">How it works</h2>
          <p className="text-xs text-[var(--muted-foreground)] mb-5">
            The bot guides you step by step — just reply with a number to navigate.
          </p>

          <div className="space-y-3">
            {MENU_FLOW.map((item, i) => (
              <div key={i} className={`rounded-xl border p-4 ${colorMap[item.color]}`}>
                <div className="flex items-center gap-2 mb-2.5">
                  <span className={`w-5 h-5 rounded-full ${bubbleMap[item.color]} text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0`}>
                    {i + 1}
                  </span>
                  <span className="text-xs font-semibold text-[var(--foreground)] uppercase tracking-wider">{item.step}</span>
                </div>
                <div className="flex flex-col sm:flex-row gap-2 text-xs">
                  <div className="flex-1 space-y-1">
                    <p className="text-[var(--muted-foreground)] text-[10px] uppercase tracking-wide">You send</p>
                    <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 font-mono text-[var(--foreground)]">
                      {item.msg}
                    </div>
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-[var(--muted-foreground)] text-[10px] uppercase tracking-wide">Bot replies</p>
                    <div className="bg-[var(--background)] border border-[var(--border)] rounded-lg px-3 py-2 font-mono text-[var(--foreground)] whitespace-pre-line leading-relaxed">
                      {item.reply}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-4 pt-4 border-t border-[var(--border)]">
            <p className="text-xs text-[var(--muted-foreground)]">
              Reply <code className="text-indigo-400">0</code> at any time to go back · <code className="text-indigo-400">menu</code> to return to the main menu
            </p>
          </div>
        </motion.div>

        {/* Active sessions */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
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
              <p className="text-xs text-[var(--muted-foreground)] mt-1">Sessions appear here when users log in from WhatsApp.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {sessions.map((s) => (
                <div key={s.id} className="flex items-center gap-4 p-3 rounded-xl border border-[var(--border)] hover:bg-[var(--accent)] transition-colors">
                  <div className="w-8 h-8 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
                    <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--foreground)] truncate">{s.phone}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      {s.agentName ? (
                        <span className="flex items-center gap-1 text-xs text-indigo-400">
                          <Bot className="w-3 h-3" />{s.agentName}
                        </span>
                      ) : (
                        <span className="text-xs text-[var(--muted-foreground)]">Browsing menu</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-[var(--muted-foreground)]">
                    <Clock className="w-3 h-3" />
                    {new Date(s.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </div>
              ))}
            </div>
          )}
        </motion.div>

        {/* Agents availability */}
        {agents.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.15 }}
            className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6"
          >
            <h2 className="text-base font-semibold text-[var(--foreground)] mb-5">Available Agents</h2>
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
