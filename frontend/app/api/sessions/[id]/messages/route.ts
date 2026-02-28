import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  const chatSession = await db.chatSession.findFirst({
    where: { id, userId: session.userId },
  });
  if (!chatSession) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { role, content } = await req.json();

  const message = await db.chatMessage.create({
    data: { sessionId: id, role, content },
  });

  // Bubble session to top of list
  await db.chatSession.update({
    where: { id },
    data: { updatedAt: new Date() },
  });

  return NextResponse.json(message);
}
