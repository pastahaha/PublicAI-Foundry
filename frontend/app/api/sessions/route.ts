import { getSession } from "@/lib/auth";
import { db } from "@/lib/db";
import { NextResponse } from "next/server";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const sessions = await db.chatSession.findMany({
    where: { userId: session.userId },
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      agentId: true,
      agentName: true,
      title: true,
      threadId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(sessions);
}

export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { agentId, agentName, threadId, title } = await req.json();

  const chatSession = await db.chatSession.create({
    data: {
      userId: session.userId,
      agentId,
      agentName,
      threadId,
      title: (title as string)?.slice(0, 80) || "New Chat",
    },
    select: {
      id: true,
      agentId: true,
      agentName: true,
      title: true,
      threadId: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json(chatSession);
}
