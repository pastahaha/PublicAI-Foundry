import { getSession } from "@/lib/auth";
import { redirect } from "next/navigation";
import { getBackendUrl } from "@/lib/backend";
import { AgentsClient } from "./client";

function toAgent(a: Record<string, unknown>) {
  const config = (a.config as Record<string, unknown>) || {};
  const meta = (a.metadata as Record<string, unknown>) || {};
  return {
    id: a.assistant_id as string,
    name: a.name as string,
    description: (a.description as string) ?? null,
    model: (config.model_name as string) || "mistral-large-latest",
    systemPrompt: (config.system_prompt as string) || "",
    tools: (config.tools as string[]) || [],
    guardrails: JSON.stringify((meta.guardrails as object) || {}),
    knowledgeBase: JSON.stringify((meta.knowledgeBase as object) || {}),
    isActive: true,
    createdAt: new Date((a.created_at as string) || Date.now()),
    updatedAt: new Date((a.updated_at as string) || Date.now()),
    userId: "",
  };
}

export default async function AgentsPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  let agents: ReturnType<typeof toAgent>[] = [];
  try {
    const res = await fetch(`${getBackendUrl()}/api/v1/assistant/`, {
      headers: { "X-User-Id": session.userId },
      cache: "no-store",
    });
    if (res.ok) {
      const data: Record<string, unknown>[] = await res.json();
      agents = (Array.isArray(data) ? data : []).map(toAgent);
    }
  } catch {
    // backend unavailable — show empty list
  }

  return <AgentsClient agents={agents} />;
}
