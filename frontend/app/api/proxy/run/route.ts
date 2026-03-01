import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBackendUrl } from "@/lib/backend";

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { agentId, message, threadId } = await req.json();

    if (!agentId || !message) {
      return NextResponse.json({ error: "agentId and message are required" }, { status: 400 });
    }

    // Call the backend's agent chat endpoint — it handles blueprint compilation
    const backendUrl = getBackendUrl();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60_000);

    try {
      const res = await fetch(`${backendUrl}/api/v1/agent/${agentId}/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": session.userId,
        },
        body: JSON.stringify({
          message,
          // Pass frontend's session UUID as thread_id; backend will create
          // the thread on first call, then continue it on subsequent calls
          thread_id: threadId || undefined,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!res.ok) {
        const errText = await res.text();
        // Return as mock SSE so the playground gracefully shows the error
        const errMsg = `Backend error (${res.status}): ${errText}`;
        return _errorSse(errMsg);
      }

      const data = await res.json();
      const agentMsg: string = data.message || "(no response)";
      const greeting: string = data.greeting || "";
      const toolEvents: Array<{ tool: string; node: string; status: string }> =
        data.tool_events || [];

      // Convert JSON response to SSE format expected by the playground client
      return _jsonToSse(agentMsg, greeting, toolEvents);
    } catch (fetchErr: unknown) {
      clearTimeout(timeout);
      if (fetchErr instanceof Error && fetchErr.name === "AbortError") {
        return _errorSse("Request timed out. The agent took too long to respond.");
      }
      return _errorSse(
        `Could not reach the AI backend at ${backendUrl}. Make sure it is running.`
      );
    }
  } catch (err) {
    console.error("proxy/run error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** Wrap a text response as a minimal SSE stream the playground can parse */
function _jsonToSse(
  text: string,
  greeting: string = "",
  toolEvents: Array<{ tool: string; node: string; status: string }> = []
): NextResponse {
  const lines: string[] = [];

  // Send greeting as a separate SSE event if present
  if (greeting) {
    lines.push(`data: ${JSON.stringify({ greeting })}\n`);
  }

  // Send tool events as separate SSE events
  for (const te of toolEvents) {
    lines.push(`data: ${JSON.stringify({ tool_event: te })}\n`);
  }

  // Send the main content
  const payload = JSON.stringify({ content: text });
  lines.push(`data: ${payload}\n`);
  lines.push(`data: [DONE]\n`);

  const body = lines.join("\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

function _errorSse(message: string): NextResponse {
  return _jsonToSse(`⚠️ ${message}`, "", []);
}
