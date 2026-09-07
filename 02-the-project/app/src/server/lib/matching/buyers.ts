import { forOrg } from "@/server/db/client";
import { score, type Candidate, type Match } from "./score";
import { canDriveOutreach } from "./requirements";
import { decide } from "./outreach";

/**
 * Who wants this property.
 *
 * The matching engine has only ever run one way: given a buyer's
 * requirement, find a listing. That is the direction the nightly sweep
 * needs — a new listing arrives, who should hear about it. The other
 * direction is the one an **agent standing in front of an owner** needs,
 * and it did not exist:
 *
 *   "Twelve people on our book are looking for exactly this, four of
 *    them can be messaged today."
 *
 * That is the difference between asking for an instruction and winning
 * one, and it is the strongest thing a brokerage's own database can say
 * about itself. The brief asks for it in as many words: a property
 * should show its interested buyers, and a seller should be shown the
 * buyers most likely to purchase.
 *
 * **The same scoring function, in reverse.** Not a second engine — one
 * listing scored against many requirements instead of many listings
 * against one. A separate implementation would drift, and the day the
 * two disagreed an agent would have promised an owner something the
 * outbound path then refused to send.
 */

export type BuyerMatch = {
  /** Stable list key. A lead id when the viewer may see the lead, opaque otherwise. */
  key: string;
  /**
   * Null when the buyer belongs to another agent and this viewer only has
   * `lead:read:own`. The match still counts — see the note on scope
   * below — but there is no name to click.
   */
  leadId: string | null;
  name: string | null;
  /** Whose buyer it is. The person to go and ask, when it is not yours. */
  agentName: string | null;
  score: number;
  reasons: string[];
  caveats: string[];
  budgetMaxFils: bigint | null;
  /** 0–100 from the nightly scoring, or null if never scored. */
  leadScore: number | null;
  /**
   * Whether this one can actually be told about it today, and if not,
   * why — in words an agent can repeat to an owner.
   */
  contactable: { ok: true; useTemplate: boolean } | { ok: false; reason: string };
};

export type BuyerMatches = {
  matches: BuyerMatch[];
  /** How many could be messaged. The number an owner cares about. */
  contactableNow: number;
  /**
   * Requirements that fit but are not confirmed enough to drive an
   * outbound message. Counted rather than hidden, because "eleven fit
   * and four are confirmed" is a truer sentence than either number
   * alone.
   */
  unconfirmed: number;
  /**
   * True when it is currently outside sending hours, so the count above
   * means "in the morning" rather than "in the next minute".
   *
   * This exists because of what the screen said at 23:38 the first time
   * it was opened against real data: *nobody can be messaged today.*
   * Literally true — `decide()` refuses to send between 20:00 and 09:00
   * — and completely misleading, because every one of them could be
   * messaged nine hours later. An agent sitting with an owner in the
   * evening is exactly when this screen gets opened, and telling them
   * their book is empty at the moment it matters most is the worst
   * possible time to be pedantic.
   *
   * So contactability is judged at the next moment a message would
   * actually be allowed to go, and the screen says which moment that is.
   */
  outsideHours: boolean;
};

/** The hour in the brokerage's day, wherever the server happens to be. */
function localHour(at: Date, timeZone: string): number {
  return Number(
    new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", hour12: false }).format(at)
  );
}

/**
 * Now, or the next hour a message would be permitted.
 *
 * Stepped an hour at a time rather than computed, because "tomorrow at
 * ten" is date arithmetic across a timezone and a DST boundary, and this
 * codebase has already been caught once treating a Dubai day as a UTC
 * one. Twenty-four steps of an obviously-correct loop beats one clever
 * line that is wrong twice a year.
 */
export function sendableAt(now: Date, timeZone = "Asia/Dubai"): { at: Date; outsideHours: boolean } {
  const hour = localHour(now, timeZone);
  if (hour >= 9 && hour < 20) return { at: now, outsideHours: false };

  const at = new Date(now);
  for (let i = 0; i < 24; i++) {
    at.setTime(at.getTime() + 3_600_000);
    if (localHour(at, timeZone) === 10) return { at, outsideHours: true };
  }
  // Unreachable — every timezone has a 10am. Falling back to `now` means
  // the honest answer "not right now" rather than a thrown error on a
  // screen an agent is reading in front of a customer.
  return { at: now, outsideHours: true };
}

