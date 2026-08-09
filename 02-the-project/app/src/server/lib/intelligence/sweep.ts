import { crossTenant } from "@/server/db/client";
import { log } from "@/lib/log";
import { messagingWindow } from "@/server/lib/whatsapp";
import { movement, scoreLead, type ScoreInput } from "./score";
import { nextAction, type Subject } from "./next-action";

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
    const medianListingFils = prices.length
      ? prices[Math.floor(prices.length / 2)]!.priceFils
      : null;

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
        requirements: { where: { active: true }, select: { id: true } },
        viewings: {
          select: { id: true, scheduledAt: true, status: true, outcome: true },
        },
        _count: { select: { requirements: true } },
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
        offerCount: 0,
        medianListingFils,
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
        openOffers: 0,
        offerExpiringInDays: null,
        budgetMaxFils: lead.budgetMaxFils,
        matchesWaiting: 0,
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

  log.info("intelligence sweep", {}, { orgs: orgs.length, scored, recommended, stale });
  return { orgs: orgs.length, scored, recommended, stale };
}
