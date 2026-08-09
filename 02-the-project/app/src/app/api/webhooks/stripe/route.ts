import { cardAttached, cardDetached } from "@/server/lib/billing/card";
import { NextRequest, NextResponse } from "next/server";
import { crossTenant } from "@/server/db/client";
import { stripe } from "@/server/lib/billing/provider";
import { settle } from "@/server/lib/billing/dunning";
import { log, report } from "@/lib/log";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Payment webhooks.
 *
 * Three things this has to get right, and the third is the one most
 * implementations miss.
 *
 * 1. **Verify the signature against the raw body.** Parse it first and
 *    the signature will not match, because JSON round-tripping changes
 *    bytes. An unverified payment webhook lets anyone who finds the URL
 *    mark invoices paid.
 * 2. **Never process an event twice.** Providers redeliver. The event id
 *    is a unique column, so a redelivery inserts nothing and does nothing.
 * 3. **Never trust the webhook as the only source of truth.** Webhooks
 *    get lost — endpoints have bad minutes, deploys drop requests. If
 *    this is the only path, a customer who paid stays restricted, which
 *    is the worst outcome available: they paid and got punished for it.
 *    The reconciliation job in reconcile.ts is the safety net.
 */
export async function POST(req: NextRequest) {
  const raw = await req.text();

  if (!stripe.verify(raw, req.headers.get("stripe-signature"), process.env.STRIPE_WEBHOOK_SECRET!)) {
    return NextResponse.json({ error: "Bad signature." }, { status: 401 });
  }

  const event = JSON.parse(raw);

  try {
    // Idempotency. The unique constraint does the work — if this row
    // already exists the redelivery ends here.
    await crossTenant("global-key").paymentEvent.create({
      data: {
        providerId: event.id,
        provider: "stripe",
        type: event.type,
        // The payload is kept for a short window for debugging. It carries
        // no card data — the provider does not send any.
        payload: { status: event.data?.object?.status } as never,
      },
    });
  } catch {
    log.info("payment webhook already handled", {}, { eventId: event.id, type: event.type });
    return NextResponse.json({ received: true, duplicate: true });
  }

  try {
    switch (event.type) {
      case "payment_intent.succeeded": {
        const ref = event.data.object.id as string;
        const invoice = await crossTenant("global-key").invoice.findFirst({
          where: { OR: [{ providerRef: ref }, { number: event.data.object.description }] },
          select: { id: true, status: true, orgId: true },
        });
        if (!invoice) {
          // A payment we cannot match is not something to swallow. Money
          // arrived and nobody was credited.
          report(new Error("Payment with no matching invoice"), {}, { ref });
          break;
        }
        if (invoice.status !== "PAID") await settle(invoice.id);
        break;
      }

      case "payment_intent.payment_failed": {
        const ref = event.data.object.id as string;
        await crossTenant("global-key").invoice.updateMany({
          where: { providerRef: ref, status: { not: "PAID" } },
          data: {
            status: "FAILED",
            attempts: { increment: 1 },
            lastError: event.data.object.last_payment_error?.message?.slice(0, 300),
          },
        });
        // No restriction applied here. The dunning ladder decides that on
        // its own schedule, so one failed attempt does not degrade a
        // brokerage that will pay tomorrow.
        break;
      }

      default:
        log.debug("unhandled payment event", {}, { type: event.type });
    }
  } catch (err) {
    report(err, {}, { eventId: event.id, type: event.type });
    // 200 anyway. The event is recorded as handled, reconciliation will
    // catch any state we got wrong, and a 500 here means the provider
    // retries into a system that already has the row.
  }

  return NextResponse.json({ received: true });
}
