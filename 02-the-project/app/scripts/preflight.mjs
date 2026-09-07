import fs from "node:fs";
import path from "node:path";

/**
 * Is this deployment actually able to run in production?
 *
 * Not "does the code work" — twenty-two suites and fifteen audits
 * already answer that. This asks the different question the board audit
 * asked: **if it breaks at two in the morning, does anybody find out,
 * and can they get it back?**
 *
 * Two halves.
 *
 * **Static** checks run everywhere, including CI, and assert that the
 * wiring exists in the source. They are here because the alerting
 * system in this repository was complete, careful and ended in a
 * `log.warn` — the tenth time a finished module turned out to have
 * nothing on the end of it. A check that only looked at configuration
 * would have called that deployment healthy.
 *
 * **Environment** checks run only when `PREFLIGHT_ENV=1`, against the
 * variables of the environment being deployed. They are skipped rather
 * than failed otherwise, and the summary says which ones did not run —
 * because a laptop legitimately has no pager configured, and a check
 * that cannot tell the two situations apart teaches people to ignore it.
 *
 *     npm run check:preflight                  # static only
 *     PREFLIGHT_ENV=1 npm run check:preflight  # before a deploy
 */
const APP = path.resolve(import.meta.dirname, "..");
const read = (p) => { try { return fs.readFileSync(path.join(APP, p), "utf8"); } catch { return ""; } };

