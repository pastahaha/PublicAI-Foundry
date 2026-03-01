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
    voiceId: (config.voice_id as string) || null,
    guardrails: (meta.guardrails as Record<string, unknown>) || {},
    knowledgeBase: (meta.knowledgeBase as Record<string, unknown>) || {},
    isActive: true,
    version: a.version,
    createdAt: a.created_at,
    updatedAt: a.updated_at,
  };
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const res = await fetch(`${getBackendUrl()}/api/v1/assistant/${id}`, {
    headers: { "X-User-Id": session.userId },
  });

  if (!res.ok) {
    return NextResponse.json({ error: "Not found" }, { status: res.status });
  }

  const data: Record<string, unknown> = await res.json();
  return NextResponse.json({ agent: toAgent(data) });
}

const updateSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().optional(),
  model: z.string().optional(),
  systemPrompt: z.string().min(1).optional(),
  tools: z.array(z.string()).optional(),
  voiceId: z.string().nullable().optional(),
  guardrails: z.record(z.string(), z.unknown()).optional(),
  knowledgeBase: z.record(z.string(), z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const body = await req.json();
    const data = updateSchema.parse(body);

    // Build backend PATCH payload
    const configUpdates: Record<string, unknown> = {};
    if (data.model) configUpdates.model_name = data.model;
    if (data.systemPrompt) configUpdates.system_prompt = data.systemPrompt;
    if (data.tools) configUpdates.tools = data.tools;
    if (data.voiceId !== undefined) configUpdates.voice_id = data.voiceId;

    const patchPayload: Record<string, unknown> = {};
    if (data.name) patchPayload.name = data.name;
    if (data.description !== undefined) patchPayload.description = data.description;
    if (Object.keys(configUpdates).length > 0) {
      // Fetch current config first so we can merge
      const current = await fetch(`${getBackendUrl()}/api/v1/assistant/${id}`, {
        headers: { "X-User-Id": session.userId },
      });
      if (current.ok) {
        const cur: Record<string, unknown> = await current.json();
        const curConfig = (cur.config as Record<string, unknown>) || {};
        patchPayload.config = {
          model_provider: curConfig.model_provider || "mistral",
          model_name: configUpdates.model_name || curConfig.model_name || "mistral-large-latest",
          system_prompt: configUpdates.system_prompt || curConfig.system_prompt || "",
          tools: configUpdates.tools || curConfig.tools || [],
          voice_id: configUpdates.voice_id !== undefined ? configUpdates.voice_id : (curConfig.voice_id || null),
          temperature: curConfig.temperature || 0.7,
          max_tokens: curConfig.max_tokens || 4096,
        };
      }
    }
    if (data.guardrails || data.knowledgeBase) {
      patchPayload.metadata = {
        ...(data.guardrails ? { guardrails: data.guardrails } : {}),
        ...(data.knowledgeBase ? { knowledgeBase: data.knowledgeBase } : {}),
      };
    }

    const res = await fetch(`${getBackendUrl()}/api/v1/assistant/${id}`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        "X-User-Id": session.userId,
      },
      body: JSON.stringify(patchPayload),
    });

    if (!res.ok) {
      const err = await res.text();
      return NextResponse.json({ error: err }, { status: res.status });
    }

    const updated: Record<string, unknown> = await res.json();
    return NextResponse.json({ agent: toAgent(updated) });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: err.issues[0]?.message ?? "Validation error" }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const res = await fetch(`${getBackendUrl()}/api/v1/assistant/${id}`, {
    method: "DELETE",
    headers: { "X-User-Id": session.userId },
  });

  if (!res.ok && res.status !== 204) {
    return NextResponse.json({ error: "Delete failed" }, { status: res.status });
  }

  return NextResponse.json({ success: true });
}
