import { crossTenant } from "@/server/db/client";
import { log, report } from "@/lib/log";

/**
 * The job runner.
 *
 * By this point the codebase has accumulated a dozen functions whose
 * comments say "runs nightly" or "runs every few minutes", and none of
 * them ran. This is what runs them.
 *
 * The hazard that makes it worth writing carefully: **on serverless, a
 * cron fires once but the platform may retry, and instances scale.** Two
 * concurrent runs of the reminder sweep send every reminder twice. Two
 * concurrent runs of invoice generation bill every customer twice, and
 * that one does not get forgiven.
 *
 * Two defences, deliberately overlapping:
 *
 *   1. **A Postgres advisory lock**, so only one run of a job executes at
 *      a time across every instance. No Redis, no new dependency — the
 *      database is already there and already the thing everything else
 *      agrees on.
 *   2. **Every job is independently idempotent.** The lock is not trusted
 *      on its own, because a lock is a runtime guarantee and money is not
 *      a runtime concern. Invoices are keyed on period, reminders on a
 *      sent-at timestamp, notifications on a unique constraint.
 */

/** Stable 64-bit key per job name, for the advisory lock. */
function lockKey(job: string) {
  let h = 0n;
  for (const c of job) h = (h * 31n + BigInt(c.charCodeAt(0))) % 9_223_372_036_854_775_807n;
  return h;
}

export type JobResult = Record<string, unknown>;

export async function run(job: string, fn: () => Promise<JobResult>) {
  const key = lockKey(job);

  // pg_try_advisory_lock returns immediately rather than queueing. A
  // second run should skip, not wait — waiting means two runs happen back
  // to back, which for a sweep is the same as running twice.
  const [row] = await crossTenant("sweep").$queryRaw<{ locked: boolean }[]>`
    SELECT pg_try_advisory_lock(${key}::bigint) AS locked
  `;
  // A raw query is typed by assertion, so the compiler cannot know the
  // row is there. Treating an absent row as "did not get the lock" is
  // the safe reading: skipping a sweep costs one cycle, running two at
  // once is what the lock exists to prevent.
  const locked = row?.locked ?? false;

  if (!locked) {
    log.info("job skipped, already running", {}, { job });
    await crossTenant("sweep").jobRun.create({ data: { job, state: "SKIPPED", finishedAt: new Date() } });
    return { skipped: true };
  }

  const started = Date.now();
  const record = await crossTenant("sweep").jobRun.create({ data: { job, state: "RUNNING" } });

  try {
    const result = await fn();
    await crossTenant("sweep").jobRun.update({
      where: { id: record.id },
      data: {
        state: "SUCCEEDED", finishedAt: new Date(),
        durationMs: Date.now() - started, result: result as never,
      },
    });
    log.info("job finished", {}, { job, ms: Date.now() - started, ...result });
    return { ok: true, ...result };
  } catch (err) {
    await crossTenant("sweep").jobRun.update({
      where: { id: record.id },
      data: {
        state: "FAILED", finishedAt: new Date(),
        durationMs: Date.now() - started,
        error: String(err).slice(0, 500),
      },
    });
    report(err, {}, { job });
    // Rethrown so the platform's own retry can take over — but the lock
    // is released in `finally` first, or the retry would skip forever.
    throw err;
  } finally {
    await crossTenant("sweep").$queryRaw`SELECT pg_advisory_unlock(${key}::bigint)`;
  }
}

