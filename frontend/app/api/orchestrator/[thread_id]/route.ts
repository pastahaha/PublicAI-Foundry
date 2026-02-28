import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBackendUrl } from "@/lib/backend";

/**
 * GET /api/orchestrator/[thread_id]
 * Proxy to backend GET /api/v1/orchestrator/chat/{thread_id}
 * Returns full conversation history for a thread.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ thread_id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { thread_id } = await params;
  const res = await fetch(`${getBackendUrl()}/api/v1/orchestrator/chat/${thread_id}`, {
    headers: { "X-User-Id": session.userId },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Thread not found" }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
