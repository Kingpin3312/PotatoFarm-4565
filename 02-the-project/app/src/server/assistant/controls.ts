import { priceFils } from "./pricing";
import { log, report } from "@/lib/log";
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
    report(err, { orgId }, { note: "could not read controls — failing closed" });
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
  /** `drafted`: written for a person to send, and paid for either way. */
  outcome: "sent" | "drafted" | "handover" | "blocked" | "error";
}) {
  const costFils = priceFils(u.model, u.inputTokens, u.outputTokens);

  await crossTenant("sweep").assistantUsage.create({ data: { ...u, costFils } });
  spendCache.delete(u.orgId);

  return costFils;
}

/**
 * Rates and the arithmetic moved to `pricing.ts`.
 *
 * They sat here, and this module opens a database client at module
 * scope — so the one calculation standing between the assistant and a
 * brokerage's spend ceiling could not be tested without a Postgres, and
 * so was never tested. It is pure, it is money, and being wrong about it
 * is silent, which is the exact profile of everything else in
 * `npm test`.
 */


/** Turning it off. Deliberately not a general settings update. */
export async function pause(orgId: string, byUserId: string, reason: string) {
  await crossTenant("sweep").assistantSettings.upsert({
    where: { orgId },
    create: { orgId, enabled: false, pausedReason: reason, pausedAt: new Date(), pausedById: byUserId },
    update: { enabled: false, pausedReason: reason, pausedAt: new Date(), pausedById: byUserId },
  });
}

/**
 * Turning it on — and it **must** upsert, which it did not.
 *
 * `AssistantSettings` has no row until something writes one. `pause()`
 * directly above upserts, so stopping the assistant creates the row.
 * This used `update()`, so on a brokerage that had never touched the
 * setting — which is every brokerage on its first day — pressing
 * "Start answering" returned a 500: *"No operation failed because it
 * depends on one or more records that were required but not found."*
 *
 * The product's one-line promise is that an assistant answers enquiries
 * within seconds. The single button that switches that on did not work
 * on a fresh install, and the only route to a working assistant was to
 * **pause** it first so the row existed, then resume. Nobody would
 * guess that, and nothing said so.
 *
 * The same shape as the twelve in CLAUDE.md, on the headline feature:
 * what writes the first row? Here, nothing did — and the asymmetry
 * between the two halves of one switch is what hid it, because reading
 * `pause` proves the row gets created and reading `resume` looks
 * correct beside it.
 *
 * `create` sets `enabled: true` because that is what the caller asked
 * for. Nothing else is defaulted: the budget, the warning threshold and
 * the prompt version keep their schema defaults, and `gate()` still
 * reads the row it has just created on the very next assistant turn.
 */
export async function resume(orgId: string) {
  await crossTenant("sweep").assistantSettings.upsert({
    where: { orgId },
    create: { orgId, enabled: true },
    update: { enabled: true, pausedReason: null, pausedAt: null, pausedById: null },
  });
}
