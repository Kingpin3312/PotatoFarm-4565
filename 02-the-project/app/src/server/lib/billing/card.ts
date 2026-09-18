import { crossTenant } from "@/server/db/client";
import { audit } from "@/server/lib/audit";
import { log } from "@/lib/log";

/**
 * Collecting a card.
 *
 * **No card data touches this system.** Not the number, not the CVV, not
 * a truncated PAN. Stripe collects it in their own iframe and returns a
 * customer id and a payment method id; we store those two strings.
 *
 * That is what keeps the whole product outside PCI scope, which is the
 * difference between an annual questionnaire and an audit — and it is a
 * claim the security page makes, so the code has to make it true.
 *
 * A SetupIntent rather than a PaymentIntent, because at the point a
 * brokerage adds a card during a trial there is nothing to charge yet.
 * We are saving the instrument, not taking money.
 */

export type CardResult =
  | { ok: true; clientSecret: string; customerId: string }
  | { ok: false; reason: string };

export async function beginCardSetup(args: {
  orgId: string;
  orgName: string;
  email: string;
  actorId: string;
}): Promise<CardResult> {
  const db = crossTenant("global-key");

  const sub = await db.subscription.findUnique({
    where: { orgId: args.orgId },
    select: { id: true, providerCustomerId: true },
  });
  if (!sub) return { ok: false, reason: "No subscription for this brokerage." };

  try {
    // Reuse the customer if there is one. Creating a second one on every
    // attempt leaves orphaned customers in Stripe and makes reconciliation
    // ambiguous later.
    let customerId = sub.providerCustomerId;

    if (!customerId) {
      const res = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
          "Idempotency-Key": `customer-${args.orgId}`,
        },
        body: new URLSearchParams({
          name: args.orgName,
          email: args.email,
          "metadata[orgId]": args.orgId,
        }),
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) return { ok: false, reason: `Stripe ${res.status}` };
      customerId = (await res.json()).id as string;

      await db.subscription.update({
        where: { id: sub.id },
        data: { providerCustomerId: customerId },
      });
    }

    const si = await fetch("https://api.stripe.com/v1/setup_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        customer: customerId,
        // Off-session, because every subsequent charge happens on a
        // schedule with nobody watching.
        usage: "off_session",
        "payment_method_types[]": "card",
      }),
      signal: AbortSignal.timeout(15_000),
    });
    if (!si.ok) return { ok: false, reason: `Stripe ${si.status}` };

    const intent = await si.json();

    await audit(db, args.orgId, {
      actorId: args.actorId,
      action: "billing.card_setup_started",
      entity: "Subscription",
      entityId: sub.id,
    });

    return { ok: true, clientSecret: intent.client_secret, customerId };
  } catch (err) {
    log.error("card setup failed", { orgId: args.orgId }, { err: String(err).slice(0, 120) });
    return { ok: false, reason: "Could not reach the payment provider. Nothing was charged." };
  }
}

/**
 * Confirming it landed.
 *
 * Called from the `setup_intent.succeeded` webhook rather than from the
 * browser. A client saying "it worked" is a client that can be wrong,
 * offline, or closed mid-redirect — and a trial that converts on the
 * strength of that is a customer we cannot actually charge.
 */
export async function cardAttached(customerId: string, paymentMethodId: string) {
  const db = crossTenant("global-key");

  const sub = await db.subscription.findFirst({
    where: { providerCustomerId: customerId },
    select: { id: true, orgId: true, status: true, trialEndsAt: true },
  });
  if (!sub) {
    log.warn("card attached to an unknown customer", {}, { customerId });
    return;
  }

  await db.subscription.update({
    where: { id: sub.id },
    data: { providerSubId: paymentMethodId },
  });

  /**
   * A card added mid-trial does not end the trial early.
   *
   * They still get the days they were promised. Charging on the day the
   * card arrives would be technically defensible and would be the last
   * time that brokerage recommended us to anybody.
   */
  await audit(db, sub.orgId, {
    actorId: null,
    action: "billing.card_attached",
    entity: "Subscription",
    entityId: sub.id,
    after: { trialContinues: sub.status === "TRIALING" },
  });

  log.info("card attached", { orgId: sub.orgId }, { stillTrialing: sub.status === "TRIALING" });
}

/**
 * What the settings page shows. Never a card number, because we do not
 * have one — the last four and the brand come from Stripe on demand.
 */
export async function cardSummary(orgId: string) {
  const db = crossTenant("global-key");
  const sub = await db.subscription.findUnique({
    where: { orgId },
    select: { providerCustomerId: true, providerSubId: true, status: true, trialEndsAt: true },
  });
  if (!sub?.providerSubId) {
    return { hasCard: false, status: sub?.status ?? null, trialEndsAt: sub?.trialEndsAt ?? null };
  }
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/payment_methods/${sub.providerSubId}`,
      {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
        signal: AbortSignal.timeout(10_000),
      }
    );
    if (!res.ok) return { hasCard: true, status: sub.status, trialEndsAt: sub.trialEndsAt };
    const pm = await res.json();
    return {
      hasCard: true,
      brand: pm.card?.brand as string | undefined,
      last4: pm.card?.last4 as string | undefined,
      expires: pm.card ? `${pm.card.exp_month}/${pm.card.exp_year}` : undefined,
      status: sub.status,
      trialEndsAt: sub.trialEndsAt,
    };
  } catch {
    // A settings page that fails because Stripe is slow is a settings
    // page nobody can use to fix their billing.
    return { hasCard: true, status: sub.status, trialEndsAt: sub.trialEndsAt };
  }
}

/**
 * The card went away.
 *
 * Expired, cancelled by the bank, or removed by the brokerage. **Not
 * treated as a cancellation** — a brokerage whose card expired has not
 * left, and locking them out over an expiry date is how you lose a
 * customer who was perfectly happy.
 *
 * The dunning ladder handles it from here: fourteen days and three
 * emails before anything stops, and the assistant is the last thing to
 * go rather than the first.
 */
export async function cardDetached(customerId: string) {
  const db = crossTenant("global-key");
  const sub = await db.subscription.findFirst({
    where: { providerCustomerId: customerId },
    select: { id: true, orgId: true, status: true },
  });
  if (!sub) return;

  await db.subscription.update({
    where: { id: sub.id },
    data: { providerSubId: null },
  });

  await audit(db, sub.orgId, {
    actorId: null,
    action: "billing.card_removed",
    entity: "Subscription",
    entityId: sub.id,
  });

  log.warn("card removed", { orgId: sub.orgId }, { status: sub.status });
}
