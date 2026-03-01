import { NextRequest } from "next/server";
import { getSession } from "@/lib/auth";
import { getBackendUrl } from "@/lib/backend";

/**
 * POST /api/orchestrator/stream
 * Proxy to backend POST /api/v1/orchestrator/chat/stream (SSE)
 *
 * Forwards the SSE stream from the backend so the frontend can
 * consume real-time phase updates during agent building.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json();

    const payload = {
      message: body.message,
      thread_id: body.thread_id || undefined,
      use_case: body.use_case || undefined,
      model_provider: body.model_provider || "mistral",
      model_name: body.model_name || "mistral-large-latest",
    };

    const backendRes = await fetch(
      `${getBackendUrl()}/api/v1/orchestrator/chat/stream`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": session.userId,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!backendRes.ok) {
      const err = await backendRes.text();
      return new Response(JSON.stringify({ error: err }), {
        status: backendRes.status,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Pipe the SSE stream through to the client
    return new Response(backendRes.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (err) {
    console.error("orchestrator stream proxy error:", err);
    return new Response(
      JSON.stringify({ error: "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}
