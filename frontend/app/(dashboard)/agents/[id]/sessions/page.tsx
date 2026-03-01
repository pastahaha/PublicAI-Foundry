import { getSession } from "@/lib/auth";
import { redirect, notFound } from "next/navigation";
import { getBackendUrl } from "@/lib/backend";
import { SessionsListClient } from "./client";

export default async function SessionsPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const { id } = await params;

  let agentName = "Agent";
  try {
    const res = await fetch(`${getBackendUrl()}/api/v1/assistant/${id}`, {
      headers: { "X-User-Id": session.userId },
      cache: "no-store",
    });
    if (res.ok) {
      const data = await res.json();
      agentName = (data as { name?: string }).name || "Agent";
    } else {
      notFound();
    }
  } catch {
    // backend unavailable
  }

  return <SessionsListClient agentId={id} agentName={agentName} />;
}
