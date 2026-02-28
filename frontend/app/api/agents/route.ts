import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBackendUrl } from "@/lib/backend";
import { z } from "zod";

/** Transform backend AssistantORM → frontend Agent shape */
function toAgent(a: Record<string, unknown>) {
  const config = (a.config as Record<string, unknown>) || {};
  const meta = (a.metadata as Record<string, unknown>) || {};
  return {
    id: a.assistant_id,
    name: a.name,
    description: a.description ?? null,
    model: (config.model_name as string) || "mistral-large-latest",
    systemPrompt: (config.system_prompt as string) || "",
    tools: (config.tools as string[]) || [],
    guardrails: (meta.guardrails as Record<string, unknown>) || {},
    knowledgeBase: (meta.knowledgeBase as Record<string, unknown>) || {},
    isActive: true,
    version: a.version,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await fetch(`${getBackendUrl()}/api/v1/assistant/`, {
    headers: {
      "Content-Type": "application/json",
      "X-User-Id": session.userId,
    },
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  const data: unknown[] = await res.json();
  return NextResponse.json({ agents: data.map((a) => toAgent(a as Record<string, unknown>)) });
}

const agentSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().optional(),
  model: z.string().default("mistral-large-latest"),
  systemPrompt: z.string().min(1),
  tools: z.array(z.string()).default([]),
  guardrails: z.record(z.string(), z.unknown()).default({}),
  knowledgeBase: z.record(z.string(), z.unknown()).optional().default({}),
});

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const data = agentSchema.parse(body);

    const payload = {
      name: data.name,
      description: data.description,
      config: {
        model_provider: "mistral",
        model_name: data.model,
        system_prompt: data.systemPrompt,
        tools: data.tools,
        temperature: 0.7,
        max_tokens: 4096,
      },
      metadata: {
        guardrails: data.guardrails,
        knowledgeBase: data.knowledgeBase,
      },
    };

    const res = await fetch(`${getBackendUrl()}/api/v1/assistant/`, {
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

    const created: Record<string, unknown> = await res.json();
    return NextResponse.json({ agent: toAgent(created) }, { status: 201 });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
