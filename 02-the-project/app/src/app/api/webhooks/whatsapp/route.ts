import { after, NextRequest, NextResponse } from "next/server";
import { verifySignature } from "@/server/lib/whatsapp";
import { ingest } from "@/server/lib/ingest";
import { log } from "@/lib/log";

/**
 * Long enough for the work `after()` carries: the model's reply, the
 * pause that makes it read like a person, and the send. The platform
 * default can be shorter than that, and a function stopped mid-reply
 * leaves a buyer unanswered.
 */
export const maxDuration = 60;

export const runtime = "nodejs";
// The raw body is needed for the signature, so no automatic parsing.
export const dynamic = "force-dynamic";

/** Meta's subscription handshake. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (
    p.get("hub.mode") === "subscribe" &&
    p.get("hub.verify_token") === process.env.WHATSAPP_VERIFY_TOKEN
  ) {
    return new Response(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new Response("Forbidden", { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"), process.env.WHATSAPP_APP_SECRET!)) {
    // Never process an unsigned payload. Without this check, anyone who
    // finds the URL can write messages into any brokerage's inbox.
    return new Response("Bad signature", { status: 401 });
  }

  /**
   * Answer immediately, then work.
   *
   * Meta retries aggressively on anything slow or non-200, and a retry
   * storm turns one slow database write into thousands of duplicate
   * deliveries. Acknowledge in milliseconds; do the work after.
   */
  const payload = JSON.parse(raw);
  /**
   * `log.error`, never `console`.
   *
   * This is the inbound path that carries buyer phone numbers and
   * message bodies, and a raw error object is the worst thing to hand
   * a console: a Prisma failure puts the offending field values in
   * `err.meta`, so the personal data the scrubber exists to remove
   * goes straight to stdout. CLAUDE.md's rule is one logger and no
   * exceptions; these two webhook routes were the exceptions.
   */
  const done = ingest(payload).catch((err) =>
    log.error("[whatsapp] ingest failed", {}, { reason: String(err).slice(0, 200) }));

  /**
   * Kept alive after the response by `after()`, Next's own hook for
   * this — on Vercel it holds the function open until the work is done.
   *
   * It was `(req as { waitUntil? }).waitUntil`, which the request does
   * not have, so the work was never registered with anything: on a
   * serverless host the function freezes the moment it answers, and
   * the message could be half-recorded and never replied to. A
   * long-running dev server hides it completely, which is how it passed
   * every check. `api/demo` found the same cast and removed it; this
   * route kept it.
   */
  after(() => done);

  return NextResponse.json({ received: true });
}
