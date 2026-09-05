import { forOrg } from "@/server/db/client";
import { aed } from "@/lib/money";

/**
 * The CMA equivalent, for a market with no MLS.
 *
 * This is the recipe that matters most and the one that does not port
 * from the American product. Their advisor opens the MLS and pulls
 * comparables. **Dubai has no MLS.** What exists instead:
 *
 *   1. DLD publishes actual transactions — the strongest evidence there
 *      is, because it is what somebody paid rather than what somebody
 *      asked.
 *   2. Portal listings — asking prices, which in a soft market are
 *      fiction and in a hot one are stale.
 *   3. **The brokerage's own completed deals** — the thing we hold and
 *      nobody else does.
 *
 * The third is the advantage. An agent's own firm sold four flats in
 * that tower last year and the CRM knows what they went for, what was
 * asked, and how long each took.
 *
 * ## The rule
 *
 * **Never invent a comparable.** A number an agent shows a seller is a
 * number they get held to, and losing an instruction over an invented
 * figure costs more than the report saves. Where the evidence is thin
 * this says so, in the report, in words the agent can read out.
 */

export type Comparable = {
  source: "OWN_DEAL" | "DLD" | "OWN_LISTING";
  building: string;
  beds: number;
  sqft: number | null;
  priceFils: bigint;
  soldAt: Date | null;
  /** Days from listing to completion, where we know both. */
  daysToSell: number | null;
};

export type Report = {
  subject: { building: string; beds: number; sqft: number | null };
  comparables: Comparable[];
  /** Null when the evidence does not support a range. Not a guess. */
  range: { lowFils: bigint; highFils: bigint; perSqft: string | null } | null;
  /** Printed on the report itself, not just returned. */
  caveats: string[];
  confidence: "GOOD" | "THIN" | "INSUFFICIENT";
};

/** Below this, no range is offered at all. Three sales is an anecdote. */
const MIN_COMPARABLES = 4;
/** Older than this and Dubai has moved. */
const MAX_AGE_MONTHS = 12;