/**
 * Deliberately lower than the outbound threshold.
 *
 * `SEND_THRESHOLD` is 0.75 and governs what the system will *message*
 * somebody about unprompted — a high bar, because a bad match sent to a
 * buyer teaches them to ignore us. This list is read by an agent who
 * will use their own judgement, so it shows the near-misses too and
 * marks them.
 */
export const SHOW_THRESHOLD = 0.5;

/**
 * Counted for everyone, named for the people entitled to the name.
 *
 * A brokerage's answer to "who wants this" is the whole brokerage's book,
 * and an agent who can only see their own leads would be handed a smaller
 * number than the truth — which is worse than useless in front of an
 * owner, because it undersells the firm.
 *
 * So the count is firm-wide and the identity is not. An agent sees
 * "another agent's buyer" and the colleague's name, which is the thing
 * they can actually act on: go and ask them. Naming the buyer outright
 * would turn this screen into a poaching tool, and the blackbook has
 * already settled that argument once in this codebase.
 */
export type Scope = { canSeeAll: boolean; viewerId: string };

export async function buyersFor(args: {
  orgId: string;
  listingId: string;
  scope: Scope;
  limit?: number;
  now?: Date;
}): Promise<BuyerMatches | null> {
  const db = forOrg(args.orgId);
  const now = args.now ?? new Date();
  // Contactability is judged at the next moment a message would be
  // allowed to leave, not at the moment somebody opened the screen.
  const send = sendableAt(now);

  const listing = await db.listing.findFirst({
    where: { id: args.listingId, deletedAt: null },
    select: {
      id: true, reference: true, title: true, priceFils: true,
      bedrooms: true, community: true, purpose: true, createdAt: true,
    },
  });
  if (!listing) return null;

  const candidate: Candidate = {
    id: listing.id,
    reference: listing.reference,
    title: listing.title,
    priceFils: listing.priceFils,
    bedrooms: listing.bedrooms,
    community: listing.community,
    purpose: listing.purpose as "SALE" | "RENT",
    listedAt: listing.createdAt,
  };

  /**
   * Live requirements only, and matched on purpose first.
   *
   * A rental requirement against a sale listing is not a weak match, it
   * is a wrong one — `score()` disqualifies it anyway, but filtering
   * here keeps the query honest on a brokerage with thousands.
   */
  const requirements = await db.requirement.findMany({
    where: {
      active: true,
      purpose: listing.purpose,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
    },
    // Ordered so the cap is the freshest two thousand rather than
    // whatever Postgres happened to return. An unordered `take` is a
    // silently different answer every night.
    orderBy: { updatedAt: "desc" },
    take: 2_000,
    select: {
      id: true, leadId: true, budgetMinFils: true, budgetMaxFils: true,
      bedroomsMin: true, communities: true, intent: true,
      source: true, confidence: true, confirmedAt: true, active: true, expiresAt: true,
    },
  });
  if (!requirements.length) {
    return { matches: [], contactableNow: 0, unconfirmed: 0, outsideHours: send.outsideHours };
  }

  const leads = await db.lead.findMany({
    where: { id: { in: [...new Set(requirements.map((r) => r.leadId))] }, deletedAt: null },
    select: {
      id: true, name: true, status: true, score: true, budgetMaxFils: true,
      optedOutOfOutreach: true, lastOutreachAt: true, createdAt: true,
      assignedToId: true,
      assignedTo: { select: { name: true, email: true } },
      conversation: { select: { lastInboundAt: true } },
    },
  });
  const byLead = new Map(leads.map((l) => [l.id, l]));

  /**
   * Best requirement per person, not every requirement.
   *
   * Somebody with three saved searches that all fit is one buyer to
   * ring, and listing them three times is how an agent tells an owner
   * "twelve buyers" when there are five people.
   */
  const best = new Map<string, { m: Match; req: (typeof requirements)[number] }>();
  let unconfirmed = 0;

  for (const r of requirements) {
    const lead = byLead.get(r.leadId);
    if (!lead) continue;

    const m = score(
      {
        budgetMinFils: r.budgetMinFils,
        budgetMaxFils: r.budgetMaxFils,
        bedrooms: r.bedroomsMin,
        communities: r.communities,
        intent: r.intent === "RENT" ? "RENT"
              : r.intent === "BUY_TO_INVEST" ? "BUY_TO_INVEST"
              : r.intent === "BUY_TO_LIVE" ? "BUY_TO_LIVE" : null,
      },
      candidate
    );
    if (!m || m.score < SHOW_THRESHOLD) continue;

    const prev = best.get(r.leadId);
    if (!prev || m.score > prev.m.score) best.set(r.leadId, { m, req: r });
  }

  const matches: BuyerMatch[] = [];

  for (const [leadId, { m, req }] of best) {
    const lead = byLead.get(leadId)!;

    /**
     * Two separate gates, and both must pass before this says "yes, you
     * can message them".
     *
     * `canDriveOutreach` asks whether the *requirement* is trustworthy
     * enough — an inferred one needs an agent to confirm it first.
     * `decide` asks whether the *person* may be contacted at all — opted
     * out, gone quiet, messaged too recently.
     *
     * Reusing both rather than re-deriving them is the point. An agent
     * who tells an owner "four can be messaged today" and then finds the
     * send path refuses has been made to look foolish by their own
     * software.
     */
    const req_ok = canDriveOutreach({
      source: req.source, confidence: req.confidence,
      confirmedAt: req.confirmedAt, active: req.active, expiresAt: req.expiresAt,
    });
    if (!req_ok.ok) unconfirmed += 1;

    const person = decide({
      lead: {
        status: lead.status,
        optedOut: lead.optedOutOfOutreach,
        lastInboundAt: lead.conversation?.lastInboundAt ?? null,
        lastOutreachAt: lead.lastOutreachAt,
        createdAt: lead.createdAt,
      },
      match: m,
      now: send.at,
    });

    const contactable: BuyerMatch["contactable"] =
      !req_ok.ok ? { ok: false, reason: req_ok.reason ?? "needs confirming first" }
      : !person.send ? { ok: false, reason: person.reason }
      : { ok: true, useTemplate: person.useTemplate };

    /**
     * The name is the only field withheld, and only from somebody who
     * would not be allowed to open the lead anyway.
     *
     * Everything else — the fit, the budget ceiling, whether they can be
     * messaged — is what makes the count believable to an owner, and none
     * of it identifies anyone.
     */
    const mine = args.scope.canSeeAll || lead.assignedToId === args.scope.viewerId;
    const agentName = lead.assignedTo?.name ?? lead.assignedTo?.email ?? null;

    matches.push({
      key: mine ? leadId : `req:${req.id}`,
      leadId: mine ? leadId : null,
      name: mine ? lead.name : null,
      agentName,
      score: m.score,
      reasons: m.reasons,
      caveats: m.caveats,
      budgetMaxFils: lead.budgetMaxFils,
      leadScore: lead.score,
      contactable,
    });
  }

  /**
   * Ranked by how well they fit, then by how warm they are.
   *
   * Fit first on purpose. A hot lead who wants something else is not a
   * buyer for this property, and putting them at the top is how a list
   * like this stops being believed.
   */
  matches.sort((a, b) =>
    b.score - a.score || (b.leadScore ?? 0) - (a.leadScore ?? 0)
  );

  const limited = matches.slice(0, args.limit ?? 25);

  return {
    matches: limited,
    contactableNow: matches.filter((m) => m.contactable.ok).length,
    unconfirmed,
    outsideHours: send.outsideHours,
  };
}

