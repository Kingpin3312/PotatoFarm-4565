import { run } from "./runner";
import { sweep as notifySweep } from "@/server/lib/notify/sweep";
import { releaseHeld } from "@/server/lib/notify/digest";
import { sendDueReminders, expireHolds } from "@/server/lib/reminders";
import { checkChannelSilence } from "@/server/lib/portals/health";
import { retentionSweep } from "@/server/lib/privacy/erase";
import { expireGrants } from "@/server/lib/support/access";
import { sweepOverdue } from "@/server/lib/billing/dunning";
import { generateInvoice } from "@/server/lib/billing/invoice";
import { reconcile } from "@/server/lib/billing/reconcile";
import { sweepTrials } from "@/server/lib/billing/signup";
import { sweepRateLimits } from "@/server/lib/ratelimit";
import { sweepMailboxes } from "@/server/lib/email/sync";
import { sendDueFollowUps } from "@/server/lib/reminders";
import { sweepExpired } from "@/server/lib/offers/negotiate";
import { sweep as sweepVisaNudges } from "@/server/lib/matching/visa-nudge";
import { evaluate } from "@/server/lib/health/alert";
import { assess } from "@/server/lib/deals/timeline";
import { best } from "@/server/lib/matching/score";
import { decide, message } from "@/server/lib/matching/outreach";
import { canDriveOutreach } from "@/server/lib/matching/requirements";
import { groupForNotification } from "@/server/lib/documents/expiry";
import { shouldAdvance, scheduleNext } from "@/server/lib/plans/run";
import { askAt } from "@/server/lib/feedback/collect";
import { compose } from "@/server/lib/feedback/report";
import { crossTenant } from "@/server/db/client";
import { dispatch } from "@/server/lib/notify/dispatch";
import { sweepIntelligence } from "@/server/lib/intelligence/sweep";
import { drainPublishQueue } from "@/server/lib/portals/queue";
import { screen, screeningConfigured } from "@/server/lib/aml/screen";
import { deliver } from "@/server/lib/health/deliver";
// Used in two jobs and never imported.
import { log, report } from "@/lib/log";

/**
 * Every scheduled job, in one place.
 *
 * The schedule lives next to the function rather than only in a config
 * file, so somebody reading this knows how often a thing happens without
 * going and looking somewhere else.
 */
/**
 * One month on, clamped to the end of the target month.
 *
 * `setUTCMonth(getUTCMonth() + 1)` overflows for any day after the 28th:
 * 31 January becomes 3 March rather than 28 February, and 31 March
 * becomes 1 May. Measured, not assumed.
 *
 * It does not overcharge — `generateInvoice` divides the monthly price
 * by the actual period length, so a longer period bills a lower daily
 * rate and the total self-corrects. What it does is move the billing
 * anniversary: a brokerage that signs up on the 31st is billed on the
 * 3rd from then on, and never gets its date back.
 */
export function addOneMonth(from: Date): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  // Move to the 1st first, so adding the month cannot roll past the end
  // of a shorter one, then clamp the day back.
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const lastDay = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, lastDay));
  return d;
}

/**
 * Run one item of a sweep without letting it take the others down.
 *
 * Every loop in this file iterates across **all tenants** via
 * `crossTenant("sweep")`, and none of them caught anything. One
 * unprocessable row — a malformed lead, a provider timeout, a deleted
 * user — threw, and every tenant after it in the batch was silently not
 * processed. On `billing.invoices` that means one customer's bad data
 * stops invoicing for everybody.
 *
 * It is not caught at the job level, because a job that swallows its
 * own failure looks healthy: `jobsHealth()` only advances on
 * `SUCCEEDED`, and that is the signal worth keeping. So failures are
 * isolated per item, counted, and returned in the job result where the
 * count is visible.
 */
