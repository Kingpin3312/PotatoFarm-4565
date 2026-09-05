import { log } from "@/lib/log";

/**
 * Where an alert actually goes, and the heartbeat that proves this
 * process is still alive.
 *
 * ## Why this file exists
 *
 * Everything upstream of it was already built: `alert.ts` evaluates
 * every tenant, classifies each incident PAGE / TICKET / LOG, attaches
 * a runbook, deduplicates against open alerts and closes them when the
 * underlying condition clears. It is a genuinely good alerting system.
 *
 * Its last step was `log.warn`, with a comment reading "PagerDuty,
 * Opsgenie or a Slack channel goes here."
 *
 * So a stopped cron raised a PAGE, and the PAGE was written to stdout on
 * a serverless function that nothing was shipping logs from. **Nobody
 * was ever paged.** The tenth time this codebase has produced a
 * complete, careful module with nothing on the end of it.
 *
 * ## The dead-man's switch is the part that matters
 *
 * The board audit put it plainly: *the alerting cannot report its own
 * absence*. Every check above runs **inside** the application. If the
 * deployment is down, the crons are not firing, or the database is
 * unreachable, the code that would notice is equally not running. A
 * monitoring system that shares a failure domain with the thing it
 * monitors is a monitoring system that reports "all well" by being
 * dead.
 *
 * `heartbeat()` is the answer and it is deliberately inverted: the app
 * pings an external service on every successful sweep, and **the
 * external service alarms when the ping stops**. That alarm lives
 * outside this system entirely, so it survives the outage it is
 * reporting. Healthchecks.io, Better Stack, Cronitor and Dead Man's
 * Snitch all take a bare GET; any of them will do.
 *
 * ## Configuration
 *
 *     ALERT_WEBHOOK_URL   where PAGE and TICKET alerts are posted
 *     HEARTBEAT_URL       pinged after each successful health sweep
 *
 * Both are checked by `check:alerting`, which fails when a production
 * build has neither — because the failure mode of an unconfigured
 * alerting system is silence, and silence is indistinguishable from
 * everything being fine.
 */

export type Delivery = { ok: true } | { ok: false; reason: string };

const TIMEOUT_MS = 5_000;

/** Configured, as opposed to merely imported. Read by the preflight check. */
export function alertingConfigured() {
  return {
    webhook: Boolean(process.env.ALERT_WEBHOOK_URL?.trim()),
    heartbeat: Boolean(process.env.HEARTBEAT_URL?.trim()),
  };
}

/**
 * Post one alert to whatever is on the other end.
 *
 * The payload is flat and boring on purpose. Slack renders `text`,
 * PagerDuty's Events API v2 reads `payload.summary`, and a generic
 * receiver gets the structured fields. Sending all three costs nothing
 * and means the operator can point this at what they already use rather
 * than adopting a tool to suit the code.
 */
export async function deliver(a: {
  key: string;
  severity: string;
  title: string;
  detail: string;
  runbook?: string;
}): Promise<Delivery> {
  const url = process.env.ALERT_WEBHOOK_URL?.trim();

  /**
   * No webhook is not "nothing to do".
   *
   * Returning quietly here would reproduce the exact bug this file was
   * written to fix, one layer further out. The log line is the last
   * resort, and it says that it is one.
   */
  if (!url) {
    log.warn("ALERT UNDELIVERED — no ALERT_WEBHOOK_URL configured", {}, {
      key: a.key, severity: a.severity, title: a.title,
      detail: a.detail, runbook: a.runbook,
    });
    return { ok: false, reason: "ALERT_WEBHOOK_URL is not set" };
  }

  const text = `[${a.severity}] ${a.title}\n${a.detail}` +
    (a.runbook ? `\n\nRunbook: ${a.runbook}` : "");

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        text,                                   // Slack, Discord, Mattermost
        payload: {                              // PagerDuty Events v2
          summary: `${a.title} — ${a.detail}`,
          severity: a.severity === "PAGE" ? "critical" : "warning",
          source: "potatofarm",
        },
        // The structured form, for anything that wants to route on it.
        alert: a,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });

    if (!res.ok) {
      /**
       * A rejected alert is worse than an unsent one, because the code
       * above has already recorded `notifiedAt` and will not try again.
       * It has to be loud.
       */
      log.error("ALERT REJECTED by the webhook", {}, {
        key: a.key, status: res.status, title: a.title,
      });
      return { ok: false, reason: `webhook returned ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    log.error("ALERT DELIVERY FAILED", {}, {
      key: a.key, title: a.title,
      reason: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, reason: e instanceof Error ? e.message : "unknown" };
  }
}

/**
 * Tell the outside world this process completed a health sweep.
 *
 * Called only on the **success** path. Pinging regardless of outcome
 * would turn the dead-man's switch into a liveness check for the
 * runtime rather than for the work, and a cron that runs every night
 * and throws every night would look perfectly healthy.
 *
 * Failure to ping is logged and never thrown: the heartbeat exists to
 * report problems, not to become one. If it cannot reach the monitor,
 * the monitor stops hearing from us and alarms — which is precisely the
 * behaviour wanted.
 */
export async function heartbeat(): Promise<Delivery> {
  const url = process.env.HEARTBEAT_URL?.trim();
  if (!url) return { ok: false, reason: "HEARTBEAT_URL is not set" };

  try {
    const res = await fetch(url, {
      method: "GET",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) {
      log.warn("heartbeat rejected", {}, { status: res.status });
      return { ok: false, reason: `heartbeat returned ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    log.warn("heartbeat failed", {}, {
      reason: e instanceof Error ? e.message : String(e),
    });
    return { ok: false, reason: e instanceof Error ? e.message : "unknown" };
  }
}
