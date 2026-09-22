import { crossTenant } from "@/server/db/client";
import { messagingWindow } from "@/server/lib/whatsapp";
import { checkChannelSilence, checkFeedSilence } from "@/server/lib/portals/health";

/**
 * Health, per brokerage — not per service.
 *
 * Ordinary monitoring tells you the servers are up. It does not tell you
 * that Marina Properties' WhatsApp token expired three hours ago and
 * nobody has answered a lead since. Every dashboard is green, the product
 * is entirely broken for that one customer, and the first you hear of it
 * is a phone call.
 *
 * In a multi-tenant product the unit of failure is the tenant. So health
 * is composed per brokerage, out of the checks already built elsewhere,
 * and answers one question: **is this customer's system actually working
 * right now.**
 */

export type Check = {
  key: string;
  state: "ok" | "degraded" | "broken";
  detail: string;
  /** What a support engineer should do about it, not what the code saw. */
  action?: string;
};

export type TenantHealth = {
  orgId: string;
  name: string;
  state: "ok" | "degraded" | "broken";
  checks: Check[];
};

export async function tenantHealth(orgId: string): Promise<TenantHealth> {
  const org = await crossTenant("sweep").organisation.findUniqueOrThrow({
    where: { id: orgId },
    select: { name: true },
  });

  const checks = await Promise.all([
    whatsappCheck(orgId),
    portalCheck(orgId),
    assistantCheck(orgId),
    backlogCheck(orgId),
    billingCheck(orgId),
    notifiableCheck(orgId),
  ]);

  const flat = checks.flat();
  const state = flat.some((c) => c.state === "broken")
    ? "broken"
    : flat.some((c) => c.state === "degraded")
      ? "degraded"
      : "ok";

  return { orgId, name: org.name, state, checks: flat };
}

/** The single most damaging failure, and the least visible. */
async function whatsappCheck(orgId: string): Promise<Check[]> {
  const channels = await crossTenant("sweep").channel.findMany({
    where: { orgId, type: "WHATSAPP", active: true },
    select: { id: true, label: true, lastError: true, lastSyncAt: true },
  });

  if (!channels.length) {
    return [{
      key: "whatsapp",
      state: "broken",
      detail: "No WhatsApp number connected.",
      action: "Check whether onboarding finished, or whether Meta verification is still pending.",
    }];
  }

  return channels.map((c) => {
    if (c.lastError) {
      return {
        key: `whatsapp:${c.label}`,
        state: "broken" as const,
        detail: c.lastError.slice(0, 160),
        // Token expiry is the usual cause and it is silent — Meta simply
        // stops accepting sends.
        action: "Most likely an expired access token. Re-authorise the number in settings.",
      };
    }
    return { key: `whatsapp:${c.label}`, state: "ok" as const, detail: "Connected." };
  });
}

async function portalCheck(orgId: string): Promise<Check[]> {
  const [silent, feedSilent] = await Promise.all([
    checkChannelSilence().then((a) => a.filter((x) => x.orgId === orgId)),
    /**
     * Listings going *out*, which had no check here at all.
     *
     * Everything above this line watches enquiries arriving. A portal
     * that stops fetching the listing feed stops refreshing a
     * brokerage's advertising — stale prices, withdrawn properties
     * still on sale — and nothing errored, so this page reported "All
     * feeds delivering" while the outbound half was dead.
     */
    checkFeedSilence().then((a) => a.filter((x) => x.orgId === orgId)),
  ]);

  const checks: Check[] = silent.map((s) => ({
    key: `portal:${s.label}`,
    state: "degraded" as const,
    detail: `Nothing for ${Math.round(s.quietHours)}h — normally every ${Math.round(s.expected / 3)}h.`,
    action: "Check the credentials and the webhook. A silent feed does not error.",
  }));

  for (const f of feedSilent) {
    checks.push({
      key: "listing-feed",
      state: "degraded" as const,
      detail: `No portal has fetched the listing feed for ${Math.round(f.quietHours)}h.`,
      // Rotation is the likeliest innocent cause: it is the revocation
      // mechanism, and a portal holding the old URL stops dead.
      action: "If the feed URL was rotated, the portal still has the old one — send them the new URL.",
    });
  }

  if (!checks.length) return [{ key: "portals", state: "ok", detail: "All feeds delivering." }];
  return checks;
}

