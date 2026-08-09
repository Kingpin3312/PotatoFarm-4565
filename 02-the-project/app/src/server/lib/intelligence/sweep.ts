import { crossTenant } from "@/server/db/client";
import { log } from "@/lib/log";
import { messagingWindow } from "@/server/lib/whatsapp";
import { best, type Candidate } from "@/server/lib/matching/score";
import { movement, scoreLead, type ScoreInput } from "./score";
import { nextAction, type Subject } from "./next-action";
import { assessRisk } from "@/server/lib/deals/risk";

/**
 * Score every lead, and decide what to do about each one.
 *
 * **Nightly, in the jobs layer, never in a request.** Scoring a
 * brokerage's whole database on a page load is how an intelligence layer
 * becomes the reason the product feels slow — and the agent who opens
 * the app at 7am wants an answer already computed, not a spinner while
 * four hundred leads are evaluated.
 *
 * One pass per brokerage. Cross-tenant by definition, which is what
 * `crossTenant("sweep")` announces.
 */

/** Leads untouched for longer than this are not worth the cycles. */
const HORIZON_DAYS = 180;

export async function sweepIntelligence() {
  const db = crossTenant("sweep");
  const now = new Date();
  const horizon = new Date(now.getTime() - HORIZON_DAYS * 86_400_000);

  const orgs = await db.organisation.findMany({
    where: { deletedAt: null },
    select: { id: true },
  });

  let scored = 0;
  let recommended = 0;
  let stale = 0;

  for (const org of orgs) {
    /**
     * The median asking price on this brokerage's own book.
     *
     * Budget fit is measured against what they actually sell, not
     * against an absolute. A firm whose stock is 2–4m gets nothing from
     * a 60m buyer at the top of the list, because there is nothing to
     * show them.
     */
    const prices = await db.listing.findMany({
      where: { orgId: org.id, status: { in: ["AVAILABLE", "UNDER_OFFER"] },
               deletedAt: null, priceFils: { not: null } },
      select: { priceFils: true },
      orderBy: { priceFils: "asc" },
    });
    /**
     * The band, not the middle. See the note on `ScoreInput.book`.
     *
     * Ordered ascending above, so the ends of the array are the ends of
     * the band.
     */
    const withPrice = prices.filter((p): p is { priceFils: bigint } => p.priceFils !== null);
    const book = withPrice.length
      ? { minFils: withPrice[0]!.priceFils, maxFils: withPrice[withPrice.length - 1]!.priceFils }
      : null;

    /**
     * The brokerage's live book, fetched once.
     *
     * Matching every lead against inventory is the expensive part of
     * this sweep, and the inventory does not change between leads.
     */
    const listingRows = await db.listing.findMany({
      where: { orgId: org.id, status: { in: ["AVAILABLE", "UNDER_OFFER"] }, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: {
        id: true, reference: true, title: true, priceFils: true,
        bedrooms: true, community: true, purpose: true, createdAt: true,
      },
    });
    const candidates: Candidate[] = listingRows.map((l) => ({
      id: l.id, reference: l.reference, title: l.title, priceFils: l.priceFils,
      bedrooms: l.bedrooms, community: l.community,
      purpose: l.purpose as "SALE" | "RENT", listedAt: l.createdAt,
    }));

    /**
     * Offers still in play, in one query rather than a relation.
     *
     * `Offer.leadId` is a bare column — no relation is declared on
     * either side, the same omission the schema already documents for
     * Requirement — so a nested select is not available. Fetching them
     * per brokerage and grouping in memory costs one round trip; a
     * per-lead query would cost five thousand.
     *
     * This exists because `openOffers` and `offerExpiringInDays` were
     * hardcoded to zero when the sweep was first written, which meant
     * two of the engine's highest-priority rules — the expiring offer
     * and the stalled negotiation — could never fire. A rule that cannot
     * fire is worse than an absent one, because it reads as covered.
     */
    const liveOffers = await db.offer.findMany({
      where: {
        orgId: org.id,
        leadId: { not: null },
        status: { in: ["SUBMITTED", "PRESENTED", "COUNTERED"] },
      },
      select: { leadId: true, expiresAt: true },
    });
    const offersByLead = new Map<string, Date[]>();
    let anyOffers = 0;
    for (const o of liveOffers) {
      if (!o.leadId) continue;
      anyOffers += 1;
      const list = offersByLead.get(o.leadId) ?? [];
      if (o.expiresAt) list.push(o.expiresAt);
      offersByLead.set(o.leadId, list);
    }
    // Count per lead, kept separately because a lead can have an offer
    // with no expiry and the map above only stores dates.
    const offerCountByLead = new Map<string, number>();
    for (const o of liveOffers) {
      if (!o.leadId) continue;
      offerCountByLead.set(o.leadId, (offerCountByLead.get(o.leadId) ?? 0) + 1);
    }
    void anyOffers;

    const leads = await db.lead.findMany({
      where: {
        orgId: org.id,
        deletedAt: null,
        status: { notIn: ["WON", "LOST"] },
        OR: [{ updatedAt: { gte: horizon } }, { createdAt: { gte: horizon } }],
      },
      select: {
        id: true, name: true, status: true, intent: true, timeframe: true,
        budgetMaxFils: true, createdAt: true, stageEnteredAt: true,
        optedOutOfOutreach: true, assignedToId: true, lastOutreachAt: true,
        conversation: {
          select: {
            lastInboundAt: true, lastOutboundAt: true,
            _count: { select: { messages: true } },
          },
        },
        requirements: {
          where: { active: true },
          select: {
            id: true, budgetMinFils: true, budgetMaxFils: true,
            bedroomsMin: true, communities: true, intent: true, purpose: true,
          },
        },
        viewings: {
          select: { id: true, scheduledAt: true, status: true, outcome: true },
        },
      },
      take: 5_000,
    });

    for (const lead of leads) {
      const conv = lead.conversation;

      /**
       * Inbound and outbound counts.
       *
       * `Conversation._count.messages` is the total both ways, and there
       * is no per-direction count on the row. Rather than issue a query
       * per lead — which on a five-thousand-lead brokerage is five
       * thousand round trips — the split is approximated from the
       * timestamps we already hold, and the score treats it as a coarse
       * signal. It is used for "chased and silent", which is about the
       * *gap* between the two rather than the exact numbers.
       */
      const total = conv?._count.messages ?? 0;
      const inboundCount = conv?.lastInboundAt ? Math.max(1, Math.round(total / 2)) : 0;
      const outboundCount = Math.max(0, total - inboundCount);

      // COMPLETED, not ATTENDED — the enum is
      // SCHEDULED/CONFIRMED/COMPLETED/NO_SHOW/CANCELLED. A viewing with
      // an outcome recorded counts too, because an agent who wrote down
      // what happened has told us more than the status field has.
      const attended = lead.viewings.filter(
        (v) => v.status === "COMPLETED" || v.outcome !== null
      ).length;
      const awaitingOutcome = lead.viewings.filter(
        (v) => v.scheduledAt < now && v.outcome === null &&
               v.status !== "CANCELLED" && v.status !== "NO_SHOW"
      ).length;
      const upcoming = lead.viewings.filter(
        (v) => v.scheduledAt >= now &&
               (v.status === "SCHEDULED" || v.status === "CONFIRMED")
      ).length;

      const input: ScoreInput = {
        createdAt: lead.createdAt,
        lastInboundAt: conv?.lastInboundAt ?? null,
        lastOutboundAt: conv?.lastOutboundAt ?? null,
        inboundCount,
        outboundCount,
        status: lead.status,
        intent: lead.intent,
        timeframe: lead.timeframe,
        budgetMaxFils: lead.budgetMaxFils,
        requirementCount: lead.requirements.length,
        viewingCount: lead.viewings.length,
        attendedCount: attended,
        offerCount: offerCountByLead.get(lead.id) ?? 0,
        book,
      };

      const score = scoreLead(input, now);

      /**
       * The previous score, for movement.
       *
       * One extra read per lead, and it is what makes "warming — up 12
       * points this week" possible at all. A single `Lead.score` column
       * cannot answer it, which is why `LeadScoreEvent` exists.
       */
      const prev = await db.leadScoreEvent.findFirst({
        where: { orgId: org.id, leadId: lead.id,
                 computedAt: { lte: new Date(now.getTime() - 6 * 86_400_000) } },
        orderBy: { computedAt: "desc" },
        select: { score: true },
      });
      const moved = movement(score.total, prev?.score ?? null);
      if (moved) score.drivers.unshift(moved);

      await db.$transaction([
        db.lead.update({ where: { id: lead.id }, data: { score: score.total } }),
        db.leadScoreEvent.create({
          data: {
            orgId: org.id, leadId: lead.id, score: score.total,
            recency: score.recency, engagement: score.engagement,
            intent: score.intent, budgetFit: score.budgetFit,
            drivers: score.drivers, computedAt: now,
          },
        }),
      ]);
      scored += 1;

      /**
       * A recommendation belongs to an agent.
       *
       * An unassigned lead has nobody to recommend anything to, and
       * putting one on a manager's list turns an assistant into a
       * report. Routing an unassigned lead is a different job, and
       * `routing/assign.ts` already does it.
       */
      if (!lead.assignedToId) continue;

      const win = messagingWindow(conv?.lastInboundAt ?? null);

      /**
       * The soonest expiry across their live offers.
       *
       * Null when nothing expires — an offer with no date on it is open
       * until somebody answers it, which is a different problem and the
       * stalled-negotiation rule covers it.
       */
      const openOffers = offerCountByLead.get(lead.id) ?? 0;
      const soonest = (offersByLead.get(lead.id) ?? [])
        .slice()
        .sort((a, b) => a.getTime() - b.getTime())[0];
      const offerExpiringInDays = soonest
        ? Math.ceil((soonest.getTime() - now.getTime()) / 86_400_000)
        : null;

      /**
       * How many properties on the book fit a live requirement.
       *
       * Counted against the same `best()` threshold the outbound path
       * uses, so "send them the one that fits" means the system would
       * actually send it. Candidates are fetched once per brokerage
       * above, not once per lead — five thousand leads against a
       * per-lead query is five thousand round trips.
       */
      let matchesWaiting = 0;
      if (!lead.optedOutOfOutreach) {
        for (const r of lead.requirements) {
          const found = best(
            {
              budgetMinFils: r.budgetMinFils,
              budgetMaxFils: r.budgetMaxFils,
              bedrooms: r.bedroomsMin,
              communities: r.communities,
              intent: r.intent === "RENT" ? "RENT"
                    : r.intent === "BUY_TO_INVEST" ? "BUY_TO_INVEST"
                    : r.intent === "BUY_TO_LIVE" ? "BUY_TO_LIVE" : null,
            },
            candidates.filter((c) => c.purpose === r.purpose)
          );
          if (found) matchesWaiting += 1;
        }
      }

      const subject: Subject = {
        leadId: lead.id,
        name: lead.name,
        status: lead.status,
        score,
        daysSinceInbound: conv?.lastInboundAt
          ? (now.getTime() - conv.lastInboundAt.getTime()) / 86_400_000 : null,
        daysSinceOutbound: conv?.lastOutboundAt
          ? (now.getTime() - conv.lastOutboundAt.getTime()) / 86_400_000 : null,
        daysInStage: Math.floor((now.getTime() - lead.stageEnteredAt.getTime()) / 86_400_000),
        requirementCount: lead.requirements.length,
        upcomingViewings: upcoming,
        viewingsAwaitingOutcome: awaitingOutcome,
        openOffers,
        offerExpiringInDays,
        budgetMaxFils: lead.budgetMaxFils,
        matchesWaiting,
        optedOut: lead.optedOutOfOutreach,
        windowHoursLeft: win.open ? win.hoursLeft : null,
      };

      const suggestion = nextAction(subject);

      if (!suggestion) {
        /**
         * Nothing to do is a real answer, and the old recommendation
         * has to go.
         *
         * Left `OPEN`, it becomes "call James, he has gone quiet" on the
         * morning after James called — the single fastest way to teach
         * an agent to stop reading the list.
         */
        const { count } = await db.recommendation.updateMany({
          where: { orgId: org.id, leadId: lead.id, state: "OPEN" },
          data: { state: "STALE", resolvedAt: now },
        });
        stale += count;
        continue;
      }

      /**
       * Upsert on the unique key, so a lead accumulates one live
       * recommendation per action rather than a pile of near-duplicates.
       *
       * A dismissal is respected: if an agent has said no to this exact
       * action, it is not resurrected the next night. That is the
       * training signal the model does not have, and overriding it is
       * how a suggestion becomes a nag.
       */
      const dismissed = await db.recommendation.findFirst({
        where: {
          orgId: org.id, leadId: lead.id, action: suggestion.action,
          state: "DISMISSED",
          resolvedAt: { gte: new Date(now.getTime() - 14 * 86_400_000) },
        },
        select: { id: true },
      });
      if (dismissed) continue;

      await db.recommendation.upsert({
        where: {
          orgId_agentId_leadId_action: {
            orgId: org.id, agentId: lead.assignedToId,
            leadId: lead.id, action: suggestion.action,
          },
        },
        create: {
          orgId: org.id, agentId: lead.assignedToId, leadId: lead.id,
          action: suggestion.action, headline: suggestion.headline,
          reason: suggestion.reason, priority: suggestion.priority,
          valueFils: suggestion.valueFils,
          state: "OPEN", computedAt: now,
          expiresAt: new Date(now.getTime() + 3 * 86_400_000),
        },
        update: {
          headline: suggestion.headline, reason: suggestion.reason,
          priority: suggestion.priority, valueFils: suggestion.valueFils,
          state: "OPEN", resolvedAt: null, computedAt: now,
          expiresAt: new Date(now.getTime() + 3 * 86_400_000),
        },
      });
      recommended += 1;

      // Any *other* open recommendation for this lead is superseded.
      // One person, one thing to do.
      const { count } = await db.recommendation.updateMany({
        where: {
          orgId: org.id, leadId: lead.id, state: "OPEN",
          action: { not: suggestion.action },
        },
        data: { state: "STALE", resolvedAt: now },
      });
      stale += count;
    }
  }

  /**
   * Deals in trouble, on the same list as everything else.
   *
   * `Recommendation.dealId` existed from the day the model was written
   * and nothing wrote to it — the deal risk engine and the command
   * centre were two systems that never met, so an agent had to know to
   * go and look at the deals screen to find out a transfer was about to
   * miss its date.
   *
   * A separate pass rather than folded into the lead loop, because a
   * deal is not a lead: it can outlive one, it can have none, and it is
   * assessed on completely different signals.
   */
  for (const org of orgs) {
    const live = await db.deal.findMany({
      where: { orgId: org.id, stage: { notIn: ["COMPLETED", "COLLAPSED"] } },
      select: {
        id: true, reference: true, stage: true, financing: true, valueFils: true,
        sellerHasMortgage: true, contractualCompletionAt: true, leadId: true,
        milestones: { select: { stage: true, completedAt: true, blockedReason: true } },
      },
    });
    if (!live.length) continue;

    const leadIds = live.map((d) => d.leadId).filter((x): x is string => Boolean(x));
    const leads = leadIds.length
      ? await db.lead.findMany({
          where: { id: { in: leadIds } },
          select: { id: true, name: true, assignedToId: true,
                    conversation: { select: { lastInboundAt: true } } },
        })
      : [];
    const byId = new Map(leads.map((l) => [l.id, l]));

    for (const d of live) {
      const lead = d.leadId ? byId.get(d.leadId) : undefined;

      /**
       * No agent, no recommendation.
       *
       * A deal whose lead is unassigned has nobody to tell. Putting it
       * on a manager's list would turn the assistant into a report,
       * which is the thing this whole layer exists not to be.
       */
      const agentId = lead?.assignedToId;
      if (!agentId) continue;

      const last = lead?.conversation?.lastInboundAt ?? null;
      const risk = assessRisk({
        reference: d.reference,
        stage: d.stage,
        financing: d.financing,
        sellerHasMortgage: d.sellerHasMortgage,
        contractualCompletionAt: d.contractualCompletionAt,
        completed: d.milestones.filter((m) => m.completedAt).map((m) => m.stage),
        blocked: d.milestones
          .filter((m) => !m.completedAt && m.blockedReason)
          .map((m) => ({ stage: m.stage, reason: m.blockedReason! })),
        daysSinceContact: last
          ? Math.floor((now.getTime() - last.getTime()) / 86_400_000) : null,
        counterparty: lead?.name ?? null,
      }, now);

      /**
       * Healthy deals produce nothing, and any stale recommendation
       * goes with them.
       *
       * Same rule as leads: "this deal is at risk" left open the morning
       * after somebody fixed it is how an agent learns to stop reading
       * the list.
       */
      if (!risk.action) {
        const { count } = await db.recommendation.updateMany({
          where: { orgId: org.id, dealId: d.id, state: "OPEN" },
          data: { state: "STALE", resolvedAt: now },
        });
        stale += count;
        continue;
      }

      /**
       * Not an upsert.
       *
       * The unique key is `[orgId, agentId, leadId, action]`, and for a
       * deal recommendation `leadId` is null. Postgres treats NULLs as
       * distinct in a unique index, so an upsert on that key would
       * insert a fresh row every night rather than updating one. Found
       * by reading the constraint rather than by running it, which is
       * the only way this one shows up before it has made ninety
       * duplicates.
       */
      const existing = await db.recommendation.findFirst({
        where: { orgId: org.id, dealId: d.id, action: risk.action.kind,
                 state: { in: ["OPEN", "DISMISSED"] } },
        select: { id: true, state: true, resolvedAt: true },
      });

      // A dismissal is respected for a fortnight, as with leads.
      if (existing?.state === "DISMISSED" &&
          existing.resolvedAt && existing.resolvedAt > new Date(now.getTime() - 14 * 86_400_000)) {
        continue;
      }

      const data = {
        headline: risk.action.headline,
        reason: risk.reason,
        // Deals outrank leads: money is committed and a date is fixed.
        priority: risk.level === "AT_RISK" ? 0.95 : 0.6,
        valueFils: d.valueFils,
        state: "OPEN" as const,
        resolvedAt: null,
        computedAt: now,
        expiresAt: new Date(now.getTime() + 3 * 86_400_000),
      };

      if (existing) {
        await db.recommendation.update({ where: { id: existing.id }, data });
      } else {
        await db.recommendation.create({
          data: { orgId: org.id, agentId, dealId: d.id, action: risk.action.kind, ...data },
        });
      }
      recommended += 1;

      // One live recommendation per deal, as with a person.
      const { count } = await db.recommendation.updateMany({
        where: { orgId: org.id, dealId: d.id, state: "OPEN", action: { not: risk.action.kind } },
        data: { state: "STALE", resolvedAt: now },
      });
      stale += count;
    }
  }

  log.info("intelligence sweep", {}, { orgs: orgs.length, scored, recommended, stale });
  return { orgs: orgs.length, scored, recommended, stale };
}
