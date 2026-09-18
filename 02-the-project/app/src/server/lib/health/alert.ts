import { crossTenant } from "@/server/db/client";
import { log } from "@/lib/log";
import { allTenants, type Check } from "./tenant";
import { jobsHealth } from "./jobs";
import { deliver, heartbeat } from "./deliver";

/**
 * Alerting.
 *
 * The rule that decides severity, and it is not the obvious one:
 *
 *   **Page only for things a human can actually fix at three in the
 *   morning.**
 *
 * A brokerage's WhatsApp token expiring at 11pm on a Saturday is
 * genuinely costing them money right now. Waking an engineer does not
 * help — the fix is the *customer* re-authorising the number, and nobody
 * is going to ring a brokerage owner at midnight to ask. It is a phone
 * call at eight in the morning, so it is a ticket.
 *
 * A database that is unreachable is a page, because someone can do
 * something about it in the next ten minutes.
 *
 * Getting this wrong in the other direction is worse than it sounds. An
 * on-call rota woken three times a week for things they cannot fix stops
 * reading the pages, and then the one that mattered goes unanswered too.
 */

/** Two consecutive detections before anyone is told. Suppresses flapping. */
const CONFIRM_AFTER = 2;

type Severity = "PAGE" | "TICKET" | "LOG";

/**
 * The judgement, in one place so it can be argued with rather than
 * scattered through the detectors.
 */
function severityFor(check: Check, scope: "platform" | "tenant"): Severity {
  // Everything broken at once is the platform, and the platform is
  // fixable now.
  if (scope === "platform") return "PAGE";

  if (check.state !== "broken") return "LOG";

  switch (true) {
    // Needs the customer. Nobody rings a brokerage at midnight.
    case check.key.startsWith("whatsapp"):
      return "TICKET";

    // People are being ignored right now, and an engineer cannot answer
    // them — the brokerage has to. Morning.
    case check.key === "backlog":
      return "TICKET";

    default:
      return "TICKET";
  }
}

const RUNBOOKS: Record<string, string> = {
  whatsapp: "Almost always an expired access token. Ring the brokerage and walk them through re-authorising the number in Settings → Channels. Do not attempt it on their behalf without a support grant.",
  backlog: "These are the brokerage's to answer, not ours. Check whether the assistant was stopped, and whether anything is past the 24-hour window — those need a template or a phone call.",
  portal: "Check credentials and the webhook endpoint. A silent feed does not error, so the last successful delivery time is the only signal.",
  jobs: "A cron has stopped firing. Check the platform's scheduler first, then whether a previous run is holding an advisory lock after a crash.",
  database: "Platform. Check connection limits before anything else — a pool exhausted by a stuck job looks exactly like an outage.",
};

/**
 * One alert, before it has been reconciled against what is already open.
 *
 * Named because `evaluate()` ends by calling `reconcileAlerts(found)` and
 * `reconcileAlerts` typed its parameter as
 * `Awaited<ReturnType<typeof evaluate>> extends infer T ? any : never` —
 * a circular reference through the very function that calls it. TypeScript
 * cannot resolve that, so `evaluate` had no inferable return type either
 * and both errors were the same knot.
 */
export type AlertDraft = {
  key: string;
  orgId?: string;
  severity: Severity;
  title: string;
  detail: string;
  runbook?: string;
};

