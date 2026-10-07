import { NextResponse } from "next/server";
import { recordEvent } from "@/server/lib/microsite/events";
import { callerIp } from "@/server/lib/website/cors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * What a visitor did on an agent's microsite, reported by the page
 * (`navigator.sendBeacon`). Always answered 204 — the page has nothing to
 * do with the answer, and a script learns nothing from it about which
 * sites exist. Only a post from the site itself is read: a beacon carries
 * the page's origin, and one from anywhere else is ignored.
 */
export async function POST(req: Request, { params }: { params: Promise<{ slug: string; agent: string }> }) {
  const { slug, agent } = await params;
  const origin = req.headers.get("origin");
  if (origin && origin !== new URL(req.url).origin) return new NextResponse(null, { status: 204 });
  const body = await req.text().catch(() => "");
  let data: { k?: unknown; ref?: unknown } = {};
  try { data = JSON.parse(body.slice(0, 500)); } catch { /* an empty or broken beacon counts as nothing */ }
  await recordEvent({
    orgSlug: slug, agentSlug: agent,
    kind: typeof data.k === "string" ? data.k : "",
    reference: typeof data.ref === "string" ? data.ref : null,
    ip: callerIp(req), userAgent: req.headers.get("user-agent"),
  }).catch(() => null);
  return new NextResponse(null, { status: 204 });
}
