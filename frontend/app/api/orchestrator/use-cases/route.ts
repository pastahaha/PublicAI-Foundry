import { NextResponse } from "next/server";
import { getBackendUrl } from "@/lib/backend";

/**
 * GET /api/orchestrator/use-cases
 * Proxy to backend GET /api/v1/orchestrator/use-cases
 * Returns the 4 NSW use-case domains.
 */
export async function GET() {
  const res = await fetch(`${getBackendUrl()}/api/v1/orchestrator/use-cases`);

  if (!res.ok) {
    return NextResponse.json({ error: "Failed to fetch use cases" }, { status: res.status });
  }

  const data = await res.json();
  return NextResponse.json(data);
}
