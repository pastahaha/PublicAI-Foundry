import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBackendUrl } from "@/lib/backend";

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const category = searchParams.get("category");

  const url = category
    ? `${getBackendUrl()}/api/v1/skills/?category=${encodeURIComponent(category)}`
    : `${getBackendUrl()}/api/v1/skills/`;

  const res = await fetch(url, {
    headers: { "Content-Type": "application/json", "X-User-Id": session.userId },
  });

  if (!res.ok) {
    const err = await res.text();
    return NextResponse.json({ error: err }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
