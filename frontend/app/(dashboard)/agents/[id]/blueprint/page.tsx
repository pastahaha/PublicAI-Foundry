import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getBackendUrl } from "@/lib/backend";
import { BlueprintViewer } from "@/components/agents/blueprint-viewer";
import Link from "next/link";
import { ChevronLeft, Edit, Play } from "lucide-react";
import { Button } from "@/components/ui/button";

export default async function BlueprintPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  // Verify the agent exists
  let agentName = "Agent";
  try {
    const res = await fetch(`${getBackendUrl()}/api/v1/assistant/${id}`, {
      headers: { "X-User-Id": session.userId },
      cache: "no-store",
    });
    if (!res.ok) notFound();
    const data: Record<string, unknown> = await res.json();
    agentName = (data.name as string) || "Agent";
  } catch {
    notFound();
  }

  return (
    <div className="flex flex-col h-full">
      {/* Navigation bar */}
      <div className="flex items-center gap-3 px-6 py-3 border-b border-[var(--border)] bg-[var(--card)]">
        <Link
          href="/agents"
          className="flex items-center gap-1 text-sm text-[var(--muted-foreground)] hover:text-[var(--foreground)] transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Agents
        </Link>
        <span className="text-[var(--border)]">/</span>
        <span className="text-sm text-[var(--foreground)] font-medium truncate max-w-[200px]">
          {agentName}
        </span>
        <span className="text-[var(--border)]">/</span>
        <span className="text-sm text-indigo-400 font-medium">Blueprint</span>

        <div className="ml-auto flex items-center gap-2">
          <Button asChild size="sm" variant="ghost" className="text-xs h-8 rounded-xl">
            <Link href={`/agents/${id}`}>
              <Edit className="w-3 h-3 mr-1.5" />
              Edit
            </Link>
          </Button>
          <Button
            asChild
            size="sm"
            className="text-xs h-8 rounded-xl bg-indigo-600/10 text-indigo-400 hover:bg-indigo-600/20 border border-indigo-500/20"
            variant="ghost"
          >
            <Link href={`/playground?agent=${id}`}>
              <Play className="w-3 h-3 mr-1.5" />
              Test
            </Link>
          </Button>
        </div>
      </div>

      {/* Blueprint viewer */}
      <BlueprintViewer agentId={id} />
    </div>
  );
}
