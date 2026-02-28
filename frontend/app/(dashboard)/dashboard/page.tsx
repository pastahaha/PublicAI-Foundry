import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getBackendUrl } from "@/lib/backend";
import { DashboardClient } from "./client";

export default async function DashboardPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let recentAgents: { id: string; name: string; description: string | null; model: string; isActive: boolean; updatedAt: Date }[] = [];
  let totalAgents = 0;

  try {
    const res = await fetch(`${getBackendUrl()}/api/v1/assistant/`, {
      headers: { "X-User-Id": session.userId },
      cache: "no-store",
    });
    if (res.ok) {
      const data: Record<string, unknown>[] = await res.json();
      const items = Array.isArray(data) ? data : [];
      totalAgents = items.length;
      recentAgents = items.slice(0, 5).map((a) => {
        const config = (a.config as Record<string, unknown>) || {};
        return {
          id: a.assistant_id as string,
          name: a.name as string,
          description: (a.description as string) ?? null,
          model: (config.model_name as string) || "mistral-large-latest",
          isActive: true,
          updatedAt: new Date((a.updated_at as string) || Date.now()),
        };
      });
    }
  } catch {
    // backend unavailable — show zeros
  }

  return (
    <DashboardClient
      user={session}
      stats={{ totalAgents, activeAgents: totalAgents }}
      recentAgents={recentAgents}
    />
  );
}
