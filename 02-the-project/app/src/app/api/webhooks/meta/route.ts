import { NextRequest, NextResponse } from "next/server";
import { crossTenant } from "@/server/db/client";
import { fetchLead, verifySignature, TokenExpired } from "@/server/lib/portals/meta";
import { ingestEnquiry } from "@/server/lib/portals/ingest";
import { getChannelCredentials } from "@/server/lib/secrets";
import { log } from "@/lib/log";

/**
 * Facebook and Instagram lead ads.
 *
 * The channel a Dubai brokerage often spends most on, and the one we
 * were blind to until now.
 */

/** Meta's subscription handshake. One-time, and it must be exact. */
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  if (p.get("hub.mode") === "subscribe" &&
      p.get("hub.verify_token") === process.env.META_VERIFY_TOKEN) {
    // Plain text, not JSON. Meta compares the body byte for byte and a
    // quoted string fails the handshake with no useful error.
    return new NextResponse(p.get("hub.challenge") ?? "", { status: 200 });
  }
  return new NextResponse("no", { status: 403 });
}

export async function POST(req: NextRequest) {
  /**
   * The raw body, before anything parses it.
   *
   * The signature is over these exact bytes. Parsing and re-serialising
   * changes key order and whitespace, and the signature then fails for a
   * reason nobody can find at eleven at night.
   */
  const raw = await req.text();

  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    log.warn("meta webhook signature rejected", {}, {});
    return new NextResponse("no", { status: 401 });
  }

  let body: {
    entry?: { id: string; changes?: { value?: { leadgen_id?: string; page_id?: string } }[] }[];
  };
  try { body = JSON.parse(raw); } catch { return ok(); }

  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const leadgenId = change.value?.leadgen_id;
      const pageId = change.value?.page_id ?? entry.id;
      if (!leadgenId || !pageId) continue;

      // Which brokerage owns this Page. The only thing that maps a
      // Meta webhook to a tenant — there is no org id in the payload.
      // Same lookup as the portal webhook, same model. The Page id is
      // the only thing in a Meta payload that maps to a tenant — there
      // is no org id anywhere in it.
      const channel = await crossTenant("global-key").channel.findFirst({
        where: { type: "META_LEAD_ADS", identifier: pageId, active: true },
        select: { id: true, orgId: true },
      });
      if (!channel) {
        // A Page nobody has connected, or one that was disconnected and
        // still has a live subscription. Logged rather than errored —
        // Meta retries a non-200 for 36 hours and there is nothing to
        // retry into.
        log.warn("meta lead for an unknown page", {}, { pageId });
        continue;
      }

      try {
        // Per-tenant, via the same path every other channel uses. One
        // shared app token would mean one expiry taking out every
        // customer at once.
        const { accessToken: token } = await getChannelCredentials(channel.orgId, channel.id);
        const enquiry = await fetchLead(leagenIdSafe(leadgenId), token);
        if (enquiry) {
          // Four positional arguments, as the portal webhook already
          // calls it. This passed a single object.
          await ingestEnquiry(channel.orgId, channel.id, "META_LEAD_ADS", enquiry);
        }
      } catch (err) {
        if (err instanceof TokenExpired) {
          /**
           * The failure that loses leads silently.
           *
           * Meta only sends an id; the lead itself must be fetched back
           * with the Page token, and that fetch has a retention window.
           * An expired token means every lead arriving now is gone
           * permanently — not delayed, gone.
           *
           * So this is raised as an incident immediately rather than
           * counted as an error. It is the same class as a portal going
           * quiet, and considerably more expensive.
           */
          await raiseTokenIncident(channel.orgId, pageId);
        } else {
          log.error("meta ingest failed", { orgId: channel.orgId },
                    { leadgenId, err: String(err).slice(0, 120) });
        }
      }
    }
  }

  return ok();
}

/**
 * Always 200, once the signature is verified.
 *
 * Meta retries a non-200 for 36 hours and disables the subscription
 * after repeated failures — so a bug in our handling would end with the
 * brokerage's entire Meta lead flow switched off by Facebook. We accept
 * the delivery and deal with our own problems on our side.
 */
const ok = () => NextResponse.json({ received: true });

/** Meta ids are numeric strings. Anything else is not from Meta. */
const leagenIdSafe = (id: string) =>
  /^\d{5,25}$/.test(id) ? id : (() => { throw new Error("bad leadgen id"); })();

/**
 * Recorded on the channel, where every other feed failure is recorded.
 *
 * `health/alert.ts` sweeps `lastError` and raises the incident — there
 * is no separate incident API, and inventing one would put this failure
 * somewhere nobody looks.
 *
 * The wording is the runbook. Whoever reads this at eleven at night
 * needs to know it is permanent, not delayed.
 */
async function raiseTokenIncident(orgId: string, pageId: string) {
  await crossTenant("global-key").channel.updateMany({
    where: { orgId, identifier: pageId, type: "META_LEAD_ADS" },
    data: {
      lastError:
        "Meta access token rejected. Leads are arriving and cannot be collected — " +
        "every one until the Page is reconnected is lost permanently, not delayed. " +
        "Reconnect in Settings → Channels.",
    },
  });
  log.error("meta token expired — leads being lost", { orgId }, { pageId });
}
