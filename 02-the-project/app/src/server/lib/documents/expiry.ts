import type { DocumentType, DocumentOwner } from "@prisma/client";

/**
 * Documents that expire.
 *
 * Three of these stop business entirely when they lapse, and all three
 * fail the same silent way — nothing errors, a transaction just cannot
 * proceed, and somebody finds out on the day it matters:
 *
 *   - **Trakheesi permit**: the listing is pulled and the brokerage is
 *     advertising illegally.
 *   - **RERA broker card**: that agent cannot legally act on a
 *     transaction. If it lapses mid-deal, the deal is exposed.
 *   - **Brokerage licence**: nobody can transact.
 *
 * So lead times are set by **how long renewal actually takes**, not by a
 * round number. Warning somebody 30 days before a renewal that takes 45
 * is warning them too late while looking helpful.
 */

export type ExpiryRule = {
  type: DocumentType;
  /** Days before expiry to start warning. Set by renewal turnaround. */
  warnDays: number;
  /** Whether lapsing stops work, or is merely untidy. */
  blocking: boolean;
  /** Who needs telling. Not always the same person. */
  notify: "AGENT" | "COMPLIANCE" | "ADMIN" | "OWNER";
  consequence: string;
};

export const RULES: ExpiryRule[] = [
  {
    type: "RERA_BROKER_CARD",
    // Renewal involves training hours and a test slot. Sixty days is not
    // generous, it is the minimum that leaves room to actually do it.
    warnDays: 60,
    blocking: true,
    notify: "ADMIN",
    consequence: "This agent cannot legally act on a transaction once it lapses. Any live deal they are on is exposed.",
  },
  {
    type: "BROKERAGE_LICENCE",
    warnDays: 90,
    blocking: true,
    notify: "OWNER",
    consequence: "Nobody in the brokerage can transact.",
  },
  {
    type: "TRAKHEESI_PERMIT",
    warnDays: 14,
    blocking: true,
    notify: "AGENT",
    consequence: "The listing is pulled and the brokerage is advertising illegally.",
  },
  {
    type: "PASSPORT",
    warnDays: 30,
    blocking: false,
    notify: "COMPLIANCE",
    consequence: "The due diligence file needs a current document before the next transaction.",
  },
  {
    type: "EMIRATES_ID",
    warnDays: 30,
    blocking: false,
    notify: "COMPLIANCE",
    consequence: "Same as above — the file goes stale rather than invalid.",
  },
  {
    type: "VISA",
    warnDays: 45,
    blocking: false,
    notify: "AGENT",
    consequence: "Affects eligibility for some transactions and most mortgages.",
  },
  {
    type: "NOC",
    // An NOC has a short validity and a transfer must happen inside it.
    // Seven days because there is no renewal — you apply again.
    warnDays: 7,
    blocking: true,
    notify: "AGENT",
    consequence: "The transfer must complete before this expires or the NOC has to be applied for again.",
  },
  {
    type: "EJARI",
    warnDays: 30,
    blocking: false,
    notify: "AGENT",
    consequence: "Renewal is due. Affects the tenant's utilities and visa renewals.",
  },
];

const BY_TYPE = new Map(RULES.map((r) => [r.type, r]));

export type ExpiryState = "valid" | "expiring" | "expired";

export function state(type: DocumentType, expiresAt: Date | null, now = new Date()): {
  state: ExpiryState;
  daysLeft: number | null;
  rule: ExpiryRule | null;
} {
  const rule = BY_TYPE.get(type) ?? null;
  if (!expiresAt) return { state: "valid", daysLeft: null, rule };

  const daysLeft = Math.floor((expiresAt.getTime() - now.getTime()) / 86_400_000);
  if (daysLeft < 0) return { state: "expired", daysLeft, rule };
  if (rule && daysLeft <= rule.warnDays) return { state: "expiring", daysLeft, rule };
  return { state: "valid", daysLeft, rule };
}

/**
 * Grouped per recipient, not per document.
 *
 * An admin with eleven agents whose cards expire in the same quarter
 * should get one message about eleven cards, not eleven messages. The
 * second version is how somebody turns notifications off, and then misses
 * the twelfth.
 */
export function groupForNotification(
  docs: { type: DocumentType; ownerType: DocumentOwner; ownerId: string; expiresAt: Date | null }[],
  now = new Date()
) {
  const groups = new Map<ExpiryRule["notify"], typeof docs>();

  for (const d of docs) {
    const s = state(d.type, d.expiresAt, now);
    if (s.state === "valid" || !s.rule) continue;
    const who = s.rule.notify;
    groups.set(who, [...(groups.get(who) ?? []), d]);
  }

  return [...groups.entries()].map(([notify, items]) => {
    const expired = items.filter((d) => state(d.type, d.expiresAt, now).state === "expired");
    const blocking = items.filter((d) => BY_TYPE.get(d.type)?.blocking);
    return {
      notify,
      count: items.length,
      expiredCount: expired.length,
      blockingCount: blocking.length,
      // Lead with the worst one. A summary that opens with a passport
      // when a broker card has already lapsed buries the thing that matters.
      headline: expired.length
        ? `${expired.length} document${expired.length > 1 ? "s have" : " has"} expired`
        : `${items.length} expiring soon`,
      items,
    };
  });
}
