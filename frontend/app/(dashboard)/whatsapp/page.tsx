import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { redirect } from "next/navigation";
import { getBackendUrl } from "@/lib/backend";
import { WhatsAppClient } from "./client";

export default async function WhatsAppPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const whatsAppSessions = await db.whatsAppSession.findMany({
    where: { userId: session.userId },
    include: { user: { select: { name: true } } },
    orderBy: { updatedAt: "desc" },
  });

  let agents: { id: string; name: string; isActive: boolean }[] = [];
  try {
    const res = await fetch(`${getBackendUrl()}/api/v1/assistant/`, {
      headers: { "X-User-Id": session.userId },
      cache: "no-store",
    });
    if (res.ok) {
      const data: Record<string, unknown>[] = await res.json();
      agents = (Array.isArray(data) ? data : []).map((a) => ({
        id: a.assistant_id as string,
        name: a.name as string,
        isActive: true,
      }));
    }
  } catch {
    // backend unavailable
  }

  const sessionsWithAgent = whatsAppSessions.map((s) => {
    const agent = s.agentId ? agents.find((a) => a.id === s.agentId) || null : null;
    return { ...s, agentName: agent?.name || null };
  });

  return <WhatsAppClient sessions={sessionsWithAgent} agents={agents} />;
}
