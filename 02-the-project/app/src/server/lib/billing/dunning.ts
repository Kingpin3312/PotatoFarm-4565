import { crossTenant } from "@/server/db/client";
import { dispatch } from "@/server/lib/notify/dispatch";

/**
 * What happens when a payment fails.
 *
 * The principle this whole file is built on:
 *
 *   **A brokerage's own customers must never be able to tell there is a
 *   billing problem.**
 *
 * A buyer messaging at eleven at night should not hit silence because a
 * card expired. If they do, the brokerage loses a deal worth many
 * multiples of the invoice, and they will remember that far longer than
 * they remember paying us. Cutting off lead handling to force payment is
 * the cheapest possible short-term lever and the most expensive
 * long-term one.
 *
 * So degradation runs inwards, not outwards. The things that stop are the
 * things only the brokerage sees. The lead-facing path is the last to go,
 * and their data never goes at all.
 */

export type Restriction =
  | "publish_listings"   // can't push new listings to portals
  | "add_seats"          // can't grow the bill while not paying it
  | "reporting"          // dashboards off
  | "exports"            // bulk export off — but see the note below
  | "assistant";         // last, and only after a month

/**
 * The ladder. Days since the invoice fell due.
 *
 * Note what is missing: nothing here deletes data, blocks the inbox, or
 * stops an agent replying by hand. Those are never on the table.
 */
export const LADDER: { afterDays: number; restrict: Restriction[]; tell: string }[] = [
  {
    afterDays: 0,
    restrict: [],
    tell: "A payment didn't go through. We'll try again in three days — nothing changes in the meantime.",
  },
  {
    afterDays: 7,
    restrict: ["add_seats"],
    tell: "Still unpaid. You can't add agents until it's settled, but everything else is untouched.",
  },
  {
    afterDays: 14,
    restrict: ["add_seats", "publish_listings", "reporting"],
    tell: "Publishing to portals and reporting are paused. Your inbox and your assistant are still running.",
  },
  {
    afterDays: 30,
    restrict: ["add_seats", "publish_listings", "reporting", "assistant"],
    // The assistant is last because it is the only restriction a lead can
    // notice. Thirty days is long enough that this is a decision, not an
    // accident, and by then somebody has spoken to them.
    tell: "The assistant has been paused. Enquiries still arrive and your team can still reply — nothing has been lost.",
  },
];

export function restrictionsFor(daysOverdue: number): Restriction[] {
  let current: Restriction[] = [];
  for (const rung of LADDER) if (daysOverdue >= rung.afterDays) current = rung.restrict;
  return current;
}

export function messageFor(daysOverdue: number) {
  let msg = LADDER[0].tell;
  for (const rung of LADDER) if (daysOverdue >= rung.afterDays) msg = rung.tell;
  return msg;
}

/**
 * Exports are restricted but never removed.
 *
 * A brokerage in a billing dispute is exactly the brokerage most likely
 * to want their data out, and holding it hostage over an invoice is both
 * indefensible and, under most data protection regimes, unlawful. Bulk
 * export moves behind a support request rather than disappearing —
 * slower, still guaranteed.
 */
export const EXPORT_NEVER_BLOCKED = true;

/** Runs daily. */
export async function sweepOverdue() {
  const overdue = await crossTenant("sweep").invoice.findMany({
    where: { status: { in: ["OPEN", "FAILED"] }, dueAt: { lt: new Date() } },
    select: {
      id: true, orgId: true, subId: true, dueAt: true, number: true,
      totalFils: true, attempts: true,
    },
  });

  for (const inv of overdue) {
    const daysOverdue = Math.floor((Date.now() - inv.dueAt.getTime()) / 86_400_000);
    const restrict = restrictionsFor(daysOverdue);

    await crossTenant("sweep").subscription.update({
      where: { id: inv.subId },
      data: { status: restrict.length ? "RESTRICTED" : "PAST_DUE" },
    });

    // The assistant is stopped through the same control the customer uses,
    // so the settings page shows the real reason rather than the assistant
    // appearing to have failed.
    if (restrict.includes("assistant")) {
      await crossTenant("sweep").assistantSettings.upsert({
        where: { orgId: inv.orgId },
        create: {
          orgId: inv.orgId, enabled: false,
          pausedReason: `Paused — invoice ${inv.number} unpaid for ${daysOverdue} days`,
          pausedAt: new Date(),
        },
        update: {
          enabled: false,
          pausedReason: `Paused — invoice ${inv.number} unpaid for ${daysOverdue} days`,
          pausedAt: new Date(),
        },
      });
    }

    await dispatch({
      orgId: inv.orgId,
      kind: "ASSISTANT_STOPPED",
      subjectId: inv.id,
      title: `Invoice ${inv.number} is ${daysOverdue} days overdue`,
      body: messageFor(daysOverdue),
      deeplink: "/settings/billing",
      assignedToId: null,
      since: inv.dueAt,
    });
  }

  return { considered: overdue.length };
}

/** On payment, everything comes back at once. No queue, no delay. */
export async function settle(invoiceId: string) {
  const inv = await crossTenant("sweep").invoice.update({
    where: { id: invoiceId },
    data: { status: "PAID", paidAt: new Date(), lastError: null },
  });

  await crossTenant("sweep").subscription.update({
    where: { id: inv.subId },
    data: { status: "ACTIVE" },
  });

  // Only lift the pause if billing was what caused it. A brokerage that
  // stopped the assistant themselves last Tuesday must not have it
  // silently restarted by an unrelated payment.
  const settings = await crossTenant("sweep").assistantSettings.findUnique({ where: { orgId: inv.orgId } });
  if (settings && !settings.enabled && settings.pausedReason?.startsWith("Paused — invoice")) {
    await crossTenant("sweep").assistantSettings.update({
      where: { orgId: inv.orgId },
      data: { enabled: true, pausedReason: null, pausedAt: null },
    });
  }

  return inv;
}
