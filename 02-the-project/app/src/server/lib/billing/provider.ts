/**
 * Payment provider.
 *
 * **No card data ever reaches this system.** Not the number, not the CVV,
 * not a truncated PAN. The provider holds the card and gives us a token;
 * we store the token. That keeps the whole product outside PCI scope,
 * which is not a technicality — it is the difference between an annual
 * questionnaire and an audit.
 *
 * Stripe first because it works in the UAE and the tooling is good. Telr,
 * PayTabs and Network International are the local alternatives and some
 * brokerages will prefer one — which is why everything provider-specific
 * is behind this interface, and nothing above it knows which is in use.
 */

export type ChargeResult =
  | { ok: true; providerRef: string }
  | { ok: false; retryable: boolean; reason: string };

export type Provider = {
  name: string;
  /** Charge a stored payment method for an already-issued invoice. */
  charge(args: {
    customerId: string;
    amountFils: bigint;
    currency: string;
    invoiceNumber: string;
    /** Sent to the provider so a retry cannot double-charge at their end either. */
    idempotencyKey: string;
  }): Promise<ChargeResult>;

  /** Verify a webhook against the signing secret. Raw body, never parsed. */
  verify(rawBody: string, signature: string | null, secret: string): boolean;

  /** Ask the provider what it thinks the state is. Used by reconciliation. */
  fetchStatus(providerRef: string): Promise<"paid" | "failed" | "pending" | "unknown">;
};

export const stripe: Provider = {
  name: "stripe",

  async charge({ customerId, amountFils, currency, invoiceNumber, idempotencyKey }) {
    try {
      const res = await fetch("https://api.stripe.com/v1/payment_intents", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
          // The provider's own idempotency, on top of ours. Two layers
          // because a duplicate charge is the one mistake a customer
          // never forgets.
          "Idempotency-Key": idempotencyKey,
        },
        body: new URLSearchParams({
          amount: String(amountFils),
          currency: currency.toLowerCase(),
          customer: customerId,
          confirm: "true",
          off_session: "true",
          description: invoiceNumber,
        }),
        signal: AbortSignal.timeout(15_000),
      });

      const data = await res.json();

      if (!res.ok) {
        const code = data?.error?.code ?? "";
        // A declined card is not a retryable failure. Retrying it just
        // adds decline records to the customer's bank statement and can
        // get the card flagged.
        const permanent = ["card_declined", "expired_card", "incorrect_cvc", "insufficient_funds"];
        return {
          ok: false,
          retryable: !permanent.includes(code),
          reason: data?.error?.message ?? `Stripe ${res.status}`,
        };
      }

      if (data.status === "requires_action") {
        // 3-D Secure. An off-session charge cannot complete it, so the
        // customer has to come back and authorise — which means telling
        // them, not silently retrying forever.
        return { ok: false, retryable: false, reason: "The bank wants the cardholder to authorise this payment." };
      }

      return { ok: true, providerRef: data.id };
    } catch (err) {
      // Network failure. Retryable, and safe to retry because of the
      // idempotency key above.
      return { ok: false, retryable: true, reason: String(err).slice(0, 200) };
    }
  },

  verify(rawBody, signature, secret) {
    if (!signature) return false;
    const parts = Object.fromEntries(
      signature.split(",").map((p) => p.split("=") as [string, string])
    );
    if (!parts.t || !parts.v1) return false;

    // Reject anything older than five minutes, or a captured webhook can
    // be replayed indefinitely.
    if (Math.abs(Date.now() / 1000 - Number(parts.t)) > 300) return false;

    const { createHmac, timingSafeEqual } = require("node:crypto");
    const expected = createHmac("sha256", secret)
      .update(`${parts.t}.${rawBody}`, "utf8")
      .digest("hex");

    return parts.v1.length === expected.length &&
      timingSafeEqual(Buffer.from(parts.v1), Buffer.from(expected));
  },

  async fetchStatus(providerRef) {
    try {
      const res = await fetch(`https://api.stripe.com/v1/payment_intents/${providerRef}`, {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) return "unknown";
      const data = await res.json();
      if (data.status === "succeeded") return "paid";
      if (data.status === "canceled" || data.last_payment_error) return "failed";
      return "pending";
    } catch {
      return "unknown";
    }
  },
};
