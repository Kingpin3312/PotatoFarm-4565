import { randomUUID } from "node:crypto";
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
 *   1. **A lease row per job**, so only one run of a job executes at a
 *      time across every instance. No Redis, no new dependency — the
 *      database is already there and already the thing everything else
 *      agrees on.
 *
 *      It was a session-level advisory lock, which belongs to the
 *      *connection* that took it. The lock was taken on one pooled
 *      connection and released on whichever the pool handed out next;
 *      after any run that opened more than one connection — every real
 *      sweep does — the release missed, the lock stayed held, and every
 *      later run of that job in the process came back `skipped`.
 *      Measured: one run, then five skips in a row. Behind the
 *      transaction-mode pooler DEPLOY.md requires, lock and release
 *      would almost never share a connection. A row is taken and given
 *      back by single statements that work on any connection, and
 *      expires by itself if the process holding it dies.
 *   2. **Every job is independently idempotent.** The lock is not trusted
 *      on its own, because a lock is a runtime guarantee and money is not
 *      a runtime concern. Invoices are keyed on period, reminders on a
 *      sent-at timestamp, notifications on a unique constraint.
 */

/**
 * Longer than any run is allowed to take (`maxDuration` is 300s), so a
 * live run is never overtaken; short enough that a run killed mid-way
 * does not hold its job off for long.
 */
const LEASE_MINUTES = 15;

/** Take the job, or learn that somebody else has it. One statement. */
async function acquire(job: string, holder: string): Promise<boolean> {
  const rows = await crossTenant("sweep").$queryRaw<{ holder: string }[]>`
    INSERT INTO "JobLease" ("job", "holder", "until", "acquiredAt")
    VALUES (${job}, ${holder}, now() + make_interval(mins => ${LEASE_MINUTES}::int), now())
    ON CONFLICT ("job") DO UPDATE
      SET "holder" = EXCLUDED."holder", "until" = EXCLUDED."until", "acquiredAt" = now()
      WHERE "JobLease"."until" < now()
    RETURNING "holder"`;
  return rows[0]?.holder === holder;
}

/** Give it back — only if it is still ours. */
async function release(job: string, holder: string) {
  await crossTenant("sweep").$executeRaw`
    DELETE FROM "JobLease" WHERE "job" = ${job} AND "holder" = ${holder}`;
}

export type JobResult = Record<string, unknown>;

export async function run(job: string, fn: () => Promise<JobResult>) {
  // Returns at once rather than queueing. A second run should skip, not
  // wait — waiting means two runs back to back, which for a sweep is the
  // same as running twice.
  const holder = `${process.pid}:${randomUUID()}`;
  const locked = await acquire(job, holder);

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
    // is released in `finally` first, or the retry would skip until the lease expires.
    throw err;
  } finally {
    await release(job, holder);
  }
}

