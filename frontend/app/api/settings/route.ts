import { NextRequest, NextResponse } from "next/server";
import { getSession, signToken, createSessionCookie } from "@/lib/auth";
import { db } from "@/lib/db";
import bcrypt from "bcryptjs";
import { z } from "zod";

const updateSchema = z.object({
  name: z.string().min(1).max(50).optional(),
  currentPassword: z.string().optional(),
  newPassword: z.string().min(6).optional(),
  mistralApiKey: z.string().optional(),
  elevenLabsApiKey: z.string().optional(),
  elevenLabsVoiceId: z.string().optional(),
  theme: z.enum(["dark", "light"]).optional(),
});

export async function PUT(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const body = await req.json();
    const data = updateSchema.parse(body);

    const user = await db.user.findUnique({ where: { id: session.userId } });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    // Handle password change
    if (data.newPassword) {
      if (!data.currentPassword) {
        return NextResponse.json({ error: "Current password required" }, { status: 400 });
      }
      if (!user.passwordHash) {
        return NextResponse.json({ error: "Cannot change password for Google accounts" }, { status: 400 });
      }
      const valid = await bcrypt.compare(data.currentPassword, user.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: "Current password is incorrect" }, { status: 401 });
      }
    }

    const updateData: Record<string, unknown> = {};
    if (data.name) updateData.name = data.name;
    if (data.newPassword) updateData.passwordHash = await bcrypt.hash(data.newPassword, 12);
    if (data.mistralApiKey !== undefined) updateData.mistralApiKey = data.mistralApiKey;
    if (data.elevenLabsApiKey !== undefined) updateData.elevenLabsApiKey = data.elevenLabsApiKey;
    if (data.elevenLabsVoiceId !== undefined) updateData.elevenLabsVoiceId = data.elevenLabsVoiceId;
    if (data.theme !== undefined) updateData.theme = data.theme;

    const updated = await db.user.update({
      where: { id: session.userId },
      data: updateData,
    });

    // Re-issue token if name changed
    let response;
    if (data.name && data.name !== session.name) {
      const newToken = await signToken({ userId: updated.id, email: updated.email, name: updated.name });
      const cookie = createSessionCookie(newToken);
      response = NextResponse.json({ success: true, user: { id: updated.id, name: updated.name, email: updated.email } });
      response.cookies.set(cookie);
    } else {
      response = NextResponse.json({ success: true, user: { id: updated.id, name: updated.name, email: updated.email } });
    }

    return response;
  } catch (err) {
    if (err instanceof z.ZodError) {
      return NextResponse.json({ error: (err.issues?.[0]?.message ?? "Validation error") }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function DELETE() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db.user.delete({ where: { id: session.userId } });
  return NextResponse.json({ success: true });
}

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const user = await db.user.findUnique({
    where: { id: session.userId },
    select: {
      id: true, name: true, email: true, theme: true,
      elevenLabsVoiceId: true,
      mistralApiKey: true, elevenLabsApiKey: true,
    },
  });

  if (!user) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Mask API keys for display
  return NextResponse.json({
    user: {
      ...user,
      mistralApiKey: user.mistralApiKey ? "sk-..." + user.mistralApiKey.slice(-4) : "",
      elevenLabsApiKey: user.elevenLabsApiKey ? "..." + user.elevenLabsApiKey.slice(-4) : "",
    },
  });
}