/**
 * Can anybody in this brokerage actually be told anything?
 *
 * The notification system has an escalation ladder, quiet hours, a
 * morning digest and per-kind urgency, and it delivers through exactly
 * one channel: an Expo push to a registered device. **Nothing in this
 * product calls `registerDevice`**, `PushDevice` has never had a row,
 * and the only client that could register one is the Expo app, which
 * cannot build.
 *
 * So every notification this product has ever generated reached
 * nobody, and until now the sole trace was a `log.warn` per attempt in
 * a log nothing ships. That is the shape CLAUDE.md records about the
 * alerting — severity routing, runbooks and deduplication, all correct,
 * ending in a line nobody read.
 *
 * Reported as **degraded** rather than broken, deliberately. The
 * brokerage's own system is working: leads arrive, the board moves, the
 * inbox answers. What is not working is our ability to interrupt an
 * agent, and calling that "broken" would put a tenant in the same state
 * as one whose WhatsApp has stopped — which is how a health page stops
 * being read.
 *
 * The condition is narrow on purpose: a brokerage nobody has ever tried
 * to notify is not a fault, it is a quiet week. This only fires once
 * the product has generated notifications and none of them reached
 * anything.
 */
async function notifiableCheck(orgId: string): Promise<Check[]> {
  const [devices, undelivered] = await Promise.all([
    crossTenant("sweep").pushDevice.count({ where: { orgId, failedAt: null } }),
    crossTenant("sweep").notification.count({ where: { orgId, deliveredAt: null } }),
  ]);

  if (devices > 0) {
    return [{ key: "notifications", state: "ok", detail: `${devices} device(s) registered.` }];
  }
  if (undelivered === 0) {
    // Nothing has been generated yet. Not a fault, and saying so keeps
    // a new brokerage off the degraded list on its first morning.
    return [{ key: "notifications", state: "ok", detail: "Nothing to deliver yet." }];
  }
  return [{
    key: "notifications",
    state: "degraded",
    detail: `No registered device in this brokerage — ${undelivered} notification(s) have reached nobody.`,
    action: "Nobody here can be interrupted. Until the mobile app ships, agents have to work from the screens.",
  }];
}

async function assistantCheck(orgId: string): Promise<Check[]> {
  const s = await crossTenant("sweep").assistantSettings.findUnique({ where: { orgId } });
  if (!s) return [{ key: "assistant", state: "degraded", detail: "Never switched on." }];

  if (!s.enabled) {
    return [{
      key: "assistant",
      // Off on purpose is not a fault. Reporting it as one trains people
      // to ignore the health page.
      state: "degraded",
      detail: s.pausedReason ?? "Stopped.",
      action: s.pausedReason?.startsWith("Paused — invoice")
        ? "Billing, not a fault. See the invoice."
        : "Someone stopped it deliberately. Find out why before restarting it.",
    }];
  }
  return [{ key: "assistant", state: "ok", detail: "Running." }];
}

/**
 * The one that actually means "a customer is being ignored right now".
 * Everything else is a cause; this is the symptom.
 */
async function backlogCheck(orgId: string): Promise<Check[]> {
  const waiting = await crossTenant("sweep").conversation.findMany({
    where: {
      orgId,
      humanHandover: true,
      handoverAt: { lt: new Date(Date.now() - 60 * 60_000) },
      messages: { none: { direction: "OUTBOUND", author: "AGENT" } },
    },
    select: { id: true, lastInboundAt: true },
    take: 100,
  });

  if (!waiting.length) return [{ key: "backlog", state: "ok", detail: "Nobody waiting." }];

  // A conversation whose window has closed is not merely late — it can no
  // longer be answered at all without a template.
  const unreachable = waiting.filter((w) => !messagingWindow(w.lastInboundAt).open).length;

  return [{
    key: "backlog",
    state: unreachable ? "broken" : "degraded",
    detail: `${waiting.length} waiting over an hour${unreachable ? `, ${unreachable} past the 24-hour window` : ""}.`,
    action: unreachable
      ? "Those past the window need a template or a phone call. They cannot be messaged normally."
      : "Nudge the brokerage — these are theirs to answer.",
  }];
}

async function billingCheck(orgId: string): Promise<Check[]> {
  const sub = await crossTenant("sweep").subscription.findUnique({
    where: { orgId }, select: { status: true },
  });
  if (!sub) return [{ key: "billing", state: "degraded", detail: "No subscription." }];
  if (sub.status === "RESTRICTED")
    return [{ key: "billing", state: "degraded", detail: "Restricted for non-payment.", action: "See the dunning ladder." }];
  return [{ key: "billing", state: "ok", detail: sub.status.toLowerCase() }];
}

/** Every tenant at once, worst first. The internal morning check. */
export async function allTenants() {
  const orgs = await crossTenant("sweep").organisation.findMany({
    where: { deletedAt: null }, select: { id: true },
  });
  const results = await Promise.all(orgs.map((o) => tenantHealth(o.id)));
  const rank = { broken: 0, degraded: 1, ok: 2 };
  return results.sort((a, b) => rank[a.state] - rank[b.state]);
}
