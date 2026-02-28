import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getBackendUrl } from "@/lib/backend";
import { AgentForm } from "@/components/agents/agent-form";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";

export default async function EditAgentPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  let agent: { id: string; name: string; description: string | null; model: string; systemPrompt: string; tools: string; guardrails: string } | null = null;

  try {
    const res = await fetch(`${getBackendUrl()}/api/v1/assistant/${id}`, {
      headers: { "X-User-Id": session.userId },
      cache: "no-store",
    });
    if (res.ok) {
      const data: Record<string, unknown> = await res.json();
      const config = (data.config as Record<string, unknown>) || {};
      const meta = (data.metadata as Record<string, unknown>) || {};
      agent = {
        id: data.assistant_id as string,
        name: data.name as string,
        description: (data.description as string) ?? null,
        model: (config.model_name as string) || "mistral-large-latest",
        systemPrompt: (config.system_prompt as string) || "",
        tools: JSON.stringify((config.tools as string[]) || []),
        guardrails: JSON.stringify((meta.guardrails as object) || {}),
      };
    }
  } catch {
    // backend unavailable
  }

  if (!agent) notFound();

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-3 px-6 pt-6 pb-4">
        <Link
          href="/agents"
          className="flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back to Agents
        </Link>
        <span className="text-[var(--border)]">/</span>
        <span className="text-sm text-[var(--foreground)] font-medium">Edit: {agent.name}</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <AgentForm
          initial={{
            id: agent.id,
            name: agent.name,
            description: agent.description,
            model: agent.model,
            systemPrompt: agent.systemPrompt,
            tools: agent.tools,
            guardrails: agent.guardrails,
          }}
        />
      </div>
    </div>
  );
}
