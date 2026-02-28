import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { getBackendUrl } from "@/lib/backend";

// ---------------------------------------------------------------------------
// Twilio WhatsApp Webhook — Interactive Menu Bot
// Sandbox number: set NEXT_PUBLIC_TWILIO_WHATSAPP_NUMBER in .env.local
// Webhook URL: https://your-domain.com/api/whatsapp/webhook
// ---------------------------------------------------------------------------

interface BackendAgent {
  id: string;
  name: string;
  description: string | null;
  systemPrompt: string;
}

function twiml(message: string) {
  const safe = message
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return new NextResponse(
    `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${safe}</Message></Response>`,
    { headers: { "Content-Type": "text/xml" } }
  );
}

async function fetchAgents(userId: string): Promise<BackendAgent[]> {
  try {
    const res = await fetch(`${getBackendUrl()}/api/v1/assistant/`, {
      headers: { "X-User-Id": userId },
    });
    if (!res.ok) return [];
    const data = await res.json();
    const items: Record<string, unknown>[] = Array.isArray(data) ? data : (data.assistants ?? []);
    return items.map((a) => {
      const config = (a.config as Record<string, unknown>) || {};
      return {
        id: a.assistant_id as string,
        name: a.name as string,
        description: (a.description as string) || null,
        systemPrompt: (config.system_prompt as string) || "",
      };
    });
  } catch {
    return [];
  }
}