export async function comparables(args: {
  orgId: string; building: string; beds: number; sqft?: number | null;
}): Promise<Report> {
  const db = forOrg(args.orgId);
  const since = new Date();
  since.setMonth(since.getMonth() - MAX_AGE_MONTHS);

  // The brokerage's own completed deals. Strongest evidence we hold,
  // and the part no competitor can reach.
  const deals = await db.deal.findMany({
    where: {
      stage: "COMPLETED",
      completedAt: { gte: since },
      listing: { building: { contains: args.building, mode: "insensitive" },
                 bedrooms: { in: [args.beds - 1, args.beds, args.beds + 1] } },
    },
    select: {
      completedAt: true, valueFils: true,
      listing: { select: { building: true, bedrooms: true, areaSqft: true,
                           createdAt: true } },
    },
    take: 40,
  });

  // Own listings that did not complete — weaker, and marked as such.
  const listings = await db.listing.findMany({
    where: {
      building: { contains: args.building, mode: "insensitive" },
      bedrooms: args.beds,
      createdAt: { gte: since },
      deletedAt: null,
    },
    select: { building: true, bedrooms: true, areaSqft: true, priceFils: true,
              createdAt: true },
    take: 20,
  });

  const comps: Comparable[] = [
    ...deals.map((d) => ({
      source: "OWN_DEAL" as const,
      building: d.listing?.building ?? args.building,
      beds: d.listing?.bedrooms ?? args.beds,
      sqft: d.listing?.areaSqft ?? null,
      priceFils: d.valueFils,
      soldAt: d.completedAt,
      // Listing has no explicit listed date — createdAt is when it
      // entered the system, which is the same thing in practice.
      daysToSell: d.listing?.createdAt && d.completedAt
        ? Math.round((d.completedAt.getTime() - d.listing.createdAt.getTime()) / 86_400_000)
        : null,
    })),
    /**
     * `flatMap` with a guard, not `map`.
     *
     * `building`, `bedrooms` and `priceFils` are all nullable columns and
     * `Comparable` requires all three. The where clause happens to
     * constrain the first two, but nothing constrained the price — and a
     * comparable with no price contributes nothing to a range while still
     * counting towards the "do we have enough evidence" threshold. That
     * is the worst of both: it makes thin evidence look sufficient and
     * then does not inform the answer.
     */
    ...listings.flatMap((l) =>
      l.building !== null && l.bedrooms !== null && l.priceFils !== null
        ? [{
            source: "OWN_LISTING" as const,
            building: l.building, beds: l.bedrooms, sqft: l.areaSqft,
            priceFils: l.priceFils, soldAt: null, daysToSell: null,
          }]
        : []
    ),
  ].sort((a, b) => (b.soldAt?.getTime() ?? 0) - (a.soldAt?.getTime() ?? 0));

  const sold = comps.filter((c) => c.source === "OWN_DEAL");
  const caveats: string[] = [];

  // Everything below is about being honest when the evidence is thin.
  // The competing product has a human catch this; we say it out loud.

  if (sold.length === 0) {
    caveats.push(
      `No completed sales in ${args.building} on our books in the last ` +
      `${MAX_AGE_MONTHS} months. Everything here is an asking price, which is ` +
      `what somebody hoped for rather than what somebody paid.`);
  }

  if (comps.length < MIN_COMPARABLES) {
    return {
      subject: { building: args.building, beds: args.beds, sqft: args.sqft ?? null },
      comparables: comps,
      // No range. Four data points is where a range starts meaning
      // something, and offering one below that is worse than offering
      // nothing.
      range: null,
      caveats: [...caveats,
        `Only ${comps.length} comparable${comps.length === 1 ? "" : "s"} — not enough ` +
        `to put a range on this. Pull the DLD transaction history for the tower ` +
        `before you quote a seller a number.`],
      confidence: "INSUFFICIENT",
    };
  }

  const prices = comps.map((c) => c.priceFils).sort((a, b) => (a < b ? -1 : 1));
  // Trimmed. One penthouse in a stack of two-beds moves a mean and
  // tells you nothing.
  const trimmed = prices.length >= 6 ? prices.slice(1, -1) : prices;
  // Non-empty: the insufficient-evidence guard above has already returned
  // for anything under the minimum, and trimming only removes the two
  // ends of a list of six or more. Stated rather than asserted, so that
  // if the guard above ever changes this fails loudly instead of
  // quoting a seller a range built from nothing.
  const low = trimmed[0];
  const high = trimmed[trimmed.length - 1];
  if (low === undefined || high === undefined)
    throw new Error("comparables: no prices left after trimming");

  const withSqft = comps.filter((c) => c.sqft && c.sqft > 0);
  const perSqft = withSqft.length >= 3
    ? aed(BigInt(Math.round(
        withSqft.reduce((s, c) => s + Number(c.priceFils) / c.sqft!, 0) / withSqft.length)))
    : null;
  if (!perSqft && withSqft.length > 0) {
    caveats.push("Not enough of these have a floor area recorded to give a rate per square foot.");
  }

  const median = sold.length
    ? sold.map((s) => s.daysToSell).filter((d): d is number => d != null)
    : [];
  if (median.length >= 3) {
    const m = median.sort((a, b) => a - b)[Math.floor(median.length / 2)];
    caveats.push(`Ours took about ${m} days from listing to completion. Worth saying to a seller who wants a fast sale.`);
  }

  const confidence = sold.length >= MIN_COMPARABLES ? "GOOD" : "THIN";
  if (confidence === "THIN") {
    caveats.push(
      `Only ${sold.length} of these actually completed. Treat the top of the range ` +
      `as optimistic until the DLD history backs it up.`);
  }

  return {
    subject: { building: args.building, beds: args.beds, sqft: args.sqft ?? null },
    comparables: comps.slice(0, 12),
    range: { lowFils: low, highFils: high, perSqft },
    caveats,
    confidence,
  };
}
