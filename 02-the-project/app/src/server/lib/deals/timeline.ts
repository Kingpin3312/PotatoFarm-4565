import type { DealStage, Financing } from "@prisma/client";
import { stagesFor, typicalDuration, STAGES } from "./stages";

/**
 * Backwards planning from the contractual completion date.
 *
 * The Form F names a date. Everything before it has a lead time. Plan
 * forwards and you find out you are late; plan backwards and you find out
 * when each thing has to start.
 *
 * The single most useful output here is not the plan. It is the answer to
 * "is this date still achievable", asked every morning.
 */

/** UAE working week: Monday to Friday, weekend Saturday and Sunday. */
function isWorkingDay(d: Date) {
  const day = d.getUTCDay();
  return day !== 6 && day !== 0;
}

export function addWorkingDays(from: Date, days: number) {
  const d = new Date(from);
  let left = Math.abs(days);
  const step = days >= 0 ? 1 : -1;
  while (left > 0) {
    d.setUTCDate(d.getUTCDate() + step);
    if (isWorkingDay(d)) left -= 1;
  }
  return d;
}

export function workingDaysBetween(a: Date, b: Date) {
  const [from, to] = a < b ? [a, b] : [b, a];
  const d = new Date(from);
  let n = 0;
  while (d < to) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (isWorkingDay(d)) n += 1;
  }
  return a < b ? n : -n;
}

export type PlannedMilestone = { stage: DealStage; title: string; dueAt: Date; owner: string };

/**
 * The plan.
 *
 * Built by walking the applicable stages backwards from the completion
 * date, each one due its own lead time before the next begins.
 */
export function plan(deal: {
  financing: Financing;
  sellerHasMortgage: boolean;
  contractualCompletionAt: Date;
}): PlannedMilestone[] {
  const applicable = stagesFor(deal);
  const out: PlannedMilestone[] = [];

  let cursor = deal.contractualCompletionAt;
  for (const s of [...applicable].reverse()) {
    out.unshift({ stage: s.stage, title: s.title, dueAt: new Date(cursor), owner: s.owner });
    cursor = addWorkingDays(cursor, -s.typicalDays);
  }
  return out;
}

export type Health = {
  achievable: boolean;
  daysOfSlack: number;
  nextDue: PlannedMilestone | null;
  overdue: PlannedMilestone[];
  message: string;
};

/**
 * Is the contractual date still achievable?
 *
 * This is the question the whole module exists to answer, and the answer
 * needs to be blunt. A deal that quietly becomes impossible three weeks
 * out, and is discovered in the final week, costs somebody a deposit.
 */
export function assess(args: {
  deal: { financing: Financing; sellerHasMortgage: boolean; contractualCompletionAt: Date };
  completed: DealStage[];
  now?: Date;
}): Health {
  const now = args.now ?? new Date();
  const done = new Set(args.completed);
  const planned = plan(args.deal);

  const remaining = stagesFor(args.deal).filter((s) => !done.has(s.stage));
  const workLeft = remaining.reduce((n, s) => n + s.typicalDays, 0);
  const daysAvailable = workingDaysBetween(now, args.deal.contractualCompletionAt);
  const slack = daysAvailable - workLeft;

  const outstanding = planned.filter((p) => !done.has(p.stage));
  const overdue = outstanding.filter((p) => p.dueAt < now);
  const nextDue = outstanding.find((p) => p.dueAt >= now) ?? outstanding[0] ?? null;

  let message: string;
  if (!remaining.length) {
    message = "Everything is done.";
  } else if (slack < 0) {
    // Said plainly, with the number, because the useful action is to
    // agree an extension now rather than discover it in the last week.
    message =
      `Not achievable. There are ${workLeft} working days of steps left and ` +
      `${daysAvailable} until the completion date — short by ${Math.abs(slack)}. ` +
      `Agree an extension now rather than in the final week.`;
  } else if (slack <= 3) {
    message = `Tight. ${slack} working day${slack === 1 ? "" : "s"} of slack, and no room for a slow NOC.`;
  } else {
    message = `On track with ${slack} working days of slack.`;
  }

  return { achievable: slack >= 0, daysOfSlack: slack, nextDue, overdue, message };
}

/**
 * Sanity check before the Form F is signed.
 *
 * Agreeing a 30-day completion on a mortgage purchase where the seller
 * also has a mortgage is agreeing to something that typically takes
 * longer than 30 days. Better to say so while it is still negotiable.
 */
export function checkProposedDate(deal: {
  financing: Financing;
  sellerHasMortgage: boolean;
  proposedCompletionAt: Date;
  signingAt?: Date;
}) {
  const from = deal.signingAt ?? new Date();
  const available = workingDaysBetween(from, deal.proposedCompletionAt);
  const needed = typicalDuration(deal);

  if (available >= needed) {
    return { realistic: true, available, needed, message: `Comfortable — ${available} working days for about ${needed} days of process.` };
  }

  const worst = STAGES.filter((s) => !s.onlyIf || s.onlyIf(deal))
    .sort((a, b) => b.typicalDays - a.typicalDays)[0];

  return {
    realistic: false,
    available,
    needed,
    message:
      `${available} working days for a process that typically takes ${needed}. ` +
      `The long pole is "${worst?.title ?? "the slowest step"}" at around ${worst?.typicalDays ?? needed} days. ` +
      `Push the date out before anyone signs.`,
  };
}