async function chatWithAgent(agentId: string, userId: string, message: string, threadId: string): Promise<string> {
  const res = await fetch(`${getBackendUrl()}/api/v1/agent/${agentId}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-User-Id": userId },
    body: JSON.stringify({ message, thread_id: threadId }),
  });
  if (!res.ok) throw new Error("Backend agent chat error");
  const json = await res.json();
  return (json.message as string) || (json.content as string) || "I'm sorry, I couldn't generate a response.";
}

// ── Menu text ────────────────────────────────────────────────────────────────

const MAIN_MENU =
  `🤖 *PublicAI Foundry*\n\n` +
  `What would you like to do?\n\n` +
  `1. Chat with an agent\n` +
  `2. View my agents\n` +
  `3. My account\n\n` +
  `Reply with a number.`;

const accountMenuText = (name: string, email: string) =>
  `👤 *My Account*\n\nName: ${name}\nEmail: ${email}\n\n` +
  `1. Current status\n` +
  `2. Logout\n\n` +
  `0. Back to main menu`;

// ── Helper ───────────────────────────────────────────────────────────────────

async function setMenuState(phone: string, state: string) {
  await db.whatsAppSession.update({ where: { phone }, data: { menuState: state } });
}

// ── POST handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const text = await req.text();
  const params = new URLSearchParams(text);

  const body = (params.get("Body") || "").trim();
  const from = params.get("From") || "";

  if (!from || !body) return twiml("Invalid request.");

  const phone = from.replace("whatsapp:", "");
  const lower = body.toLowerCase().trim();

  // ── Not authenticated ──────────────────────────────────────────────────────
  const session = await db.whatsAppSession.findUnique({ where: { phone } });

  if (!session) {
    if (lower.startsWith("login ")) {
      const parts = body.slice(6).trim().split(/\s+/);
      const email = parts[0];
      const password = parts.slice(1).join(" ");

      if (!email || !password) {
        return twiml("Format: *login your@email.com yourpassword*");
      }

      const user = await db.user.findUnique({ where: { email } });
      if (!user || !user.passwordHash) return twiml("❌ Invalid email or password. Try again.");

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) return twiml("❌ Invalid email or password. Try again.");

      await db.whatsAppSession.create({
        data: { phone, userId: user.id, agentId: null, menuState: "main", conversationJson: "{}" },
      });

      return twiml(`✅ Welcome, *${user.name}*!\n\n${MAIN_MENU}`);
    }

    return twiml(
      `👋 Welcome to *PublicAI Foundry*!\n\n` +
      `To get started, log in:\n` +
      `*login your@email.com yourpassword*`
    );
  }

  // ── Authenticated ─────────────────────────────────────────────────────────
  const user = await db.user.findUnique({ where: { id: session.userId } });
  if (!user) {
    await db.whatsAppSession.delete({ where: { phone } });
    return twiml("Session expired. Please login again.");
  }

  const state = session.menuState || "main";

  // Global: "menu" or "home" always returns to main (except while chatting, use 0)
  if ((lower === "menu" || lower === "home") && state !== "chatting") {
    await setMenuState(phone, "main");
    return twiml(MAIN_MENU);
  }

  // ── STATE: main ────────────────────────────────────────────────────────────
  if (state === "main") {
    if (lower === "1") {
      // Resume existing agent if agentId is still set
      if (session.agentId) {
        const agents = await fetchAgents(user.id);
        const existing = agents.find((a) => a.id === session.agentId);
        if (existing) {
          await setMenuState(phone, "chatting");
          return twiml(
            `💬 Resuming chat with *${existing.name}*.\n\n` +
            `Send your message. Reply *0* to return to the menu.`
          );
        }
      }
      const agents = await fetchAgents(user.id);
      if (agents.length === 0) {
        return twiml(`No agents found. Create one at the platform first.\n\n0. Back`);
      }
      const list = agents.map((a, i) => `${i + 1}. ${a.name}`).join("\n");
      await setMenuState(phone, "chat_select");
      return twiml(`💬 *Choose an agent to chat with:*\n\n${list}\n\n0. Back`);
    }

    if (lower === "2") {
      const agents = await fetchAgents(user.id);
      if (agents.length === 0) return twiml(`No agents yet. Create one at the platform.\n\n0. Back`);
      const list = agents.map((a) => `• ${a.name}${a.description ? ` — ${a.description}` : ""}`).join("\n");
      return twiml(`*Your Agents:*\n\n${list}\n\n${MAIN_MENU}`);
    }

    if (lower === "3") {
      await setMenuState(phone, "account");
      return twiml(accountMenuText(user.name, user.email));
    }

    return twiml(MAIN_MENU);
  }

  // ── STATE: chat_select ─────────────────────────────────────────────────────
  if (state === "chat_select") {
    if (lower === "0") {
      await setMenuState(phone, "main");
      return twiml(MAIN_MENU);
    }
    const agents = await fetchAgents(user.id);
    const idx = parseInt(lower) - 1;
    if (isNaN(idx) || idx < 0 || idx >= agents.length) {
      const list = agents.map((a, i) => `${i + 1}. ${a.name}`).join("\n");
      return twiml(`Please choose a valid option:\n\n${list}\n\n0. Back`);
    }
    const agent = agents[idx];
    await db.whatsAppSession.update({
      where: { phone },
      data: { agentId: agent.id, menuState: "chatting", conversationJson: "{}" },
    });
    return twiml(
      `✅ Now chatting with *${agent.name}*.\n\n` +
      `${agent.description ? agent.description + "\n\n" : ""}` +
      `Send your message. Reply *0* to return to the menu.`
    );
  }

  // ── STATE: chatting ────────────────────────────────────────────────────────
  if (state === "chatting") {
    if (lower === "0" || lower === "menu" || lower === "back") {
      await setMenuState(phone, "main");
      return twiml(MAIN_MENU);
    }
    if (!session.agentId) {
      await setMenuState(phone, "main");
      return twiml(MAIN_MENU);
    }

    // Use a stable thread_id derived from phone + agentId
    const threadId = `wa-${phone.replace(/[^a-z0-9]/gi, "-")}-${session.agentId.slice(0, 8)}`;

    let reply: string;
    try {
      reply = await chatWithAgent(session.agentId, user.id, body, threadId);
    } catch {
      return twiml("⚠️ Agent is temporarily unavailable. Please try again shortly.");
    }

    return twiml(`${reply}\n\n_(Reply *0* for menu)_`);
  }

  // ── STATE: account ─────────────────────────────────────────────────────────
  if (state === "account") {
    if (lower === "0") { await setMenuState(phone, "main"); return twiml(MAIN_MENU); }
    if (lower === "1") {
      let agentName = "None selected";
      if (session.agentId) {
        const agents = await fetchAgents(user.id);
        const current = agents.find((a) => a.id === session.agentId);
        if (current) agentName = current.name;
      }
      return twiml(
        `*Account Status*\n\nName: ${user.name}\nEmail: ${user.email}\n` +
        `Active agent: ${agentName}\n\n0. Back`
      );
    }
    if (lower === "2") {
      await db.whatsAppSession.delete({ where: { phone } });
      return twiml(`👋 Logged out. Type *login email password* to sign in again.`);
    }
    return twiml(accountMenuText(user.name, user.email));
  }

  // Fallback — reset to main
  await setMenuState(phone, "main");
  return twiml(MAIN_MENU);
}

export async function GET() {
  return new NextResponse("PublicAI Foundry WhatsApp Webhook is active.", { status: 200 });
}