/**
 * The sentence an agent says to an owner.
 *
 * Built here rather than in the screen so it cannot drift from the
 * numbers above it, and phrased so it is true when the numbers are
 * small — which for a new brokerage they will be. "One buyer" said
 * plainly beats "1 matching lead" dressed up.
 */
export function pitch(b: BuyerMatches): string {
  const n = b.matches.length;
  if (n === 0) return "Nobody on your book is looking for this yet.";

  const people = `${n} ${n === 1 ? "person" : "people"} on your book`;
  /**
   * "In the morning", not "today", when it is the middle of the night.
   *
   * The same count, said at 23:38, has to survive an owner reading it
   * over an agent's shoulder — and "you can message all of them today"
   * at midnight is the kind of small wrongness that costs a screen its
   * credibility.
   */
  const when = b.outsideHours ? "in the morning" : "today";

  if (b.contactableNow === 0) {
    return `${people} ${n === 1 ? "is" : "are"} looking for something like this, ` +
           `though none can be messaged ${when}.`;
  }
  if (b.contactableNow === n) {
    return `${people} ${n === 1 ? "is" : "are"} looking for something like this, ` +
           `and you can message ${n === 1 ? "them" : "all of them"} ${when}.`;
  }
  return `${people} ${n === 1 ? "is" : "are"} looking for something like this. ` +
         `${b.contactableNow} can be messaged ${when}.`;
}
