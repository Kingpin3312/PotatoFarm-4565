import { crossTenant } from "@/server/db/client";
import { log } from "@/lib/log";
import { keysFor, limitAll } from "@/server/lib/ratelimit";
import { ingestEnquiry } from "@/server/lib/portals/ingest";
import { PROBLEMS, readEnquiryForm } from "./enquiry-form";
import { publicListing } from "./public";

/**
 * An enquiry from a brokerage's own pages, into the product.
 *
 * Through `ingestEnquiry`, as the website form and the portals go: the
 * buyer is matched by phone (one person across WhatsApp, the portals and
 * this page is one lead), routed by the brokerage's own rules, and put on
 * the board. Filed on a channel of its own — "Your listings page", made
 * on the first enquiry — so the report of where leads come from can say
 * so. No silence alarm on it: nothing outside this product delivers to
 * it, so its quiet is a quiet week, not a broken pipe.
 *
 * The reference is only kept if the brokerage advertises it; anything
 * else in the field is a buyer's own words and goes in the message.
 *
 * ## Through an agent's microsite
 *
 * With `site`, the enquiry was made on that agent's microsite (or on a
 * property page opened from it), which `microsite/enquiry.ts` has already
 * found live for this brokerage. The lead goes to that agent (`ingestEnquiry`'s `directed`), filed
 * as an agent-microsite lead on a channel of its own, with the microsite
 * on the enquiry, so the agent's numbers and the brokerage's report both
 * count it.
 */
const CHANNEL = "listings-page";
const MICROSITE_CHANNEL = "agent-microsites";

export type EnquiryOutcome =
  | { ok: true }
  | { ok: false; status: 400 | 404 | 429; problem: string };

export type EnquirySite = { micrositeId: string; userId: string; name: string };

export async function pageEnquiry(slug: string, data: Record<string, string | undefined>, ip: string | null, site?: EnquirySite): Promise<EnquiryOutcome> {
  const db = crossTenant("global-key");
  const org = await db.organisation.findUnique({ where: { slug }, select: { id: true, deletedAt: true } });
  if (!org || org.deletedAt) return { ok: false, status: 404, problem: "Not found." };

  const read = readEnquiryForm(data);
  // A script that filled the hidden field is told it worked, and nothing
  // is recorded — so it has nothing to learn from the answer.
  if (!read.ok && read.reason === "bot") return { ok: true };
  if (!read.ok) return { ok: false, status: 400, problem: read.reason === "invalid" ? read.problem : "Please check the form." };
  const f = read.form;

  const verdict = await limitAll("property.enquiry", [...keysFor({ ip }), ...(f.phone ? [`phone:${f.phone}`] : [])]);
  if (!verdict.ok) return { ok: false, status: 429, problem: PROBLEMS.BUSY };

  // Through the property page's own gate: a reference is only attached if
  // the brokerage may advertise it, whatever a posted field says.
  const listing = f.reference ? await publicListing(slug, f.reference) : null;

  const channel = await db.channel.upsert({
    where: { orgId_type_identifier: { orgId: org.id, type: "WEBSITE_FORM", identifier: site ? MICROSITE_CHANNEL : CHANNEL } },
    create: site
      ? { orgId: org.id, type: "WEBSITE_FORM", identifier: MICROSITE_CHANNEL, label: "Agent microsites" }
      : { orgId: org.id, type: "WEBSITE_FORM", identifier: CHANNEL, label: "Your listings page" },
    update: {},
    select: { id: true },
  });
  const about = listing ? `About ${listing.reference} (${listing.title}). ` : "";
  const r = await ingestEnquiry(org.id, channel.id, "WEBSITE_FORM", {
    externalId: `page:${crypto.randomUUID()}`,
    receivedAt: new Date(),
    name: f.name, phone: f.phone ?? undefined, email: f.email ?? undefined,
    message: `${about}${f.message ?? ""}`.trim() || undefined,
    listingRef: listing?.reference,
    source: site ? `Agent microsite · ${site.name}` : listing ? "Property page" : "Listings page",
    raw: { via: site ? "agent-microsite" : "listings-page" },
  }, site ? { userId: site.userId, why: `Asked through ${site.name}'s microsite.`, micrositeId: site.micrositeId } : undefined);
  if (site && r.reason === "ok") {
    await db.micrositeEvent.create({ data: { orgId: org.id, micrositeId: site.micrositeId, kind: "LEAD", listingId: null } });
  }
  log.info("[listings page] enquiry", { orgId: org.id }, { created: r.created, reason: r.reason });
  return { ok: true };
}
