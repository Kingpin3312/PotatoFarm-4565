import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { log } from "@/lib/log";
import { keysFor, limitAll } from "@/server/lib/ratelimit";
import { callerIp, corsHeaders, preflight } from "@/server/lib/website/cors";
import { sendGuideFollowUp, recordSubscriber, settleSubscriber, subscribeRequest, trippedHoneypot } from "@/server/lib/website/forms";

/**
 * The quiet ask at the foot of each guide.
 *
 * Losing a reader to a validation error nobody explains is worse than
 * losing one to a bad headline, so the failure messages here all say what
 * to do instead.
 */
export const runtime = "nodejs";

export const OPTIONS = preflight;

export async function POST(req: Request) {
  const cors = corsHeaders(req.headers.get("origin"));

  let parsed;
  try {
    parsed = subscribeRequest.parse(await req.json());
  } catch {
    return NextResponse.json(
      { error: "That doesn't look like an email address." },
      { status: 400, headers: cors }
    );
  }

  /**
   * A filled honeypot returns 200.
   *
   * Not 400. A bot told it failed retries with the field empty; a bot
   * told it succeeded goes away.
   */
  if (trippedHoneypot(parsed.company)) {
    return NextResponse.json({ ok: true }, { headers: cors });
  }

  const verdict = await limitAll(
    "website.subscribe",
    keysFor({ ip: callerIp(req), email: parsed.email })
  );
  if (!verdict.ok) {
    return NextResponse.json(
      { error: "Too many attempts. Give it a minute and try again." },
      { status: 429, headers: { ...cors, "Retry-After": String(verdict.retryAfterSeconds) } }
    );
  }

  /**
   * Recorded before the guide is sent, for the same reason the demo
   * form is: somebody who asks for the guides is a lead, and an
   * enquiry that exists only inside a Resend delivery attempt does not
   * exist. The response to the *visitor* is unchanged — they are still
   * told plainly if the send failed.
   */
  const id = await recordSubscriber({
    id: randomUUID(),
    email: parsed.email,
    from: parsed.from,
    ip: callerIp(req),
    userAgent: req.headers.get("user-agent"),
  });

  try {
    await sendGuideFollowUp(parsed.email, parsed.from);
  } catch (err) {
    await settleSubscriber(id, false, String(err));
    log.error("[subscribe] send failed", {}, { from: parsed.from ?? "unknown", reason: String(err) });
    return NextResponse.json(
      { error: "We couldn't send that. Email hello@potatofarm.io and we'll do it by hand." },
      { status: 502, headers: cors }
    );
  }
  await settleSubscriber(id, true);

  return NextResponse.json({ ok: true }, { headers: cors });
}

export async function GET() {
  return NextResponse.json({ error: "Use POST." }, { status: 405 });
}
