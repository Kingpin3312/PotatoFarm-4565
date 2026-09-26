import { crossTenant } from "@/server/db/client";


/**
 * Whether the scheduled jobs are actually running.
 *
 * This lived in `jobs/runner.ts` and created a cycle:
 * `jobs -> billing -> health -> jobs`. A cycle is not merely untidy —
 * it makes all three modules impossible to load or test in isolation,
 * and the order they initialise in becomes load-bearing by accident.
 *
 * The fix is ownership rather than a shim. **Jobs owns running things.
 * Health owns judging whether something is working.** Every other
 * absence check in this product lives here — a silent portal feed, a
 * stopped assistant, a dead push token — and a cron that has stopped
 * firing is exactly the same shape of failure.
 *
 * The schedule lives here rather than in jobs, because health is its only
 * consumer and jobs exporting it was the entire cause of the cycle. It is
 * checked against vercel.json by crm-audit.py, so the two cannot drift.
 */
const EXPECTED_EVERY_MINUTES: Record<string, number> = {
  "health.evaluate": 5,
  "notify.sweep": 5,
  // If this stops, every notification held during somebody's quiet
  // hours stays held for ever — which looks exactly like a quiet
  // week to the agent it is happening to.
  "notify.digest": 60,
  "scheduling.expire-holds": 10,
  // If this stops, every listing a brokerage publishes sits in the queue
  // showing "pending" and reaches no portal. Nothing errors; properties
  // simply never appear, which is indistinguishable from a quiet market.
  "listings.publish-queue": 10,
  "reminders.viewings": 60,
  "portals.silence": 60,
  "support.expire-grants": 60,
  "feedback.ask": 60,
  "billing.overdue": 24 * 60,
  "billing.invoices": 24 * 60,
  "billing.reconcile": 24 * 60,
  "billing.trials": 24 * 60,
  // If this stops, nobody is told when VAT registration becomes
  // compulsory — and the VAT not charged after that is PotatoFarm's bill.
  "billing.vat-threshold": 24 * 60,
  "ratelimit.sweep": 24 * 60,
  "offers.expire": 60,
  "email.sync": 30,
  "followups.due": 20,
  "matching.visa-nudge": 24 * 60,
  "tenancy.renewals": 24 * 60,
  "intelligence.sweep": 24 * 60,
  "privacy.retention": 24 * 60,
  "listings.permit-expiry": 24 * 60,
  "documents.expiry": 24 * 60,
  // Daily. Worth stating why it is here rather than only in the cron
  // list: this is the job that screens a due diligence file nobody
  // screened at onboarding, and its failure is completely silent — the
  // compliance queue simply stops growing, which looks identical to a
  // week with no new business.
  "aml.screening": 24 * 60,
  "deals.slippage": 24 * 60,
  "plans.advance": 24 * 60,
  // Daily now: each owner has their own report day.
  "feedback.vendor-report": 24 * 60,
  // If this stops, an enquiry that was never emailed stops being
  // reported — and the alarm that exists precisely because nobody was
  // told goes quiet, which is the failure it was written to catch
  // wearing a different hat.
  "website.undelivered": 60,
};
export async function jobsHealth() {
  const out: {
    job: string;
    lastSuccess: Date | null;
    overdueBy: number | null;
    state: "ok" | "overdue" | "never run";
  }[] = [];

  /**
   * How long this deployment has been alive, as the baseline a
   * never-run job is measured against. The oldest brokerage is the
   * closest thing to "since when should this have happened".
   */
  const oldest = await crossTenant("sweep").organisation.findFirst({
    // `deletedAt: null`, because the question is how long this
    // deployment has been serving somebody. A closed brokerage does not
    // establish that, and `erasure.py` is right to insist the filter is
    // written rather than assumed.
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" }, select: { createdAt: true },
  });
  const liveFor = oldest ? oldest.createdAt.getTime() : null;

  for (const [job, everyMins] of Object.entries(EXPECTED_EVERY_MINUTES)) {
    const last = await crossTenant("sweep").jobRun.findFirst({
      where: { job, state: "SUCCEEDED" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });

    if (!last) {
      /**
       * Never run, and how long it has been never running.
       *
       * `overdueBy` was null here, and the alert sweep filters on
       * `state === "overdue"` — a state only the branch below can
       * produce, and only for a job that has succeeded at least once.
       * So **a job that has never worked raised no alert, at any
       * severity, ever**: the value was computed every five minutes
       * and discarded. CLAUDE.md records the mirror of this in
       * `severityFor` — there a branch could never execute, here a
       * value could never be consumed.
       *
       * The case that matters is not a typo in one job name. It is
       * `CRON_SECRET` wrong in production: every invocation of every
       * job is refused, no `JobRun` row is ever written, all 28 report
       * "never run", and the alerting stays perfectly quiet — while
       * the heartbeat keeps firing, because `health.evaluate` is the
       * one job that runs in-process.
       *
       * Measured against how long this deployment has existed rather
       * than a fixed date, so a genuinely fresh install does not
       * alarm on its weekly jobs before they are due.
       */
      const liveMins = liveFor === null ? 0 : (Date.now() - liveFor) / 60_000;
      out.push({
        job,
        lastSuccess: null,
        overdueBy: liveMins > everyMins * 3 ? Math.round(liveMins) : null,
        state: "never run",
      });
      continue;
    }

    const sinceMins = (Date.now() - last.startedAt.getTime()) / 60_000;
    // Three intervals before complaining. One missed run is a blip;
    // three in a row is a cron that has stopped.
    const overdue = sinceMins > everyMins * 3;
    out.push({
      job,
      lastSuccess: last.startedAt,
      overdueBy: overdue ? Math.round(sinceMins - everyMins) : null,
      state: overdue ? "overdue" : "ok",
    });
  }

  return out;
}