let bad = 0, skipped = 0;
const fails = [];
const ok = (label, pass, detail = "") => {
  console.log(`  ${pass ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!pass) { bad++; fails.push(`${label}${detail ? `  — ${detail}` : ""}`); }
};
const skip = (label, why) => { console.log(`  · ${label}  — skipped: ${why}`); skipped++; };

/* ------------------------------------------------------------------ */
console.log("\nPreflight\n");
console.log("Alerting is wired, not just written:");

const alertSrc = read("src/server/lib/health/alert.ts");
const deliverSrc = read("src/server/lib/health/deliver.ts");

/**
 * The specific regression being guarded.
 *
 * `notify()` classified every incident and then wrote it to stdout. If
 * somebody simplifies this back to a log line, the paging system
 * silently becomes a diary again.
 */
ok("notify() delivers an alert somewhere",
   /await\s+deliver\(/.test(alertSrc),
   /await\s+deliver\(/.test(alertSrc) ? "" : "notify() does not call deliver() — alerts go nowhere");

ok("deliver() makes an outbound request",
   /fetch\(/.test(deliverSrc),
   /fetch\(/.test(deliverSrc) ? "" : "deliver() never leaves the process");

ok("an undelivered alert is loud",
   /ALERT UNDELIVERED/.test(deliverSrc),
   "a silent no-op when unconfigured is the original bug, one layer out");

ok("the health sweep emits a heartbeat",
   /await\s+heartbeat\(\)/.test(alertSrc),
   /await\s+heartbeat\(\)/.test(alertSrc) ? "" : "nothing external can tell this process stopped");

/* ------------------------------------------------------------------ */
console.log("\nThe deploy target:");

if (process.env.PREFLIGHT_ENV !== "1") {
  skip("alert webhook",     "set PREFLIGHT_ENV=1 to check a real environment");
  skip("dead-man's switch", "set PREFLIGHT_ENV=1 to check a real environment");
  skip("connection pooler", "set PREFLIGHT_ENV=1 to check a real environment");
  skip("secrets",           "set PREFLIGHT_ENV=1 to check a real environment");
} else {
  const env = (k) => (process.env[k] ?? "").trim();

  ok("ALERT_WEBHOOK_URL is set", Boolean(env("ALERT_WEBHOOK_URL")),
     env("ALERT_WEBHOOK_URL") ? "" : "PAGE alerts will be written to a log nobody reads");

  ok("HEARTBEAT_URL is set", Boolean(env("HEARTBEAT_URL")),
     env("HEARTBEAT_URL") ? "" : "nothing outside this system can notice it has stopped");

  /**
   * The pooler, and why a bare connection string fails here.
   *
   * Serverless invocations plus 25 crons each open their own connection,
   * and `forOrg()` opens a transaction per query on top. Postgres runs
   * out of connections long before it runs out of capacity. The load
   * check measured the shape of it: the slowest first call is
   * connection setup, not query time.
   *
   * Recognising a pooler by its URL is imperfect, so this is deliberately
   * a substring test against the four ways it is normally spelled, and
   * it can be overridden with POOLER_CONFIRMED=1 by somebody who knows
   * their setup better than a regex does.
   */
  const url = env("DATABASE_URL");
  const direct = env("DATABASE_URL_DIRECT");
  const pooled = /pgbouncer=true|-pooler\.|pooler\.|accelerate|:6543/.test(url)
    || env("POOLER_CONFIRMED") === "1";
  ok("DATABASE_URL goes through a pooler", pooled,
     pooled ? "" : "a direct connection will exhaust Postgres on the first busy day");

  ok("DATABASE_URL_DIRECT bypasses the pooler",
     Boolean(direct) && direct !== url,
     !direct ? "unset — migrations need a direct connection"
       : direct === url ? "identical to DATABASE_URL; migrations cannot run through a pooler" : "");

  const key = env("SECRETS_KEY");
  let keyBytes = 0;
  try { keyBytes = Buffer.from(key, "base64").length; } catch { /* not base64 */ }
  ok("SECRETS_KEY is 32 bytes of base64", keyBytes === 32,
     key ? `got ${keyBytes} bytes` : "unset — no channel credential can be decrypted");

  ok("AUTH_SECRET is set", Boolean(env("AUTH_SECRET")),
     env("AUTH_SECRET") ? "" : "NextAuth refuses to start in production without it");

  /**
   * Development values are the ones that reach production, because they
   * are the ones already typed into something.
   */
  const devish = ["AUTH_SECRET", "SECRETS_KEY", "CRON_SECRET", "WHATSAPP_APP_SECRET"]
    .filter((k) => /dev-only|ci-only|changeme|placeholder|example/i.test(env(k)));
  ok("no development placeholders in production secrets", devish.length === 0,
     devish.length ? `${devish.join(", ")} still carries a development value` : "");
}

/* ------------------------------------------------------------------ */
console.log("\nPlatform limits:");

let crons = 0;
try { crons = (JSON.parse(read("vercel.json")).crons ?? []).length; } catch { /* none */ }
const maxDurations = [...read("src/app/api/cron/[job]/route.ts").matchAll(/maxDuration\s*=\s*(\d+)/g)]
  .map((m) => Number(m[1]));
const longest = maxDurations.length ? Math.max(...maxDurations) : 0;

/**
 * Vercel's Hobby plan allows two cron jobs at daily granularity and caps
 * a function at 60 seconds. This project has twenty-five crons, several
 * hourly, and a 300-second sweep. Deploying to Hobby does not fail
 * loudly — the crons simply do not run, which for a product built
 * around nightly sweeps is the quietest possible outage.
 */
const needsPro = crons > 2 || longest > 60;
if (needsPro) {
  const declared = (process.env.VERCEL_PLAN ?? "").trim().toLowerCase();
  const acknowledged = ["pro", "enterprise"].includes(declared);
  if (process.env.PREFLIGHT_ENV !== "1") {
    skip("paid plan required", `${crons} crons, ${longest}s max — set PREFLIGHT_ENV=1 to assert`);
  } else {
    ok("the plan supports this workload", acknowledged,
       acknowledged ? `${declared}, ${crons} crons, ${longest}s max`
         : `${crons} crons and a ${longest}s function need Pro; set VERCEL_PLAN=pro to confirm`);
  }
} else {
  ok("within free-plan limits", true, `${crons} crons, ${longest}s max`);
}

/* ------------------------------------------------------------------ */
if (bad) {
  console.log(`\n${bad} PROBLEM(S):`);
  for (const f of fails) console.log(`  - ${f}`);
  console.log("");
  process.exit(1);
}
console.log(skipped
  ? `\nstatic checks pass; ${skipped} environment check(s) not run.\n`
  : "\nready to deploy.\n");
