import { crossTenant } from "@/server/db/client";

/**
 * Seat accounting.
 *
 * The pricing FAQ on the site says: "Pro rata for the days they use,
 * added to the next invoice. Removing them works the same way." That
 * sentence was written before any of this existed, so it needs to be
 * true, and it constrains the design more than it looks.
 *
 * Counting seats at month end would either overcharge a brokerage that
 * lost three agents on the 2nd, or undercharge one that hired four on the
 * 3rd. Agents move between agencies constantly here — this is not an edge
 * case, it is most months.
 *
 * So seats are an **append-only ledger of changes**, and the invoice is
 * computed from seat-days. Exact, explainable, and it survives somebody
 * asking "why is this month different".
 */

export async function recordSeatChange(args: {
  orgId: string; userId: string; change: 1 | -1; reason?: string;
}) {
  const sub = await crossTenant("global-key").subscription.findUnique({
    where: { orgId: args.orgId }, select: { id: true },
  });
  // No subscription yet during onboarding — seats still get recorded once
  // there is one, from the memberships that already exist.
  if (!sub) return;

  await crossTenant("global-key").seatEvent.create({
    data: {
      orgId: args.orgId, subId: sub.id, userId: args.userId,
      change: args.change, reason: args.reason,
    },
  });
}

/**
 * Seat-days across a period.
 *
 * Walks the ledger rather than sampling it. The starting headcount is
 * whatever the net of every earlier event was, so a period that begins
 * mid-life does not start from zero.
 */
export async function seatDays(subId: string, from: Date, to: Date) {
  const [prior, during] = await Promise.all([
    crossTenant("global-key").seatEvent.aggregate({
      where: { subId, at: { lt: from } }, _sum: { change: true },
    }),
    crossTenant("global-key").seatEvent.findMany({
      where: { subId, at: { gte: from, lt: to } },
      orderBy: { at: "asc" },
      select: { at: true, change: true },
    }),
  ]);

  let seats = prior._sum.change ?? 0;
  let cursor = from;
  let total = 0;

  const days = (a: Date, b: Date) => (b.getTime() - a.getTime()) / 86_400_000;

  for (const e of during) {
    total += seats * days(cursor, e.at);
    seats += e.change;
    cursor = e.at;
  }
  total += seats * days(cursor, to);

  return {
    // Rounded up. A part-day of a seat is charged as a day — stated in
    // the terms, and it avoids fractional fils nobody can reconcile.
    seatDays: Math.ceil(total),
    seatsAtEnd: seats,
    fullPeriodDays: Math.round(days(from, to)),
  };
}
