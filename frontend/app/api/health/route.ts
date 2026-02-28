import { getBackendUrl } from "@/lib/backend";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const res = await fetch(`${getBackendUrl()}/api/health`, {
      signal: AbortSignal.timeout(3000),
      cache: "no-store",
    });
    const data = await res.json();
    return NextResponse.json(data, { status: res.ok ? 200 : 503 });
  } catch {
    return NextResponse.json({ status: "offline" }, { status: 503 });
  }
}
