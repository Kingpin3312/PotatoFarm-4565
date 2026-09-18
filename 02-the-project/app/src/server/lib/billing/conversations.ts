import { seatDays } from "./seats";
import { forOrg, crossTenant } from "@/server/db/client";
import { log } from "@/lib/log";

/**
 * Billing for conversations answered.
 *
 * Per-seat alone charged by headcount and delivered value by
 * conversation, and those are not correlated in this market. A
 * lead-heavy eight-agent firm ran at 31% gross margin while a quiet
 * forty-agent firm ran at 90% — the small one subsidised by the large,
 * which is exactly backwards.
 *
 * The headline price does not change. An allowance is added to it, so
 * **no existing quote is invalidated and no brokerage's bill goes
 * down** — only firms past the allowance pay more, and only in
 * proportion to what they consumed.
 */

/**
 * What counts.
 *
 * Recorded the moment the assistant answers an inbound message. The
 * unique constraint on (conversation, day) does the deduplication, so a
 * buyer messaging six times in an afternoon is one charge — not six.
 * Application-side deduplication drifts; a database constraint does not.
 */
export async function recordAnswered(args: {
  orgId: string;
  conversationId: string;
  at?: Date;
}) {
  const day = new Date(args.at ?? new Date());
  day.setUTCHours(0, 0, 0, 0);

  const sub = await forOrg(args.orgId).subscription.findUnique({
    where: { orgId: args.orgId },
    select: { id: true, status: true },
  });
  // A trial still records. The brokerage should be able to see what the
  // bill would have been before it arrives — a first invoice that
  // surprises somebody is a first invoice that gets disputed.
  if (!sub) return;

  try {
    await forOrg(args.orgId).conversationCharge.create({
      data: { orgId: args.orgId, subId: sub.id, conversationId: args.conversationId, day },
    });
  } catch {
    // Already recorded today. The constraint did its job; this is the
    // expected path for any busy conversation, not an error.
  }
}

/**
 * The bill.
 *
 * Included is per **seat**, pooled across the brokerage rather than
 * enforced per agent — one agent having a quiet month should cover a
 * colleague having a loud one, which is how a team actually works and
 * how an owner expects it to be counted.
 */
export async function usage(subId: string, from: Date, to: Date) {
  const sub = await crossTenant("sweep").subscription.findUniqueOrThrow({
    where: { id: subId },
    select: { orgId: true, includedPerSeat: true, overageFils: true },
  });

  /**
   * The allowance is time-weighted, exactly like the seat charge.
   *
   * This counted `membership.count()` — a headcount snapshot taken
   * whenever the invoice happened to run. The seat charge has always
   * been an append-only ledger of seat-days. Two different definitions
   * of "how many agents" in one invoice, and the gap between them was
   * exploitable:
   *
   *   A brokerage adding ten agents on the 30th of a 30-day month paid
   *   $23 for one day of seats and gained 600 conversations of
   *   allowance backdated to the 1st — about $57 of overage wiped. A
   *   2x return on hiring somebody for a day.
   *
   * And it was wrong without anyone gaming it: a firm that shrank
   * mid-month was measured at its smaller end-of-month headcount and
   * given less allowance than it had for most of the period.
   *
   * Average seats over the period is the only definition consistent
   * with what we charge for.
   */
  const { seatDays: used, fullPeriodDays } = await seatDays(subId, from, to);
  const avgSeats = fullPeriodDays > 0 ? used / fullPeriodDays : 0;

  const answered = await crossTenant("sweep").conversationCharge.count({
    where: { subId, day: { gte: from, lt: to } },
  });

  // Rounded down. A fractional allowance would be arithmetic nobody can
  // check, and rounding in the customer's favour on the seat count is
  // not where the money is.
  const seats = Math.floor(avgSeats * 100) / 100;
  const included = Math.floor(avgSeats * sub.includedPerSeat);
  const over = Math.max(0, answered - included);

  return {
    answered,
    seats,
    included,
    over,
    overageFils: BigInt(over) * sub.overageFils,
    /**
     * How much of the allowance is gone, so the app can say it before
     * the invoice does. A brokerage that finds out it went over when the
     * bill lands is a brokerage that feels caught out — and the whole
     * commercial argument here is that we do not do that.
     */
    usedPct: included ? Math.round((answered / included) * 100) : 0,
  };
}

/**
 * Told at 80%, not at 100%.
 *
 * Eighty is enough warning to do something about it — pause proactive
 * outreach, or agree the extra spend deliberately. A hundred is a
 * notification about a decision that has already been made for them.
 */
export const WARN_AT_PCT = 80;

export async function warnIfNearLimit(orgId: string) {
  const sub = await forOrg(orgId).subscription.findUnique({
    where: { orgId }, select: { id: true, currentFrom: true, currentTo: true },
  });
  if (!sub) return null;

  /**
   * To **now**, not to the end of the period.
   *
   * Passing `currentTo` would average seats across days that have not
   * happened, quietly inflating the allowance and telling a brokerage
   * it has headroom it does not have yet.
   */
  const now = new Date();
  const u = await usage(sub.id, sub.currentFrom, now < sub.currentTo ? now : sub.currentTo);
  if (u.usedPct < WARN_AT_PCT) return null;

  log.info("conversation allowance nearly used", { orgId },
           { answered: u.answered, included: u.included, pct: u.usedPct });

  return {
    ...u,
    message: u.over > 0
      ? `You've answered ${u.answered.toLocaleString()} conversations this month against an ` +
        `allowance of ${u.included.toLocaleString()}. The extra ${u.over.toLocaleString()} ` +
        `will appear on this month's invoice.`
      : `You've used ${u.usedPct}% of this month's conversation allowance ` +
        `(${u.answered.toLocaleString()} of ${u.included.toLocaleString()}).`,
  };
}
