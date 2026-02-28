import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBackendUrl } from "@/lib/backend";

/**
 * POST /api/orchestrator
 * Proxy to backend POST /api/v1/orchestrator/chat
 *
 * Body: { message, thread_id?, use_case?, model_name? }
 * Returns ChatResponse: { thread_id, phase, message, blueprint, assistant_id, next_action }
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    const payload = {
      message: body.message,
      thread_id: body.thread_id || undefined,
      use_case: body.use_case || undefined,
      model_provider: "mistral",
      model_name: body.model_name || "mistral-large-latest",
    };

    const res = await fetch(`${getBackendUrl()}/api/v1/orchestrator/chat`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": session.userId,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch (err) {
    console.error("orchestrator chat error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
