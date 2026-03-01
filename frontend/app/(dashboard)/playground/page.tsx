import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getBackendUrl } from "@/lib/backend";
import { PlaygroundClient } from "./client";

export default async function PlaygroundPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let agents: { id: string; name: string; description: string | null; model: string; voiceId?: string | null }[] = [];

  try {
    const res = await fetch(`${getBackendUrl()}/api/v1/assistant/`, {
      headers: { "X-User-Id": session.userId },
      cache: "no-store",
    });
    if (res.ok) {
      const data: Record<string, unknown>[] = await res.json();
      agents = (Array.isArray(data) ? data : []).map((a) => {
        const config = (a.config as Record<string, unknown>) || {};
        return {
          id: a.assistant_id as string,
          name: a.name as string,
          description: (a.description as string) ?? null,
          model: (config.model_name as string) || "mistral-large-latest",
          voiceId: (config.voice_id as string) || null,
        };
      });
    }
  } catch {
    // backend unavailable — show empty list
  }

  return <PlaygroundClient agents={agents} />;
}
