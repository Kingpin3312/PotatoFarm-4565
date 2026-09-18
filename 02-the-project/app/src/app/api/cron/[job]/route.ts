import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { JOBS, type JobName } from "@/server/jobs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// Long enough for a sweep, short enough that a hung job is killed rather
// than holding its lock until the platform gives up.
export const maxDuration = 300;

/**
 * Cron entry point.
 *
 * Authenticated, because an unauthenticated endpoint that triggers
 * invoicing is a way for anyone who finds the URL to bill every customer
 * again. The lock and the period check would both catch it — and it
 * should still never be reachable.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  const given = req.headers.get("authorization")?.replace("Bearer ", "") ?? "";

  if (!secret) return NextResponse.json({ error: "CRON_SECRET not set." }, { status: 500 });
  if (given.length !== secret.length || !timingSafeEqual(Buffer.from(given), Buffer.from(secret))) {
    return NextResponse.json({ error: "Unauthorised." }, { status: 401 });
  }

  const { job } = await params;
  const fn = JOBS[job as JobName];
  if (!fn) return NextResponse.json({ error: `Unknown job: ${job}` }, { status: 404 });

  try {
    return NextResponse.json({ job, ...(await fn()) });
  } catch (err) {
    // 500 so the platform retries. The lock is already released, and
    // every job is idempotent, so a retry is safe.
    return NextResponse.json({ job, error: String(err).slice(0, 300) }, { status: 500 });
  }
}
