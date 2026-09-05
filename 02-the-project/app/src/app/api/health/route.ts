import { NextResponse } from "next/server";
import { crossTenant } from "@/server/db/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Liveness and readiness.
 *
 * Deliberately shallow. A health endpoint that checks every downstream
 * dependency will fail when a third party has a bad minute, the load
 * balancer will pull healthy instances out of rotation, and a small
 * outage somewhere else becomes a full one here.
 *
 * This answers one question: can this instance serve a request. Tenant
 * health is a different question with a different endpoint, and it is
 * authenticated because it contains customer names.
 */
export async function GET() {
  try {
    await crossTenant("sweep").$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, at: new Date().toISOString() });
  } catch {
    return NextResponse.json({ ok: false, reason: "database unreachable" }, { status: 503 });
  }
}
