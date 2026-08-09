import { log } from "@/lib/log";
import { aed } from "@/lib/money";
import { crossTenant } from "@/server/db/client";

/**
 * The kill switch and the spend ceiling.
 *
 * Two rules govern this whole file, and both are the opposite of what you
 * would write for a normal cache:
 *
 * 1. **It fails closed.** If the setting cannot be read, the assistant does
 *    not send. An autonomous system talking to a brokerage's customers
 *    should go quiet when it loses contact with its own controls, not
 *    carry on.
 * 2. **The kill switch is not cached.** A five-minute cache means five
 *    minutes of the assistant still messaging customers after somebody
 *    pressed stop. Whatever the reason for pressing it, five more minutes
 *    is not acceptable. It is one indexed primary-key read per turn.
 */

export type Gate =
  | { allowed: true; settings: Settings }
  | { allowed: false; reason: GateReason; detail?: string };

export type GateReason =
  | "disabled"          // somebody turned it off
  | "budget_exhausted"  // ceiling reached
  | "unreadable";       // we could not tell — fail closed

type Settings = {
  orgId: string;
  promptVersion: string;
  handoverAboveBudget: number | null;
};

/**
 * Muted on this conversation?
 *
 * Checked alongside the kill switch and, like it, **not cached**. An
 * agent who mutes a conversation because a negotiation just got delicate
 * needs it to take effect on the next inbound message, not in five
 * minutes.
 */
export async function isMuted(conversationId: string) {
  const c = await crossTenant("sweep").conversation.findUnique({
    where: { id: conversationId },
    select: { assistantMuted: true },
  });
  return c?.assistantMuted ?? false;
}

export async function gate(orgId: string): Promise<Gate> {
  let row;
  try {
    row = await crossTenant("sweep").assistantSettings.findUnique({ where: { orgId } });
  } catch (err) {
    log.error("[assistant] could not read controls — failing closed", err);
    return { allowed: false, reason: "unreadable" };
  }

  // No settings row means never switched on. Default off is correct: an
  // assistant that starts messaging customers because a migration created
  // a row is a bad day for everyone.
  if (!row || !row.enabled) {
    return { allowed: false, reason: "disabled", detail: row?.pausedReason ?? undefined };
  }

  if (row.monthlyBudgetFils !== null) {
    const spent = await spendThisMonth(orgId);
    if (spent >= row.monthlyBudgetFils) {
      return {
        allowed: false,
        reason: "budget_exhausted",
        detail: `${aed(spent)} of ${aed(row.monthlyBudgetFils)} used this month`,
      };
    }
  }

  return {
    allowed: true,
    settings: {
      orgId,
      promptVersion: row.promptVersion,
      handoverAboveBudget: row.handoverAboveBudget ? Number(row.handoverAboveBudget) : null,
    },
  };
}

/**
 * Spend is cached for a minute. Unlike the kill switch this is safe to
 * cache — the worst case is going slightly over a ceiling, which is a
 * billing conversation rather than an incident.
 */
const spendCache = new Map<string, { value: bigint; expiresAt: number }>();

async function spendThisMonth(orgId: string): Promise<bigint> {
  const hit = spendCache.get(orgId);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const start = new Date();
  start.setUTCDate(1);
  start.setUTCHours(0, 0, 0, 0);

  const agg = await crossTenant("sweep").assistantUsage.aggregate({
    where: { orgId, createdAt: { gte: start } },
    _sum: { costFils: true },
  });

  const value = agg._sum.costFils ?? 0n;
  spendCache.set(orgId, { value, expiresAt: Date.now() + 60_000 });
  return value;
}

/** Called after every model call, whatever the outcome. */
export async function record(u: {
  orgId: string;
  conversationId?: string;
  purpose: "reply" | "extract";
  model: string;
  promptVersion: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  outcome: "sent" | "handover" | "blocked" | "error";
}) {
  const costFils = priceFils(u.model, u.inputTokens, u.outputTokens);

  await crossTenant("sweep").assistantUsage.create({ data: { ...u, costFils } });
  spendCache.delete(u.orgId);

  return costFils;
}

/**
 * Rates in fils per million tokens, kept here so a pricing change is one
 * edit. The cost is written to the ledger at the time of the call rather
 * than computed at billing time — pricing changes, and a historical
 * invoice must not move underneath a customer.
 */
const RATES: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-6": { in: 1_100, out: 5_500 },
  default: { in: 1_100, out: 5_500 },
};

function priceFils(model: string, inTok: number, outTok: number): bigint {
  const r = RATES[model] ?? RATES.default;
  const cost = (inTok / 1_000_000) * r.in + (outTok / 1_000_000) * r.out;
  return BigInt(Math.ceil(cost));
}


/** Turning it off. Deliberately not a general settings update. */
export async function pause(orgId: string, byUserId: string, reason: string) {
  await crossTenant("sweep").assistantSettings.upsert({
    where: { orgId },
    create: { orgId, enabled: false, pausedReason: reason, pausedAt: new Date(), pausedById: byUserId },
    update: { enabled: false, pausedReason: reason, pausedAt: new Date(), pausedById: byUserId },
  });
}

export async function resume(orgId: string) {
  await crossTenant("sweep").assistantSettings.update({
    where: { orgId },
    data: { enabled: true, pausedReason: null, pausedAt: null, pausedById: null },
  });
}
