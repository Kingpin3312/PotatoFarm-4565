import { NextRequest, NextResponse } from "next/server";
import { crossTenant } from "@/server/db/client";
import { adapters } from "@/server/lib/portals";
import { ingestEnquiry, markChannelHealthy } from "@/server/lib/portals/ingest";
import { getChannelCredentials } from "@/server/lib/secrets";

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

  const channel = await crossTenant("sweep").channel.findFirst({
    where: { secretRef: token, active: true, type: adapter.key as any },
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
    console.error(`[portals] ${portal} ingest failed`, err);
    await crossTenant("sweep").channel.update({
      where: { id: channel.id },
      data: { lastError: String(err).slice(0, 500) },
    });
  });

  const ctx = (req as unknown as { waitUntil?: (p: Promise<unknown>) => void }).waitUntil;
  if (typeof ctx === "function") ctx(work);

  return NextResponse.json({ received: true });
}
