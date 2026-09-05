import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { log } from "@/lib/log";
import { limitAll, keysFor } from "@/server/lib/ratelimit";
import { callerIp, corsHeaders, preflight } from "@/server/lib/website/cors";
import {
  demoRequest,
  dispatchLead,
  leadSource,
  tooFast,
  trippedHoneypot,
  type Lead,
} from "@/server/lib/website/forms";

/**
 * Book a call.
 *
 * The one conversion path on the marketing site. It posted to
 * `potatofarm.io/api/demo`, served by a folder that had no
 * `package.json` and could not be deployed, so every submission from the
 * day the form went up would have failed with "that didn't send".
 */
export const runtime = "nodejs";

export const OPTIONS = preflight;

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));
  const ip = callerIp(req);

  // 1. Parse before rate limiting, only so the email can be part of the
  //    key — an IP alone punishes a whole brokerage behind one NAT.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400, headers: cors });
  }

  // 2. Validate. Field-level errors go back to the form so each message
  //    lands under the field it belongs to.
  const parsed = demoRequest.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Some details need checking.", fields: parsed.error.flatten().fieldErrors },
      { status: 422, headers: cors }
    );
  }
  const data = parsed.data;

  // 3. Rate limit. Database-backed and shared across instances, unlike
  //    the per-instance Map this used to use — which on serverless is
  //    close to no limit at all.
  const verdict = await limitAll("website.demo", keysFor({ ip, email: data.email }));
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Give it a minute and try again." },
      {
        status: 429,
        headers: { ...cors, "Retry-After": String(verdict.retryAfterSeconds) },
      }
    );
  }

  /**
   * 4. Spam.
   *
   * A honeypot or timing failure gets a 200 with a success body on
   * purpose. Telling a bot it was caught just teaches whoever wrote it
   * what to change. A real person can never hit either.
   */
  if (trippedHoneypot(data.website) || tooFast(data.startedAt)) {
    log.info("[demo] silently dropped a suspected bot", {}, { ip });
    return NextResponse.json({ ok: true }, { headers: cors });
  }

  const lead: Lead = {
    ...data,
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    // Consent evidence. Under both the UAE's PDPL and GDPR you have to be
    // able to show when consent was given and from where, and the point of
    // capture is the only place that ever holds up.
    ip: ip ?? "unknown",
    userAgent: req.headers.get("user-agent") ?? "unknown",
    source: leadSource.parse(Object.fromEntries(new URL(req.url).searchParams)),
  };

  /**
   * 5. Send, and wait for it.
   *
   * The previous version used `waitUntil` so the response went before
   * the emails did. On Vercel a Node function is frozen the moment it
   * responds unless the platform's own `waitUntil` is used, and the
   * cast this reached for — `(req as { waitUntil? })` — is not it. The
   * request object has no such method, so it always fell through to the
   * await anyway. Two emails to Resend is about 300ms; a lead that
   * silently never arrives is worth more than that.
   */
  await dispatchLead(lead);

  return NextResponse.json({ ok: true, id: lead.id }, { headers: cors });
}

/** Anything other than POST gets a straight answer rather than a 500. */
export async function GET() {
  return NextResponse.json({ error: "Use POST." }, { status: 405 });
}