export async function evaluate() {
  const tenants = await allTenants();
  const jobs = await jobsHealth();

  const found: AlertDraft[] = [];

  // Everything broken at once is not fifty tenant problems.
  const broken = tenants.filter((t) => t.state === "broken");
  if (tenants.length > 2 && broken.length === tenants.length) {
    found.push({
      key: "platform:all-tenants-broken",
      severity: "PAGE",
      title: "Every brokerage is reporting broken",
      detail: `${tenants.length} of ${tenants.length}. This is the platform, not a customer.`,
      runbook: RUNBOOKS.database,
    });
  } else {
    for (const t of tenants) {
      for (const c of t.checks.filter((c) => c.state === "broken")) {
        found.push({
          key: `tenant:${t.orgId}:${c.key}`,
          orgId: t.orgId,
          severity: severityFor(c, "tenant"),
          title: `${t.name}: ${c.key}`,
          detail: c.detail,
          // The key is namespaced "area:detail"; the prefix picks the
          // runbook. `[0]` is optional to the compiler even though split
          // always yields one element.
          runbook: RUNBOOKS[c.key.split(":")[0] ?? ""] ?? c.action,
        });
      }
    }
  }

  for (const j of jobs.filter((j) => j.state === "overdue")) {
    found.push({
      key: `jobs:${j.job}`,
      // A stopped cron is fixable now and everything downstream of it is
      // silently not happening.
      severity: "PAGE",
      title: `Job ${j.job} has stopped running`,
      detail: `${j.overdueBy} minutes past when it should have run.`,
      runbook: RUNBOOKS.jobs,
    });
  }

  const result = await reconcileAlerts(found);

  /**
   * The sweep finished. Tell the outside world.
   *
   * Deliberately after the work rather than at the top: this is a
   * dead-man's switch, and it has to mean "the health sweep completed",
   * not "a function started". Everything above runs *inside* the
   * application, so if the deployment is down or the crons have stopped,
   * none of it reports anything — the external monitor noticing the
   * silence is the only alarm that survives the outage it describes.
   */
  await heartbeat();

  return result;
}

/**
 * Open, update or close. The dedupe key is what stops a five-minute check
 * producing a five-minute alarm.
 */
async function reconcileAlerts(found: AlertDraft[]) {
  const seen = new Set<string>();
  let notified = 0;

  for (const f of found) {
    seen.add(f.key);

    const existing = await crossTenant("global-key").alert.findUnique({ where: { key: f.key } });

    if (existing && !existing.resolvedAt) {
      await crossTenant("global-key").alert.update({
        where: { key: f.key },
        data: { lastSeenAt: new Date(), seenCount: { increment: 1 }, detail: f.detail },
      });

      // Confirmed, not yet told anybody, and nobody has acknowledged it.
      if (existing.seenCount + 1 >= CONFIRM_AFTER && !existing.notifiedAt && !existing.ackedAt) {
        await notify(f);
        await crossTenant("global-key").alert.update({ where: { key: f.key }, data: { notifiedAt: new Date() } });
        notified += 1;
      }
      continue;
    }

    await crossTenant("global-key").alert.upsert({
      where: { key: f.key },
      create: {
        key: f.key, orgId: f.orgId, severity: f.severity,
        title: f.title, detail: f.detail, runbook: f.runbook,
      },
      // Reopening a previously resolved alert starts the count again, so a
      // problem that comes back is confirmed before it pages.
      update: {
        severity: f.severity, title: f.title, detail: f.detail, runbook: f.runbook,
        firstSeenAt: new Date(), lastSeenAt: new Date(),
        seenCount: 1, notifiedAt: null, ackedAt: null, resolvedAt: null,
      },
    });
  }

  /**
   * Anything no longer detected is resolved automatically, and the
   * resolution is announced. An alerting system that opens but never
   * closes teaches people that a full list is normal.
   */
  const closed = await crossTenant("global-key").alert.updateMany({
    where: { resolvedAt: null, key: { notIn: [...seen] } },
    data: { resolvedAt: new Date() },
  });

  return { open: seen.size, notified, resolved: closed.count };
}

async function notify(a: { key: string; severity: Severity; title: string; detail: string; runbook?: string }) {
  if (a.severity === "LOG") return;

  /**
   * This used to be a `log.warn` with a comment saying "PagerDuty,
   * Opsgenie or a Slack channel goes here".
   *
   * Everything above it worked — severity routing, runbooks,
   * deduplication, closing an alert when its condition clears — and the
   * last step wrote to stdout on a serverless function nothing was
   * shipping logs from. A stopped cron raised a PAGE and **nobody was
   * ever paged.**
   *
   * `deliver()` posts it somewhere a person will see, and is loud when
   * it cannot. The log line survives as its fallback, not as its
   * destination.
   */
  await deliver(a);
}

/** Stops the escalation without pretending the problem has gone. */
export async function acknowledge(key: string, who: string) {
  return crossTenant("global-key").alert.update({
    where: { key },
    data: { ackedAt: new Date(), ackedBy: who },
  });
}
