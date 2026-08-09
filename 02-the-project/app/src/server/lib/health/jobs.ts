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
  "scheduling.expire-holds": 10,
  "reminders.viewings": 60,
  "portals.silence": 60,
  "support.expire-grants": 60,
  "feedback.ask": 60,
  "billing.overdue": 24 * 60,
  "billing.invoices": 24 * 60,
  "billing.reconcile": 24 * 60,
  "billing.trials": 24 * 60,
  "ratelimit.sweep": 24 * 60,
  "offers.expire": 60,
  "email.sync": 30,
  "followups.due": 20,
  "matching.visa-nudge": 24 * 60,
  "intelligence.sweep": 24 * 60,
  "privacy.retention": 24 * 60,
  "listings.permit-expiry": 24 * 60,
  "documents.expiry": 24 * 60,
  "deals.slippage": 24 * 60,
  "matching.new-listings": 24 * 60,
  "plans.advance": 24 * 60,
  "feedback.vendor-report": 7 * 24 * 60,
};
export async function jobsHealth() {
  const out: {
    job: string;
    lastSuccess: Date | null;
    overdueBy: number | null;
    state: "ok" | "overdue" | "never run";
  }[] = [];

  for (const [job, everyMins] of Object.entries(EXPECTED_EVERY_MINUTES)) {
    const last = await crossTenant("sweep").jobRun.findFirst({
      where: { job, state: "SUCCEEDED" },
      orderBy: { startedAt: "desc" },
      select: { startedAt: true },
    });

    if (!last) {
      out.push({ job, lastSuccess: null, overdueBy: null, state: "never run" });
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
