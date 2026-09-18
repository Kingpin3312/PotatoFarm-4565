import { crossTenant } from "@/server/db/client";
import { messagingWindow } from "@/server/lib/whatsapp";
import { checkChannelSilence } from "@/server/lib/portals/health";

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
  const silent = (await checkChannelSilence()).filter((a) => a.orgId === orgId);
  if (!silent.length) return [{ key: "portals", state: "ok", detail: "All feeds delivering." }];

  return silent.map((s) => ({
    key: `portal:${s.label}`,
    state: "degraded" as const,
    detail: `Nothing for ${Math.round(s.quietHours)}h — normally every ${Math.round(s.expected / 3)}h.`,
    action: "Check the credentials and the webhook. A silent feed does not error.",
  }));
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
