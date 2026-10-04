import { createHash } from "node:crypto";
import type { MicrositeEventKind } from "@prisma/client";
import { crossTenant } from "@/server/db/client";
import { keysFor, limitAll } from "@/server/lib/ratelimit";
import { loadLive } from "./public";

/**
 * What visitors do on an agent's microsite, counted for the agent.
 *
 * Reported by the page itself (a beacon on load and on each button), not
 * counted when the server draws it — WhatsApp, Facebook and LinkedIn
 * fetch a link to draw its preview, and a page counted on render would
 * credit every share with a visit nobody made.
 *
 * No address is kept. A visitor is a hash of the address and browser
 * with a salt that changes every day, so a person is counted once a day
 * and cannot be recognised tomorrow or traced back to an address.
 */

export const EVENT_KINDS: Record<string, MicrositeEventKind> = {
  view: "VIEW",
  property: "PROPERTY_VIEW",
  whatsapp: "WHATSAPP_CLICK",
  phone: "PHONE_CLICK",
  email: "EMAIL_CLICK",
};

const BOT = /bot|crawl|spider|slurp|facebookexternalhit|whatsapp|linkedin|preview|embed|headless|lighthouse/i;

export function visitorHash(ip: string | null, userAgent: string | null, day = new Date()) {
  const salt = `${process.env.AUTH_SECRET ?? "microsite"}:${day.toISOString().slice(0, 10)}`;
  return createHash("sha256").update(`${salt}|${ip ?? ""}|${userAgent ?? ""}`).digest("hex").slice(0, 24);
}

export type EventOutcome = "recorded" | "ignored" | "limited" | "not-found";

export async function recordEvent(args: {
  orgSlug: string; agentSlug: string; kind: string; reference?: string | null;
  ip: string | null; userAgent: string | null;
}): Promise<EventOutcome> {
  const kind = EVENT_KINDS[args.kind];
  if (!kind) return "ignored";
  if (args.userAgent && BOT.test(args.userAgent)) return "ignored";
  const l = await loadLive(args.orgSlug, args.agentSlug);
  if (!l) return "not-found";
  if (!(await limitAll("microsite.event", keysFor({ ip: args.ip }))).ok) return "limited";

  // A property reference only counts if it is one of this brokerage's —
  // a made-up one is not a view of anything.
  let listingId: string | null = null;
  if (args.reference) {
    const ref = String(args.reference).slice(0, 40);
    const listing = await crossTenant("global-key").listing.findUnique({
      where: { orgId_reference: { orgId: l.org.id, reference: ref } }, select: { id: true, deletedAt: true },
    });
    if (!listing || listing.deletedAt) return "ignored";
    listingId = listing.id;
  }
  if (kind === "PROPERTY_VIEW" && !listingId) return "ignored";

  await crossTenant("global-key").micrositeEvent.create({
    data: { orgId: l.org.id, micrositeId: l.site.id, kind, listingId, visitor: visitorHash(args.ip, args.userAgent) },
  });
  return "recorded";
}

/** An agent's numbers since a date, and the properties looked at most. */
export async function micrositeStats(orgId: string, micrositeId: string, since: Date) {
  const db = crossTenant("global-key");
  const where = { orgId, micrositeId, createdAt: { gte: since } };
  const [byKind, visitors, top] = await Promise.all([
    db.micrositeEvent.groupBy({ by: ["kind"], where, _count: { _all: true } }),
    db.micrositeEvent.findMany({ where: { ...where, kind: "VIEW", visitor: { not: null } }, distinct: ["visitor"], select: { visitor: true }, take: 100_000 }),
    db.micrositeEvent.groupBy({
      by: ["listingId"], where: { ...where, kind: "PROPERTY_VIEW", listingId: { not: null } },
      _count: { _all: true }, orderBy: { _count: { listingId: "desc" } }, take: 5,
    }),
  ]);
  const count = (k: MicrositeEventKind) => byKind.find((b) => b.kind === k)?._count._all ?? 0;
  const listings = top.length
    ? await db.listing.findMany({ where: { orgId, deletedAt: null, id: { in: top.map((t) => t.listingId!) } }, select: { id: true, reference: true, title: true } })
    : [];
  const byId = new Map(listings.map((l) => [l.id, l]));
  const leads = await db.enquiry.count({ where: { orgId, micrositeId, createdAt: { gte: since } } });
  return {
    views: count("VIEW"),
    visitors: visitors.length,
    propertyViews: count("PROPERTY_VIEW"),
    whatsapp: count("WHATSAPP_CLICK"),
    phone: count("PHONE_CLICK"),
    email: count("EMAIL_CLICK"),
    leads,
    topProperties: top.map((t) => ({
      reference: byId.get(t.listingId!)?.reference ?? "—",
      title: byId.get(t.listingId!)?.title ?? "A removed property",
      views: t._count._all,
    })),
  };
}
