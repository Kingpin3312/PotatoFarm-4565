import { crossTenant } from "@/server/db/client";
import { stripe } from "./provider";
import { settle } from "./dunning";
import { log, report } from "@/lib/log";

/**
 * Reconciliation.
 *
 * Webhooks get lost. An endpoint has a bad minute, a deploy drops a
 * request, a provider gives up after its retries. If webhooks are the
 * only path, a customer who paid stays restricted — they paid and got
 * punished for it, and they find out by ringing you.
 *
 * So the provider is asked directly, on a schedule, about anything we
 * still believe is unpaid. It runs daily, it is cheap, and it is the
 * difference between a billing system that mostly works and one that can
 * be trusted.
 *
 * Deliberately one-directional: it can mark something **paid**, never
 * unpaid. Marking a settled invoice back to unpaid on the strength of a
 * confused API response would restrict a customer who owes nothing.
 */
export async function reconcile(lookbackDays = 45) {
  const since = new Date(Date.now() - lookbackDays * 86_400_000);

  // First, so a failure settling an invoice below cannot stop it — the
  // two are independent, and a correction dated today cannot change an
  // invoice already issued whichever runs first.
  const seats = await reconcileSeats();

  const open = await crossTenant("sweep").invoice.findMany({
    where: {
      status: { in: ["OPEN", "FAILED"] },
      issuedAt: { gte: since },
      providerRef: { not: null },
    },
    select: { id: true, orgId: true, number: true, providerRef: true, status: true },
  });

  let corrected = 0;

  for (const inv of open) {
    const actual = await stripe.fetchStatus(inv.providerRef!);

    if (actual === "paid") {
      // The webhook never arrived, or arrived and failed. Fix it quietly
      // and log loudly — a pattern of these means the webhook endpoint
      // has a problem worth finding.
      await settle(inv.id);
      corrected += 1;
      log.warn("invoice was paid but we had not recorded it", { orgId: inv.orgId }, {
        invoice: inv.number, was: inv.status,
      });
    }

    if (actual === "unknown") {
      report(new Error("Could not reach the payment provider during reconciliation"), {
        orgId: inv.orgId,
      }, { invoice: inv.number });
    }
  }

  /**
   * The other direction: invoices marked paid with nothing to show for
   * it. Not corrected automatically — a wrongly-paid invoice is a
   * conversation, not a job's decision.
   */
  const suspicious = await crossTenant("sweep").invoice.count({
    where: { status: "PAID", providerRef: null, issuedAt: { gte: since } },
  });

  return { checked: open.length, corrected, paidWithoutReference: suspicious, ...seats };
}

/**
 * The seat ledger against the team, every brokerage, every night.
 *
 * The ledger is written by exactly three things — signup, accepting an
 * invitation, removing a member — and for the life of this project only
 * the first of them did it. Every brokerage was billed for one seat
 * whatever its size, and nothing noticed, because an invoice for too
 * little does not bounce and a brokerage does not ring to say so.
 *
 * So the two are compared rather than trusted. A difference is
 * corrected **from today** — the ledger is append-only, and a correction
 * backdated into a period already invoiced would change a bill somebody
 * has paid — and reported, because a difference means some path adds or
 * removes a member without touching the ledger, and the correction only
 * treats the symptom.
 *
 * Run before the invoices are reconciled, and independent of them: an
 * invoice is computed from seat-days, so a correction written today
 * changes tomorrow's arithmetic and nothing already issued.
 */
export async function reconcileSeats() {
  const live = await crossTenant("sweep").organisation.findMany({
    where: { deletedAt: null }, select: { id: true },
  });
  const subs = await crossTenant("sweep").subscription.findMany({
    where: { orgId: { in: live.map((o) => o.id) } },
    select: { id: true, orgId: true },
  });

  let drifted = 0;
  for (const sub of subs) {
    /**
     * Per person, not a net figure. Every seat event names somebody,
     * and a correction should too: "Tom joined and was never billed" is
     * a finding somebody can act on, "the ledger was off by three" is not.
     */
    const [ledger, members] = await Promise.all([
      crossTenant("sweep").seatEvent.groupBy({
        by: ["userId"], where: { subId: sub.id }, _sum: { change: true },
      }),
      crossTenant("sweep").membership.findMany({ where: { orgId: sub.orgId }, select: { userId: true } }),
    ]);
    const held = new Map(ledger.map((r) => [r.userId, r._sum.change ?? 0]));
    const onTeam = new Set(members.map((m) => m.userId));

    const fixes: { userId: string; change: number; reason: string }[] = [];
    for (const userId of onTeam) {
      const seats = held.get(userId) ?? 0;
      if (seats !== 1) fixes.push({ userId, change: 1 - seats, reason: `reconcile: on the team, ledger held ${seats}` });
    }
    for (const [userId, seats] of held) {
      if (!onTeam.has(userId) && seats !== 0) {
        fixes.push({ userId, change: -seats, reason: `reconcile: left the team, ledger held ${seats}` });
      }
    }
    if (!fixes.length) continue;

    drifted += 1;
    await crossTenant("sweep").seatEvent.createMany({
      data: fixes.map((f) => ({ orgId: sub.orgId, subId: sub.id, ...f })),
    });
    report(new Error("Seat ledger did not match the team — a membership change skipped it"), {
      orgId: sub.orgId,
    }, { corrections: fixes.length, net: fixes.reduce((n, f) => n + f.change, 0) });
  }
  return { seatLedgersCorrected: drifted };
}
