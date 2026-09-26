import type { forOrg } from "@/server/db/client";
import { placesIn } from "@/server/lib/places";
import { aedToFils } from "@/lib/money";
import { defaultExpiry } from "@/server/lib/matching/requirements";

/**
 * What a buyer is looking for, written down.
 *
 * `Requirement` is what matching, "who wants this property" and search's
 * "buyers in Dubai Marina" all read, and until now only voice intake
 * wrote one. A brokerage whose leads arrived by WhatsApp, a portal or
 * the front door had none at all, so every one of those features
 * answered "nobody" — which reads as a quiet market rather than a
 * missing record. Found by the audit's "buyers in dubai marina" probe.
 *
 * Two writers now: an agent on the person page, and the assistant's
 * extraction. **The agent's word wins.** The assistant only ever keeps
 * its own requirement up to date, and does not write one at all once an
 * agent has recorded theirs — a model's reading of a chat must never
 * overwrite what a person was told on the phone.
 */

/**
 * Areas as a listing writes them.
 *
 * "marina", "the palm", "DHE" become Dubai Marina, Palm Jumeirah, Dubai
 * Hills — the names `Listing.community` carries — so a requirement and a
 * listing meet. Anything the vocabulary does not know is kept as typed,
 * tidied, rather than thrown away: a new development is still an area.
 */
export function canonicalCommunities(input: string[]): string[] {
  const out: string[] = [];
  for (const raw of input) {
    const t = raw.trim().replace(/\s+/g, " ");
    if (!t) continue;
    const { places } = placesIn(t);
    const name = places[0] ?? t.replace(/\b\p{Ll}/gu, (c) => c.toUpperCase());
    if (!out.some((x) => x.toLowerCase() === name.toLowerCase())) out.push(name);
  }
  return out.slice(0, 8);
}

type Db = ReturnType<typeof forOrg>;

/**
 * The part of the assistant's extraction this reads, stated here rather
 * than imported: the assistant calls this module, so importing its types
 * back would close a cycle `architecture.py` rightly refuses.
 */
type Said = {
  budgetMin: number | null;
  budgetMax: number | null;
  intent: "BUY_TO_LIVE" | "BUY_TO_INVEST" | "RENT" | "SELL" | "LIST" | null;
  communities?: string[];
  bedrooms?: number | null;
  confidence?: Record<string, number>;
};

/** The assistant's requirement, kept current. Never an agent's. */
export async function requirementFromExtraction(
  db: Db, orgId: string, leadId: string, e: Said,
): Promise<"created" | "updated" | "skipped"> {
  // Sellers and landlords are not looking for anything.
  if (e.intent === "SELL" || e.intent === "LIST") return "skipped";
  const communities = canonicalCommunities(e.communities ?? []);
  const said = communities.length > 0 || e.bedrooms != null || e.budgetMax != null || e.budgetMin != null;
  if (!said) return "skipped";

  const existing = await db.requirement.findMany({
    where: { leadId, active: true },
    select: { id: true, source: true },
  });
  if (existing.some((r) => r.source !== "ASSISTANT")) return "skipped";

  const conf = Object.values(e.confidence ?? {});
  const data = {
    purpose: e.intent === "RENT" ? ("RENT" as const) : ("SALE" as const),
    intent: e.intent ?? undefined,
    ...(e.budgetMin != null ? { budgetMinFils: aedToFils(e.budgetMin) } : {}),
    ...(e.budgetMax != null ? { budgetMaxFils: aedToFils(e.budgetMax) } : {}),
    ...(e.bedrooms != null ? { bedroomsMin: e.bedrooms } : {}),
    ...(communities.length ? { communities } : {}),
    confidence: conf.length ? Math.min(...conf) : null,
    // Renewed whenever they say it again, and lapses when they stop.
    expiresAt: defaultExpiry(e.intent ?? null),
  };
  const mine = existing[0];
  if (mine) {
    await db.requirement.update({ where: { id: mine.id }, data });
    return "updated";
  }
  await db.requirement.create({ data: { ...data, orgId, leadId, source: "ASSISTANT" } });
  return "created";
}
