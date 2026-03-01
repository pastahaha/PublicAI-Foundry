import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { getBackendUrl } from "@/lib/backend";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;

  try {
    const res = await fetch(
      `${getBackendUrl()}/api/v1/agent/${id}/blueprint`,
      {
        headers: { "X-User-Id": session.userId },
        cache: "no-store",
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      return NextResponse.json(
        { error: errText || "Failed to fetch blueprint" },
        { status: res.status }
      );
    }

    const data = await res.json();
    return NextResponse.json(data);
  } catch {
    return NextResponse.json(
      { error: "Could not reach backend" },
      { status: 502 }
    );
  }
}