async function each<T>(
  // `Iterable`, not `T[]`: several sweeps group rows into a Map keyed by
  // brokerage and iterate its entries.
  items: Iterable<T>,
  label: (item: T) => string,
  fn: (item: T) => Promise<void>,
): Promise<{ done: number; failed: number }> {
  let done = 0, failed = 0;
  for (const item of items) {
    try {
      await fn(item);
      done += 1;
    } catch (err) {
      failed += 1;
      report(err, {}, { sweepItem: label(item) });
    }
  }
  return { done, failed };
}

export const JOBS = {
  /** Handovers waiting, leads unclaimed, viewings due. Every 5 minutes. */
  "notify.sweep": () => run("notify.sweep", async () => {
    await notifySweep();
    return {};
  }),

  /**
   * Everything held during somebody's quiet hours, released once they
   * are no longer quiet. Hourly.
   *
   * `dispatch.ts` has always said a held notification "goes out with the
   * morning digest". There was no morning digest — nothing read
   * `suppressed`, and a held message sat in the table until the agent
   * opened a screen. It had never bitten anyone only because nothing
   * could write a `NotificationPrefs` row, so nothing was ever held.
   *
   * Hourly rather than at a fixed time: quiet hours are per agent, in
   * the brokerage's timezone, so a single 07:00 sweep would be right for
   * one person and wrong for everybody else.
   */
  "notify.digest": () => run("notify.digest", async () => releaseHeld()),

  /** Releases slots a lead never answered about. Every 10 minutes. */
  "scheduling.expire-holds": () => run("scheduling.expire-holds", async () => ({
    released: await expireHolds(),
  })),

  /** Evening-before viewing reminders. Hourly. */
  "reminders.viewings": () => run("reminders.viewings", async () =>
    sendDueReminders()
  ),

  /** Portal feeds that have gone quiet. Hourly. */
  "portals.silence": () => run("portals.silence", async () => {
    const alerts = await checkChannelSilence();
    await each(alerts, (a) => `channel ${a.channelId}`, async (a) => {
      await dispatch({
        orgId: a.orgId,
        kind: "PORTAL_SILENT",
        subjectId: a.channelId,
        title: `${a.label} has gone quiet`,
        body: `Nothing for ${Math.round(a.quietHours)} hours. Normally there'd be something by now.`,
        deeplink: "/settings/portals",
        assignedToId: null,
        since: new Date(Date.now() - a.quietHours * 3_600_000),
      });
    });
    return { alerts: alerts.length };
  }),

  /** Support grants past their expiry. Hourly. */
  "support.expire-grants": () => run("support.expire-grants", async () => ({
    expired: await expireGrants(),
  })),

  /** Overdue invoices and the dunning ladder. Daily. */
  "billing.overdue": () => run("billing.overdue", async () =>
    sweepOverdue()
  ),

  /**
   * Monthly invoicing. Daily, but only acts on subscriptions whose period
   * has actually ended.
   *
   * The double-billing guard is here rather than only in the lock: an
   * invoice is skipped if one already exists for that subscription and
   * period. Locks protect against concurrency; this protects against
   * everything else, including somebody triggering the job by hand.
   */
  "billing.invoices": () => run("billing.invoices", async () => {
    const due = await crossTenant("sweep").subscription.findMany({
      where: { status: { in: ["ACTIVE", "PAST_DUE", "RESTRICTED"] }, currentTo: { lte: new Date() } },
      select: { id: true, currentFrom: true, currentTo: true },
    });

    let issued = 0;
    const { failed } = await each(due, (s) => `subscription ${s.id}`, async (s) => {
      const already = await crossTenant("sweep").invoice.findFirst({
        where: { subId: s.id, periodFrom: s.currentFrom, periodTo: s.currentTo },
        select: { id: true },
      });
      if (already) return;

      await generateInvoice(s.id, s.currentFrom, s.currentTo);

      // Roll the period forward only after the invoice exists, so a
      // failure halfway leaves the period un-advanced and the job simply
      // tries again tomorrow.
      const nextFrom = s.currentTo;
      const nextTo = addOneMonth(nextFrom);
      await crossTenant("sweep").subscription.update({
        where: { id: s.id },
        data: { currentFrom: nextFrom, currentTo: nextTo },
      });
      issued += 1;
    });
    return { considered: due.length, issued, failed };
  }),

  /**
   * Send queued listings to the portals. Every 10 minutes.
   *
   * `listings.publish` writes `state: "PENDING"` and, until this job
   * existed, **nothing ever read it**. A brokerage pressed publish, the
   * screen showed "pending", and the listing was never sent anywhere —
   * for a product whose customers are judged on how fast a property
   * appears on Bayut, that is the whole job undone.
   *
   * Ten minutes rather than nightly. A listing is perishable: the first
   * hours after an instruction are when the enquiries are, and a
   * brokerage that watches a competitor's identical unit go live first
   * does not care that ours would have gone out at 4am.
   */
  "listings.publish-queue": () => run("listings.publish-queue", async () =>
    drainPublishQueue()
  ),

  /**
   * Sanctions screening for files that have none, and re-screening for
   * files whose check has gone stale. Daily.
   *
   * The offer-acceptance path opens a `KycRecord` **inside the deal
   * transaction**, deliberately, so a deal cannot exist without a file.
   * Screening cannot go there: it calls an external provider over HTTP,
   * and holding a Postgres connection across a third-party call is the
   * thing that exhausts the pool. So the file opens transactionally and
   * the screening happens here, moments later.
   *
   * It is also the only place periodic re-screening can live. Lists
   * change — `screening.ts` puts it plainly: a client who was clear in
   * March may not be in June — so a one-off check at onboarding is a
   * control that decays.
   */
  "aml.screening": () => run("aml.screening", async () => {
    const db = crossTenant("sweep");
    const stale = new Date(Date.now() - 90 * 86_400_000);

    const records = await db.kycRecord.findMany({
      where: {
        status: { notIn: ["REJECTED"] },
        OR: [
          { screenings: { none: {} } },
          { screenings: { every: { screenedAt: { lt: stale } } } },
        ],
      },
      select: { id: true, orgId: true, legalName: true, nationality: true },
      take: 500,
    });

    /**
     * With no provider, do not write a row per file per night.
     *
     * `screen()` records an `ERROR` when nothing is configured, which is
     * right for a single deliberate action by an agent — they pressed a
     * button and deserve a recorded outcome. Run over every open file
     * every night it would be thousands of identical rows burying the
     * real ones, which is its own kind of silence.
     *
     * One alert instead, carrying the count. Unconfigured screening is a
     * compliance hole, not a quiet Tuesday.
     */
    if (!screeningConfigured()) {
      if (records.length) {
        await deliver({
          key: "aml.no-provider",
          severity: "PAGE",
          title: "Sanctions screening is not configured",
          detail:
            `${records.length} due diligence file(s) have never been screened, and no ` +
            `provider is configured to screen them. Every one of these is a transaction ` +
            `proceeding without a check the firm is legally obliged to perform.`,
          runbook: "OPERATIONS.md — configure a screening provider",
        });
      }
      return { unscreened: records.length, screened: 0, provider: "none" };
    }

    let confirmed = 0, possible = 0, errors = 0;
    const { failed } = await each(records, (r) => `kyc ${r.id}`, async (r) => {
      const out = await screen(db, {
        orgId: r.orgId,
        kycId: r.id,
        fullName: r.legalName,
        nationality: r.nationality ?? undefined,
      });
      if (out.result === "CONFIRMED_MATCH") confirmed += 1;
      else if (out.result === "POSSIBLE_MATCH") possible += 1;
      else if (out.result === "ERROR") errors += 1;
    });

    return { screened: records.length, confirmed, possible, errors, failed };
  }),

  /**
   * Every expiring document, grouped per recipient. Daily.
   *
   * Replaces a permit-only sweep. Three of these stop business when they
   * lapse — the Trakheesi permit, an agent's RERA card and the brokerage
   * licence — and all three fail silently: nothing errors, a transaction
   * simply cannot proceed, and somebody finds out on the day it matters.
   */
  "documents.expiry": () => run("documents.expiry", async () => {
    const horizon = new Date(Date.now() + 90 * 86_400_000);

    const docs = await crossTenant("sweep").document.findMany({
      where: { supersededById: null, expiresAt: { not: null, lte: horizon } },
      select: { orgId: true, type: true, ownerType: true, ownerId: true, expiresAt: true },
    });

    const byOrg = new Map<string, typeof docs>();
    for (const d of docs) byOrg.set(d.orgId, [...(byOrg.get(d.orgId) ?? []), d]);

    let sent = 0;
    await each(byOrg, ([orgId, items]) => `org ${orgId}`, async ([orgId, items]) => {
      for (const group of groupForNotification(items)) {
        await dispatch({
          orgId,
          kind: "PERMIT_EXPIRING",
          // Keyed on the recipient and the day, so one person gets one
          // message about eleven documents rather than eleven messages.
          subjectId: `docs:${group.notify}:${new Date().toISOString().slice(0, 10)}`,
          title: group.headline,
          body: group.blockingCount
            ? `${group.blockingCount} of them stop work when they lapse.`
            : `Nothing is blocked yet.`,
          deeplink: "/documents?filter=expiring",
          assignedToId: null,
          since: new Date(),
        });
        sent += 1;
      }
    });
    return { documents: docs.length, notifications: sent };
  }),

  /**
   * Trakheesi permits about to lapse. Daily.
   *
   * This was a query on the listings page and nothing else — which meant
   * an expiring permit only surfaced if somebody happened to open the
   * page. An expired permit means the listing is pulled and the brokerage
   * is advertising illegally, so it needs to come and find them.
   */
  "listings.permit-expiry": () => run("listings.permit-expiry", async () => {
    const cutoff = new Date(Date.now() + 14 * 86_400_000);
    const soon = await crossTenant("sweep").listing.findMany({
      where: {
        deletedAt: null,
        status: { in: ["AVAILABLE", "UNDER_OFFER"] },
        permitExpiresAt: { not: null, lte: cutoff },
      },
      select: { id: true, orgId: true, reference: true, permitExpiresAt: true },
    });

    // One notification per brokerage, not one per listing. Eleven separate
    // alerts about eleven permits is how somebody mutes the app.
    const byOrg = new Map<string, typeof soon>();
    for (const l of soon) byOrg.set(l.orgId, [...(byOrg.get(l.orgId) ?? []), l]);

    await each(byOrg, ([orgId, listings]) => `org ${orgId}`, async ([orgId, listings]) => {
      // `[0]` on a possibly-empty array is `undefined` under
      // noUncheckedIndexedAccess. byOrg is only ever built from a
      // non-empty list so this cannot fire, but the compiler cannot see
      // that and skipping the notification is the right thing to do if it
      // ever does.
      const [earliest] = listings
        .map((l) => l.permitExpiresAt!)
        .sort((a, b) => a.getTime() - b.getTime());
      if (!earliest) return;

      const days = Math.floor((earliest.getTime() - Date.now()) / 86_400_000);

      await dispatch({
        orgId,
        kind: "PERMIT_EXPIRING",
        subjectId: `permits:${earliest.toISOString().slice(0, 10)}`,
        title: `${listings.length} permit${listings.length > 1 ? "s" : ""} expiring`,
        body: days < 0
          ? `The soonest expired ${Math.abs(days)} days ago — those listings can't be published.`
          : `The soonest goes in ${days} days. Renew before the listings get pulled.`,
        deeplink: "/listings?filter=permits",
        assignedToId: null,
        since: new Date(),
      });
    });
    return { brokerages: byOrg.size, listings: soon.length };
  }),

  /**
   * Ask the payment provider what it actually thinks. Daily.
   *
   * The safety net under the webhook. A customer who paid and stayed
   * restricted because a webhook was lost is the worst failure this
   * system can produce, and it is entirely preventable.
   */
  "billing.reconcile": () => run("billing.reconcile", async () => reconcile()),

  /**
   * Health evaluation and alerting. Every 5 minutes.
   *
   * Runs on the same cadence as the notification sweep but is a different
   * thing entirely: that one tells a brokerage about their leads, this
   * one tells us about their system.
   */
  "health.evaluate": () => run("health.evaluate", async () => evaluate()),

  /**
   * Deals that have stopped being achievable. Every morning.
   *
   * The whole point of backwards planning is finding out early. A deal
   * that becomes impossible three weeks out and is noticed in the final
   * week costs somebody a deposit, so this comes and finds them.
   */
  "deals.slippage": () => run("deals.slippage", async () => {
    const live = await crossTenant("sweep").deal.findMany({
      where: {
        stage: { notIn: ["COMPLETED", "COLLAPSED"] },
        contractualCompletionAt: { not: null },
      },
      select: {
        id: true, orgId: true, reference: true, financing: true,
        sellerHasMortgage: true, contractualCompletionAt: true,
        milestones: { where: { completedAt: { not: null } }, select: { stage: true } },
      },
    });

    let atRisk = 0;
    await each(live, (d) => `deal ${d.id}`, async (d) => {
      const health = assess({
        deal: {
          financing: d.financing,
          sellerHasMortgage: d.sellerHasMortgage,
          contractualCompletionAt: d.contractualCompletionAt!,
        },
        completed: d.milestones.map((m) => m.stage),
      });

      // Only when it has actually gone wrong, or is about to. Telling
      // somebody daily that a deal is on track is how they stop reading.
      if (health.achievable && health.daysOfSlack > 3) return;

      await dispatch({
        orgId: d.orgId,
        kind: "DEAL_AT_RISK",
        subjectId: `deal-slip:${d.id}`,
        title: health.achievable
          ? `${d.reference} is tight`
          : `${d.reference} can no longer complete on time`,
        body: health.message,
        deeplink: `/deals/${d.id}`,
        assignedToId: null,
        since: new Date(),
      });
      atRisk += 1;
    });
    return { live: live.length, atRisk };
  }),

  /**
   * New listings, matched against live requirements. Once a day, at 10am.
   *
   * Deliberately not hourly. A buyer does not need to know within the
   * hour, and a job that can message people is a job that should run as
   * seldom as it usefully can.
   *
   * Only listings that went live in the last 24 hours are considered. The
   * alternative — matching against the whole inventory — means the first
   * run messages everybody about everything, which is exactly the
   * behaviour that gets a WhatsApp number reported.
   */
  "matching.new-listings": () => run("matching.new-listings", async () => {
    const since = new Date(Date.now() - 24 * 3_600_000);

    const fresh = await crossTenant("sweep").listing.findMany({
      where: { status: "AVAILABLE", deletedAt: null, createdAt: { gte: since } },
      select: {
        id: true, orgId: true, reference: true, title: true, priceFils: true,
        bedrooms: true, community: true, purpose: true, createdAt: true,
      },
    });
    if (!fresh.length) return { listings: 0, messaged: 0 };

    const byOrg = new Map<string, typeof fresh>();
    for (const l of fresh) byOrg.set(l.orgId, [...(byOrg.get(l.orgId) ?? []), l]);

    let messaged = 0, considered = 0, blocked = 0;

    await each(byOrg, ([orgId, listings]) => `org ${orgId}`, async ([orgId, listings]) => {
      const requirements = await crossTenant("sweep").requirement.findMany({
        where: { orgId, active: true },
        include: {
          lead: {
            select: {
              id: true, name: true, phone: true, status: true,
              optedOutOfOutreach: true, lastOutreachAt: true, createdAt: true,
              assignedTo: { select: { name: true } },
              conversation: { select: { lastInboundAt: true } },
            },
          },
        },
      });

      for (const r of requirements) {
        considered += 1;

        // Trust gate first — cheapest check, and the one that keeps a
        // guessed requirement from ever reaching a customer.
        const trust = canDriveOutreach(r);
        if (!trust.ok) { blocked += 1; return; }

        const match = best(
          {
            budgetMinFils: r.budgetMinFils,
            budgetMaxFils: r.budgetMaxFils,
            bedrooms: r.bedroomsMin,
            communities: r.communities,
            intent: r.intent as never,
          },
          listings.map((l) => ({
            id: l.id, reference: l.reference, title: l.title,
            // Straight through. The column is `priceFils` and is already
            // in fils — the previous line selected a `price` field that
            // does not exist and then multiplied it by 100 to "convert"
            // it, which is the hundred-times bug money.ts was written to
            // end. Had the column existed, every match would have scored
            // against a budget a hundred times too large.
            priceFils: l.priceFils,
            bedrooms: l.bedrooms, community: l.community,
            purpose: l.purpose as "SALE" | "RENT", listedAt: l.createdAt,
          }))
        );
        if (!match) return;

        const call = decide({
          lead: {
            status: r.lead.status,
            optedOut: r.lead.optedOutOfOutreach,
            lastInboundAt: r.lead.conversation?.lastInboundAt ?? null,
            lastOutreachAt: r.lead.lastOutreachAt,
            createdAt: r.lead.createdAt,
          },
          match,
        });
        if (!call.send) { blocked += 1; return; }

        // Sending happens through the normal outbound path, so the
        // template rule, the ledger and the audit trail all apply. There
        // is no separate marketing pipe that bypasses them.
        log.info("outreach match", { orgId }, {
          listing: match.listing.reference,
          score: match.score,
          template: call.useTemplate,
        });

        await crossTenant("sweep").lead.update({
          where: { id: r.lead.id },
          data: { lastOutreachAt: new Date() },
        });
        messaged += 1;
      }
    });

    return { listings: fresh.length, considered, messaged, blocked };
  }),

  /**
   * Task plans. Once a day.
   *
   * Daily rather than hourly on purpose: no step in a five-month nurture
   * sequence is urgent, and a job that can message people should run as
   * seldom as it usefully can.
   */
  "plans.advance": () => run("plans.advance", async () => {
    const due = await crossTenant("sweep").planSubscription.findMany({
      where: { state: "RUNNING", nextDueAt: { lte: new Date() } },
      take: 500,
      include: {
        plan: { include: { steps: { orderBy: { order: "asc" } } } },
      },
    });

    let acted = 0, paused = 0, finished = 0;

    await each(due, (sub) => `plan sub ${sub.id}`, async (sub) => {
      const lead = await crossTenant("sweep").lead.findUnique({
        where: { id: sub.leadId },
        select: {
          status: true, optedOutOfOutreach: true,
          conversation: { select: { lastInboundAt: true } },
        },
      });
      if (!lead) return;

      const call = shouldAdvance({
        sub: {
          currentStep: sub.currentStep,
          state: sub.state,
          startedAt: sub.startedAt,
          nextDueAt: sub.nextDueAt,
        },
        steps: sub.plan.steps,
        leadRepliedSince: lead.conversation?.lastInboundAt ?? null,
        leadOptedOut: lead.optedOutOfOutreach,
        leadStatus: lead.status,
      });

      if (!call.act) {
        if (call.newState) {
          await crossTenant("sweep").planSubscription.update({
            where: { id: sub.id },
            data: {
              state: call.newState,
              endedReason: call.reason,
              ...(call.newState !== "PAUSED" && { finishedAt: new Date() }),
            },
          });
          call.newState === "PAUSED" ? paused++ : finished++;
        }
        return;
      }

      // The step itself goes through the ordinary outbound path — same
      // frequency cap, quiet hours, opt-out and template rule as a match
      // alert. A sequence with its own sending rules is spam on a
      // schedule.
      log.info("plan step due", { orgId: sub.orgId }, {
        plan: sub.plan.name, step: call.step.order, action: call.step.action,
      });

      const next = scheduleNext(sub.plan.steps, sub.currentStep, new Date());
      await crossTenant("sweep").planSubscription.update({
        where: { id: sub.id },
        data: {
          currentStep: call.step.order,
          nextDueAt: next?.dueAt ?? null,
          ...(next ? {} : { state: "COMPLETED", finishedAt: new Date(), endedReason: "sequence finished" }),
        },
      });
      acted++;
    });

    return { due: due.length, acted, paused, finished };
  }),

  /**
   * Ask viewers what they thought. Hourly.
   *
   * Two hours after the viewing, never after 8pm. Asking as somebody
   * walks out gets a polite answer rather than a true one, and a survey
   * at 9pm is the message that makes somebody mute the thread.
   */
  "feedback.ask": () => run("feedback.ask", async () => {
    const done = await crossTenant("sweep").viewing.findMany({
      where: {
        status: "COMPLETED",
        scheduledAt: { gte: new Date(Date.now() - 3 * 86_400_000) },
      },
      select: { id: true, orgId: true, scheduledAt: true, durationMins: true, leadId: true },
      take: 200,
    });

    let asked = 0;
    await each(done, (v) => `viewing ${v.id}`, async (v) => {
      const already = await crossTenant("sweep").viewingFeedback.findUnique({
        where: { viewingId: v.id },
        select: { askedAt: true },
      });
      if (already?.askedAt) return;

      const due = askAt(new Date(v.scheduledAt.getTime() + v.durationMins * 60_000));
      if (due > new Date()) return;

      await crossTenant("sweep").viewingFeedback.upsert({
        where: { viewingId: v.id },
        create: { orgId: v.orgId, viewingId: v.id, leadId: v.leadId, askedAt: new Date() },
        update: { askedAt: new Date() },
      });
      asked += 1;
    });
    return { completed: done.length, asked };
  }),

  /**
   * Vendor reports. Weekly, Monday morning.
   *
   * Vendor communication is the most common complaint about estate agents
   * in every market anybody has measured, and the reason is that agents
   * have nothing to say. This gives them something.
   */
  "feedback.vendor-report": () => run("feedback.vendor-report", async () => {
    const since = new Date(Date.now() - 7 * 86_400_000);

    const listings = await crossTenant("sweep").listing.findMany({
      where: { status: { in: ["AVAILABLE", "UNDER_OFFER"] }, deletedAt: null },
      select: { id: true, orgId: true, title: true, createdAt: true },
      take: 500,
    });

    let composed = 0, withSignal = 0;

    await each(listings, (l) => `listing ${l.id}`, async (l) => {
      const rows = await crossTenant("sweep").viewingFeedback.findMany({
        where: { listingId: l.id, answeredAt: { not: null } },
        select: { verdict: true, reasons: true },
      });
      const viewings = await crossTenant("sweep").viewing.count({
        where: { listingId: l.id, status: "COMPLETED" },
      });
      if (!viewings) return;

      const offers = rows.filter((r) => r.verdict === "OFFERING").length;
      const daysListed = Math.floor((Date.now() - l.createdAt.getTime()) / 86_400_000);

      const report = compose({
        propertyTitle: l.title, viewings, offers, rows, daysListed,
      });

      await crossTenant("sweep").vendorReport.create({
        data: {
          orgId: l.orgId, listingId: l.id,
          periodFrom: since, periodTo: new Date(),
          viewings, offers,
          summary: { headline: report.headline, body: report.body } as never,
          priceSignal: report.signal.kind === "none" ? null : report.signal.message,
        },
      });

      composed += 1;
      if (report.recommendation) withSignal += 1;
    });
    return { listings: listings.length, composed, withSignal };
  }),

  /**
   * Trials that have reached their last day. Daily.
   *
   * Without this every trial runs forever and the product earns nothing
   * — which was the state of it until today. A card on file converts to
   * ACTIVE; no card stops the assistant and keeps every lead.
   */
  "billing.trials": () => run("billing.trials", async () => sweepTrials()),

  /**
   * Offers past their expiry. Hourly.
   *
   * An agent chasing an acceptance on an offer that lapsed on Tuesday is
   * an agent about to be embarrassed in front of a buyer. The record
   * changes and the agent is told — not silently either way.
   */
  "offers.expire": () => run("offers.expire", async () => sweepExpired()),

  /**
   * Visa-renewal nudges. Daily.
   *
   * Almost the fifth module in this codebase built with nothing that
   * starts it — caught this time by checking before calling it done
   * rather than after.
   */
  "matching.visa-nudge": () => run("matching.visa-nudge", async () => sweepVisaNudges()),

  /**
   * Mailboxes. Every fifteen minutes.
   *
   * Email is not WhatsApp — nobody expects it in seconds, and a tighter
   * loop only burns provider quota for no perceptible gain.
   */
  "email.sync": () => run("email.sync", async () => sweepMailboxes()),

  /** Personal follow-ups that have come due. Every ten minutes — an
   *  agent who asked to be reminded at ten wants it at ten. */
  "followups.due": () => run("followups.due", async () => sendDueFollowUps()),

  /**
   * Score every lead and decide what each agent should do about it.
   *
   * Nightly, and early — an agent opening the app at seven wants an
   * answer already computed, not four hundred leads being evaluated
   * while they wait. Scoring in the request path is how an intelligence
   * layer becomes the reason a product feels slow.
   */
  "intelligence.sweep": () => run("intelligence.sweep", async () => sweepIntelligence()),

  /** Rate-limit hits older than two days. Daily. */
  "ratelimit.sweep": () => run("ratelimit.sweep", async () => sweepRateLimits()),

  /** Erasure of long-deleted records. Daily. */
  "privacy.retention": () => run("privacy.retention", async () =>
    retentionSweep()
  ),

  /**
   * Somebody asked us for a call and nobody was told.
   *
   * The enquiry is durable now, which fixes losing it — but a row
   * nobody reads is the shape this codebase has found twelve times, and
   * a `WebsiteLead` with a null `emailedAt` is exactly that unless
   * something goes looking. **This is the "what closes it?" half.**
   *
   * An hour is deliberate. Faster and a transient Resend blip pages
   * somebody at 3am for something that has already retried; slower and
   * a brokerage owner who asked for a call on Monday morning is still
   * waiting on Monday afternoon, which is the whole business.
   */
  "website.undelivered": () => run("website.undelivered", async () => {
    const stale = await crossTenant("sweep").websiteLead.findMany({
      where: {
        emailedAt: null,
        createdAt: { lt: new Date(Date.now() - 60 * 60_000) },
      },
      select: { id: true, kind: true, email: true, createdAt: true, emailError: true },
      orderBy: { createdAt: "asc" },
      take: 50,
    });
    if (stale.length === 0) return { undelivered: 0 };

    await deliver({
      key: "website.undelivered",
      severity: "PAGE",
      title: `${stale.length} website enquir${stale.length === 1 ? "y" : "ies"} were never delivered`,
      detail:
        `The row exists and the email did not go. These people asked to be ` +
        `contacted and nobody has been told.\n\n` +
        stale.map((s: (typeof stale)[number]) => `  ${s.createdAt.toISOString()}  ${s.kind}  ${s.email}` +
          (s.emailError ? `  — ${s.emailError.slice(0, 120)}` : "")).join("\n"),
      runbook: "OPERATIONS.md — undelivered website enquiry",
    });
    return { undelivered: stale.length };
  }),
} as const;

export type JobName = keyof typeof JOBS;
