import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { demoRequest, leadSource } from "@/lib/validation";
import { trippedHoneypot, tooFast, verifyTurnstile } from "@/lib/spam";
import { rateLimit } from "@/lib/rate-limit";
import { dispatch, type Lead } from "@/lib/notify";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0].trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";

  // 1. Rate limit before we do any work at all.
  const limit = await rateLimit(ip);
  if (!limit.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Give it a minute and try again." },
      { status: 429, headers: { "Retry-After": "60" } }
    );
  }

  // 2. Parse. Malformed JSON is a bot, not a person.
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Malformed request." }, { status: 400 });
  }

  // 3. Validate. Field-level errors go back to the form so each message
  //    lands under the field it belongs to.
  const parsed = demoRequest.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Some details need checking.", fields: parsed.error.flatten().fieldErrors },
      { status: 422 }
    );
  }
  const data = parsed.data;

  // 4. Spam.
  //    Honeypot and timing failures get a 200 with a success body on
  //    purpose. Telling a bot it was caught just teaches whoever wrote it
  //    what to change. A real person can never hit either of these.
  if (trippedHoneypot(data.website) || tooFast(data.startedAt)) {
    console.info("[demo] silently dropped a suspected bot from", ip);
    return NextResponse.json({ ok: true });
  }

  if (!(await verifyTurnstile(data.turnstileToken, ip))) {
    return NextResponse.json(
      { error: "We couldn't verify that. Refresh the page and try once more." },
      { status: 403 }
    );
  }

  // 5. Capture.
  const lead: Lead = {
    ...data,
    id: randomUUID(),
    receivedAt: new Date().toISOString(),
    ip,
    userAgent: req.headers.get("user-agent") ?? "unknown",
    source: leadSource.parse(Object.fromEntries(new URL(req.url).searchParams)),
  };

  // 6. Fan out without blocking the response.
  //    waitUntil lets the work finish after the response has gone, so a slow
  //    CRM never makes the person sit and watch a spinner. If the platform
  //    doesn't support it we fall back to awaiting, which is slower but
  //    never drops a lead.
  const ctx = (req as unknown as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
  if (typeof ctx === "function") ctx(dispatch(lead));
  else await dispatch(lead);

  return NextResponse.json({ ok: true, id: lead.id });
}

/** Anything other than POST gets a straight answer rather than a 500. */
export async function GET() {
  return NextResponse.json({ error: "Use POST." }, { status: 405 });
}
