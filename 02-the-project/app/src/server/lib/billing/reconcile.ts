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

  return { checked: open.length, corrected, paidWithoutReference: suspicious };
}
