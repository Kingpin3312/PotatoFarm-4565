import type { ChannelType } from "@prisma/client";
import { after, NextRequest, NextResponse } from "next/server";
import { crossTenant } from "@/server/db/client";
import { adapters } from "@/server/lib/portals";
import { ingestEnquiry, markChannelHealthy } from "@/server/lib/portals/ingest";
import { getChannelCredentials } from "@/server/lib/secrets";
import { log } from "@/lib/log";

/**
 * Long enough for the work `after()` carries: the model's reply, the
 * pause that makes it read like a person, and the send. The platform
 * default can be shorter than that, and a function stopped mid-reply
 * leaves a buyer unanswered.
 */
export const maxDuration = 60;

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Inbound portal enquiries.
 *
 * The URL carries an opaque channel token rather than an org id. An
 * enumerable org id in a webhook URL lets anyone who guesses one post
 * leads into a stranger's pipeline.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ portal: string }> }) {
  const { portal } = await params;
  const adapter = adapters[portal.toUpperCase() as keyof typeof adapters];
  if (!adapter) return NextResponse.json({ error: "Unknown portal." }, { status: 404 });

  const token = req.nextUrl.searchParams.get("t");
  if (!token) return NextResponse.json({ error: "Missing channel token." }, { status: 400 });

  /**
   * Looked up by `webhookToken`, not by `secretRef`.
   *
   * `secretRef` is the pointer to where this channel's access token is
   * stored. Using it as the URL parameter meant handing a credential
   * reference to a third party and letting it travel through their logs
   * and every proxy on the way. The routing identifier and the secret
   * pointer are now two values doing one job each.
   */
  const channel = await crossTenant("sweep").channel.findFirst({
    where: { webhookToken: token, active: true, type: adapter.key as ChannelType },
    select: { id: true, orgId: true },
  });
  if (!channel) return NextResponse.json({ error: "Unknown channel." }, { status: 404 });

  const raw = await req.text();

  if (adapter.verify) {
    const { accessToken: secret } = await getChannelCredentials(channel.orgId, channel.id);
    if (!adapter.verify(raw, req.headers, secret)) {
      return NextResponse.json({ error: "Bad signature." }, { status: 401 });
    }
  }

  // Acknowledge first. Portals retry on anything slow, and a retry storm
  // turns one slow write into a flood of duplicate deliveries.
  const work = (async () => {
    const enquiries = adapter.parse(JSON.parse(raw));
    for (const e of enquiries) {
      await ingestEnquiry(channel.orgId, channel.id, adapter.key, e);
    }
    await markChannelHealthy(channel.id);
  })().catch(async (err) => {
    // Same reason as the WhatsApp route: a raw error object carries the
    // field values that failed, and this path handles enquirer names and
    // phone numbers.
    log.error("[portals] ingest failed", {}, { portal, reason: String(err).slice(0, 200) });
    await crossTenant("sweep").channel.update({
      where: { id: channel.id },
      data: { lastError: String(err).slice(0, 500) },
    });
  });

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
  after(() => work);

  return NextResponse.json({ received: true });
}
