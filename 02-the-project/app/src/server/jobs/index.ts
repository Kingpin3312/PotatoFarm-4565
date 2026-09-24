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
import { best, type Candidate } from "@/server/lib/matching/score";
import { message } from "@/server/lib/matching/outreach";
import { groupForNotification } from "@/server/lib/documents/expiry";
import { shouldAdvance, scheduleNext, taskForStep } from "@/server/lib/plans/run";
import { askAt, question } from "@/server/lib/feedback/collect";
import { compose, vendorsDueToday, channelFor } from "@/server/lib/feedback/report";
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

  /*
   * `matching.new-listings` was here, and was retired rather than fixed.
   *
   * It matched each new listing against live requirements, ran the
   * outreach rules, and then — beneath a comment saying "sending happens
   * through the normal outbound path" — sent nothing. It wrote a log
   * line, stamped `Lead.lastOutreachAt` and counted the buyer as
   * `messaged`. Three consequences, all silent:
   *
   *   - no buyer ever received a new-listing alert;
   *   - the Buyers screen reads `lastOutreachAt` through `decide()`, so
   *     an agent was told a buyer had been "messaged 3 days ago" by a
   *     message that never existed, and held off contacting them;
   *   - a `return` inside the requirement loop ended the whole brokerage
   *     at the first buyer who failed a gate, so most were never
   *     considered at all.
   *
   * It was not given a sender because sending is not allowed.
   * `intelligence/autonomy.ts` caps every customer-facing action at
   * CONFIRM — a person presses send, at every mode including Autopilot —
   * and the settings screen promises owners exactly that. The allowed
   * version already exists: `intelligence.sweep` runs the matcher over
   * the live book every night and puts "Send Priya the one that fits"
   * on the agent's list as a SEND_PROPERTY recommendation, needing their
   * yes. A second path that decides by itself is the thing the floor
   * exists to prevent, and this one only appeared to work.
   */

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
      // Oldest first, so a backlog past the batch is worked through
      // rather than the same five hundred read every run.
      orderBy: { nextDueAt: "asc" },
      take: 500,
      include: {
        plan: { include: { steps: { orderBy: { order: "asc" } } } },
      },
    });

    let acted = 0, quiet = 0, unassigned = 0, paused = 0, finished = 0;
    // The live book, once per brokerage. CHECK_MATCHES is the only
    // step that needs it and a sweep can hold a few hundred subscriptions.
    const books = new Map<string, Candidate[]>();

    const r = await each(due, (sub) => `plan sub ${sub.id}`, async (sub) => {
      const lead = await crossTenant("sweep").lead.findUnique({
        where: { id: sub.leadId },
        select: {
          name: true, phone: true, status: true, optedOutOfOutreach: true,
          assignedToId: true, deletedAt: true,
          assignedTo: { select: { name: true } },
          conversation: { select: { lastInboundAt: true } },
        },
      });
      /**
       * Somebody removed from the book comes off the plan.
       *
       * This returned and left the plan RUNNING and due, so it was read
       * again every run, for ever — and enough of them would fill the
       * batch above and starve everybody else's plans.
       */
      if (!lead || lead.deletedAt) {
        await crossTenant("sweep").planSubscription.update({
          where: { id: sub.id },
          data: { state: "STOPPED", finishedAt: new Date(), endedReason: "removed from the book" },
        });
        finished++;
        return;
      }

      const call = shouldAdvance({
        sub: {
          currentStep: sub.currentStep,
          state: sub.state,
          startedAt: sub.startedAt,
          resumedAt: sub.resumedAt,
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

      /**
       * Nobody to hand it to, so the step is **not** taken.
       *
       * Every step ends with a person doing something, and a step taken
       * with nobody to do it is the bug this replaced: consumed, logged,
       * and never happened. Left due, it is retried tomorrow, and the
       * count in this job's result says why it is stuck.
       */
      if (!lead.assignedToId) { unassigned++; return; }

      const who = lead.name?.split(" ")[0] || lead.phone;
      let match: { title: string; draft: string } | null = null;

      if (call.step.action === "CHECK_MATCHES") {
        let book = books.get(sub.orgId);
        if (!book) {
          const rows = await crossTenant("sweep").listing.findMany({
            where: { orgId: sub.orgId, status: { in: ["AVAILABLE", "UNDER_OFFER"] }, deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 500,
            select: {
              id: true, reference: true, title: true, priceFils: true,
              bedrooms: true, community: true, purpose: true, createdAt: true,
            },
          });
          book = rows.map((l) => ({
            id: l.id, reference: l.reference, title: l.title, priceFils: l.priceFils,
            bedrooms: l.bedrooms, community: l.community,
            purpose: l.purpose as "SALE" | "RENT", listedAt: l.createdAt,
          }));
          books.set(sub.orgId, book);
        }
        const wants = await crossTenant("sweep").requirement.findMany({
          where: { orgId: sub.orgId, leadId: sub.leadId, active: true },
          select: {
            budgetMinFils: true, budgetMaxFils: true, bedroomsMin: true,
            communities: true, intent: true, purpose: true,
          },
        });
        let top: ReturnType<typeof best> = null;
        for (const r of wants) {
          const m = best(
            {
              budgetMinFils: r.budgetMinFils, budgetMaxFils: r.budgetMaxFils,
              bedrooms: r.bedroomsMin, communities: r.communities,
              intent: r.intent === "RENT" ? "RENT"
                    : r.intent === "BUY_TO_INVEST" ? "BUY_TO_INVEST"
                    : r.intent === "BUY_TO_LIVE" ? "BUY_TO_LIVE" : null,
            },
            book.filter((c) => c.purpose === r.purpose),
          );
          if (m && (!top || m.score > top.score)) top = m;
        }
        if (top) {
          match = {
            title: top.listing.title,
            draft: message({
              firstName: lead.name?.split(" ")[0] ?? null,
              match: top,
              agentName: lead.assignedTo?.name ?? null,
            }),
          };
        }
      }

      const task = taskForStep({ step: call.step, planName: sub.plan.name, who, match });
      const next = scheduleNext(sub.plan.steps, call.step.order, new Date());

      /**
       * The task and the step, together or not at all.
       *
       * Advancing first and failing the create is the old bug in a new
       * place: a step recorded as taken that nobody was asked to take.
       *
       * And only if nobody moved it meanwhile. An agent can stop or pause
       * a plan now, and an unconditional write here would have restarted
       * it — or marked a stopped plan "sequence finished" — with a task
       * for a step they had just called off.
       */
      const took = await crossTenant("sweep").$transaction(async (tx) => {
        const moved = await tx.planSubscription.updateMany({
          where: { id: sub.id, state: "RUNNING", currentStep: sub.currentStep },
          data: {
            currentStep: call.step.order,
            nextDueAt: next?.dueAt ?? null,
            ...(next ? {} : { state: "COMPLETED", finishedAt: new Date(), endedReason: "sequence finished" }),
          },
        });
        if (moved.count !== 1) return false;
        if (task) {
          await tx.followUp.create({
            data: {
              orgId: sub.orgId, agentId: lead.assignedToId!, leadId: sub.leadId,
              title: task.title, body: task.body, dueAt: new Date(),
            },
          });
        }
        return true;
      });
      if (!took) return;
      task ? acted++ : quiet++;
    });

    // `failed` in the result: a step whose task could not be written is
    // left due and retried, and without the count nobody would know.
    return { due: due.length, acted, quiet, unassigned, paused, finished, failed: r.failed };
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
      select: {
        id: true, orgId: true, scheduledAt: true, durationMins: true,
        leadId: true, listingId: true, agentId: true,
        lead: { select: { name: true, phone: true, assignedToId: true, deletedAt: true } },
        listing: { select: { title: true } },
      },
      take: 200,
    });

    let prompted = 0, unassigned = 0;
    const r = await each(done, (v) => `viewing ${v.id}`, async (v) => {
      if (v.lead.deletedAt) return;

      /**
       * A row means the agent has been asked to ask. `askedAt` stays
       * empty until the buyer actually is — see below.
       */
      const already = await crossTenant("sweep").viewingFeedback.findUnique({
        where: { viewingId: v.id },
        select: { id: true },
      });
      if (already) return;

      const due = askAt(new Date(v.scheduledAt.getTime() + v.durationMins * 60_000));
      if (due > new Date()) return;

      // Whoever showed it, or failing that whoever has the lead.
      const agentId = v.agentId ?? v.lead.assignedToId;
      if (!agentId) { unassigned++; return; }

      /**
       * The question goes to the agent, ready to send, not to the buyer.
       *
       * This stamped `ViewingFeedback.askedAt` and counted the viewing as
       * `asked` without sending anything — no sender was ever wired — so
       * every buyer was recorded as asked and none was. Nothing wrote an
       * answer either, so the weekly vendor report was composed from
       * feedback that was never collected; the task now carries the
       * viewing, and the agent records the answer on it
       * (`viewings.feedback`), which closes it.
       *
       * It is not given a sender because `intelligence/autonomy.ts` stops
       * every message to a client at CONFIRM: a person presses send. So
       * the agent gets the one question `collect.ts` drafts, two hours
       * after the viewing, and sends it themselves or asks on the phone.
       *
       * `listingId` is written now. It never was, and the vendor report
       * finds feedback by listing — so an answer, had one ever been
       * recorded, would not have reached the owner's report either.
       */
      const title = v.listing?.title ?? "the property";
      const firstName = v.lead.name?.split(" ")[0] ?? null;
      const q = question(title, firstName);

      await crossTenant("sweep").$transaction([
        crossTenant("sweep").viewingFeedback.create({
          data: { orgId: v.orgId, viewingId: v.id, leadId: v.leadId, listingId: v.listingId },
        }),
        crossTenant("sweep").followUp.create({
          data: {
            // The viewing, so recording the answer closes this task.
            orgId: v.orgId, agentId, leadId: v.leadId, viewingId: v.id,
            title: `Ask ${firstName ?? v.lead.phone} what they thought of ${title}`,
            body:
              `One question gets an honest answer two hours after a viewing. A draft:\n\n` +
              `${q.body}\n` + q.options.map((o) => `• ${o.label}`).join("\n"),
            dueAt: new Date(),
          },
        }),
      ]);
      prompted += 1;
    });
    return { completed: done.length, prompted, unassigned, failed: r.failed };
  }),

  /**
   * Vendor reports. Weekly, Monday morning.
   *
   * Vendor communication is the most common complaint about estate agents
   * in every market anybody has measured, and the reason is that agents
   * have nothing to say. This gives them something.
   */
  "feedback.vendor-report": () => run("feedback.vendor-report", async () => {
    /**
     * ## What this did, and why it changed
     *
     * It ran on Mondays, composed a report for every live listing with a
     * viewing, wrote a `VendorReport` row — and **nothing read the row or
     * sent it**. `sentAt` was never set. Every owner's report was written
     * to a table and left there.
     *
     * It also ignored everything the owner had asked for.
     * `vendorsDueToday()` — reports off, offers only, which day — was
     * written for exactly this and had no caller; and the default report
     * day is **Thursday** while the job ran on Monday, so even a correct
     * send would never have reached the default owner. And it skipped a
     * listing with no viewings, beneath a module that says "nothing
     * happened this week is not a reason to skip".
     *
     * Now it runs daily, takes the owners due today, and puts each one's
     * report on an agent's list, in the channel the owner chose: a
     * message to an owner is a message to a client, and
     * `intelligence/autonomy.ts` stops those at a person pressing send.
     *
     * **Which agent**: the one who looks after the property
     * (`Listing.agentId`). For a listing nobody has been given yet it
     * falls back to whoever showed one of the owner's properties most
     * recently, else whoever handled an offer on one, else the
     * brokerage's owner — and the task says which, so a guess is
     * visible rather than silent.
     */
    const today = new Date();
    const since = new Date(today.getTime() - 6 * 86_400_000);
    const orgs = await crossTenant("sweep").organisation.findMany({
      where: { deletedAt: null }, select: { id: true },
    });

    let due = 0, prepared = 0, unassigned = 0;
    const r = await each(orgs, (o) => `org ${o.id}`, async (o) => {
      for (const v of await vendorsDueToday(o.id, today)) {
        due += 1;
        const listings = await crossTenant("sweep").listing.findMany({
          where: { orgId: o.id, vendorId: v.id, status: { in: ["AVAILABLE", "UNDER_OFFER"] }, deletedAt: null },
          select: { id: true, title: true, createdAt: true, agentId: true },
        });
        if (!listings.length) continue;

        // Once a week per property, whatever day it lands on.
        const recent = await crossTenant("sweep").vendorReport.findFirst({
          where: { orgId: o.id, listingId: { in: listings.map((l) => l.id) }, createdAt: { gte: since } },
          select: { id: true },
        });
        if (recent) continue;

        const ids = listings.map((l) => l.id);
        // The listing agent first. Everything after it is a guess, kept
        // for listings nobody has been given yet.
        const listingAgent = listings.find((l) => l.agentId)?.agentId ?? null;
        const lastViewing = listingAgent ? null : await crossTenant("sweep").viewing.findFirst({
          where: { orgId: o.id, listingId: { in: ids }, agentId: { not: null } },
          orderBy: { scheduledAt: "desc" }, select: { agentId: true },
        });
        const lastOffer = listingAgent || lastViewing ? null : await crossTenant("sweep").offer.findFirst({
          where: { orgId: o.id, listingId: { in: ids }, agentId: { not: null } },
          orderBy: { submittedAt: "desc" }, select: { agentId: true },
        });
        const owner = listingAgent || lastViewing || lastOffer ? null : await crossTenant("sweep").membership.findFirst({
          where: { orgId: o.id, role: "OWNER" }, select: { userId: true },
        });
        const agentId = listingAgent ?? lastViewing?.agentId ?? lastOffer?.agentId ?? owner?.userId ?? null;
        const why = listingAgent ? "you look after their property"
          : lastViewing ? "nobody has been given their property, and you showed it most recently"
          : lastOffer ? "you handled the latest offer on one of their properties"
          : "nobody has shown their properties yet, so it came to the owner of the brokerage";
        if (!agentId) { unassigned += 1; continue; }

        const reports = [];
        for (const l of listings) {
          const [rows, viewings, offers] = await Promise.all([
            crossTenant("sweep").viewingFeedback.findMany({
              where: { listingId: l.id, answeredAt: { not: null } },
              select: { verdict: true, reasons: true },
            }),
            crossTenant("sweep").viewing.count({ where: { listingId: l.id, status: "COMPLETED" } }),
            // Real offers, not feedback verdicts. "I'd like to make an
            // offer" is an intention; an offer is recorded on its own model.
            crossTenant("sweep").offer.count({ where: { listingId: l.id } }),
          ]);
          const daysListed = Math.floor((today.getTime() - l.createdAt.getTime()) / 86_400_000);
          reports.push({ listing: l, viewings, offers, report: compose({ propertyTitle: l.title, viewings, offers, rows, daysListed }) });
        }

        const how = channelFor(v.prefers);
        const verb = how === "call" ? `Call ${v.name}` : `Send ${v.name}`;
        const via = how === "email" ? " by email" : how === "whatsapp" ? " on WhatsApp" : "";
        await crossTenant("sweep").$transaction([
          ...reports.map((x) => crossTenant("sweep").vendorReport.create({
            data: {
              orgId: o.id, listingId: x.listing.id,
              periodFrom: since, periodTo: today,
              viewings: x.viewings, offers: x.offers,
              summary: { headline: x.report.headline, body: x.report.body } as never,
              priceSignal: x.report.signal.kind === "none" ? null : x.report.signal.message,
            },
          })),
          crossTenant("sweep").followUp.create({
            data: {
              orgId: o.id, agentId,
              title: how === "call" ? `${verb} with this week's update` : `${verb} this week's update${via}`,
              body:
                `It's their report day. It came to you because ${why}.\n\n` +
                reports.map((x) => `${x.report.headline}\n${x.report.body}` +
                  (x.report.recommendation ? `\n\n${x.report.recommendation}` : "")).join("\n\n———\n\n"),
              dueAt: today,
            },
          }),
        ]);
        prepared += 1;
      }
    });
    return { due, prepared, unassigned, failed: r.failed };
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
