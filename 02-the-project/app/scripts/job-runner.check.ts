import { crossTenant } from "../src/server/db/client";
import { run } from "../src/server/jobs/runner";
import { fatal } from "./fatal";

/**
 * One run of a job at a time — and every run when it is its turn.
 *
 * The runner guarded each job with a session-level advisory lock, taken
 * on one pooled connection and released on whichever the pool handed
 * out next. After any run that opened more than one connection — every
 * real sweep does — the release missed and every later run of that job
 * in the process came back `skipped`. Measured: one run, then five
 * skips. The reminder sweep, the notification sweep and the health
 * evaluation would each have run once per warm instance and then
 * stopped, reporting that they were "already running".
 *
 * A lock has three jobs and this proves all three, because fixing the
 * first by weakening the second is the easy mistake.
 *
 *     npm run check:job-runner
 */
const db = crossTenant("sweep");
const JOB = "job-runner.check";

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
/** What a real sweep does: several queries at once, so the pool opens more connections. */
const busy = () => Promise.all(Array.from({ length: 8 }, () => db.$queryRaw`SELECT pg_sleep(0.05)::text AS s`));

async function cleanup() {
  await db.jobLease.deleteMany({ where: { job: { startsWith: JOB } } });
  await db.jobRun.deleteMany({ where: { job: { startsWith: JOB } } });
}

async function main() {
  console.log("\nOne run at a time, and every run in turn\n");
  await cleanup();

  {
    const results = [];
    for (let i = 0; i < 6; i++) results.push(await run(JOB, async () => { await busy(); return { i }; }));
    const skipped = results.filter((r) => "skipped" in r).length;
    ok("six runs in a row, each using several connections, all run", skipped === 0, `${skipped} skipped`);
    ok("and nothing is left held afterwards", (await db.jobLease.count({ where: { job: JOB } })) === 0);
  }

  {
    // Two at once: the thing the lock exists for. Both started before
    // either finishes.
    const [a, b] = await Promise.all([
      run(`${JOB}.pair`, async () => { await busy(); await busy(); return { who: "a" }; }),
      run(`${JOB}.pair`, async () => { await busy(); await busy(); return { who: "b" }; }),
    ]);
    const ran = [a, b].filter((r) => !("skipped" in r)).length;
    ok("two runs started together: exactly one goes ahead", ran === 1, `${ran} ran`);
  }

  {
    let threw = false;
    try { await run(`${JOB}.fails`, async () => { await busy(); throw new Error("deliberate"); }); }
    catch { threw = true; }
    const after = await run(`${JOB}.fails`, async () => ({ recovered: true }));
    ok("a run that fails gives the job back", threw && !("skipped" in after));
  }

  {
    // A process that died mid-run leaves its lease behind. It must block
    // until it expires, then stop blocking — neither for ever nor never.
    await db.jobLease.create({ data: { job: `${JOB}.dead`, holder: "gone:1", until: new Date(Date.now() + 60_000) } });
    const live = await run(`${JOB}.dead`, async () => ({ ran: true }));
    ok("somebody else's live lease is respected", "skipped" in live);
    await db.jobLease.update({ where: { job: `${JOB}.dead` }, data: { until: new Date(Date.now() - 1_000) } });
    const expired = await run(`${JOB}.dead`, async () => ({ ran: true }));
    ok("an expired one is taken over", !("skipped" in expired));
  }

  await cleanup();
  console.log(bad ? `\n${bad} FAILED\n` : "\nevery job runs when it is due, and never twice at once.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
