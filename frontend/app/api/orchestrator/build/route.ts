import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBackendUrl } from "@/lib/backend";

/**
 * POST /api/orchestrator/build
 * Proxy to backend POST /api/v1/orchestrator/build-from-form
 *
 * Routes manual form data through the full orchestrator pipeline
 * (research → plan → review → finalise → save) so that manually
 * built agents also get proper blueprints.
 */
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();

    const payload = {
      name: body.name,
      description: body.description || undefined,
      model: body.model || "mistral-large-latest",
      system_prompt: body.systemPrompt,
      tools: body.tools || [],
      guardrails: body.guardrails || {},
      knowledge_base: body.knowledgeBase || {},
      use_case: body.use_case || undefined,
      model_provider: body.model_provider || "mistral",
    };

    const res = await fetch(
      `${getBackendUrl()}/api/v1/orchestrator/build-from-form`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-User-Id": session.userId,
        },
        body: JSON.stringify(payload),
      }
    );

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const data = await res.json();
    return NextResponse.json(data, { status: 201 });
  } catch (err) {
    console.error("orchestrator build-from-form error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
