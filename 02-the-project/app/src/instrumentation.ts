/**
 * What is not configured, said once, at boot.
 *
 * This product's whole argument is that the failures that matter are
 * silent — a feed stops delivering, a token expires, a cron stops firing,
 * and nothing errors, things just stop happening. The application had
 * exactly that shape itself:
 *
 *   `process.env.ANTHROPIC_API_KEY!` goes into a header. Unset, it sends
 *   `undefined`, Anthropic returns 401, `respond()` catches it and hands
 *   the conversation to a person as "low confidence". A lead gets no
 *   reply, the log says generation failed, and nobody learns that the
 *   key was simply never set.
 *
 *   `STRIPE_SECRET_KEY` the same: every charge fails as an API error
 *   rather than as a missing key.
 *
 *   `SECRET_<ref>` the same, one channel at a time, the first time an
 *   agent tries to send a file.
 *
 * So: one report at startup naming what is absent and what stops working
 * because of it. It does not throw. A brokerage running without Stripe
 * during a pilot is a legitimate state, and refusing to boot over it
 * would be worse than saying so.
 *
 * Next calls `register()` once per server instance.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const missing: string[] = [];
  const check = (name: string, consequence: string) => {
    if (!process.env[name]?.trim()) missing.push(`${name} — ${consequence}`);
  };

  check("DATABASE_URL", "nothing can read or write at all");
  check("AUTH_SECRET", "NextAuth will refuse to start; nobody can sign in");
  check("RESEND_API_KEY", "no sign-in link is delivered, so nobody can get in");
  check("ANTHROPIC_API_KEY", "the assistant hands every conversation to a person");
  check("WHATSAPP_APP_SECRET", "inbound WhatsApp webhooks are all rejected as unsigned");
  check("STRIPE_SECRET_KEY", "no card can be taken and no invoice settled");
  check("CRON_SECRET", "every scheduled job refuses to run");
  check("SEAT_PRICE_FILS", "sign-up refuses to create a subscription");
  check("S3_BUCKET", "no file can be uploaded — no brochure, no floor plan, no KYC document");
  check("TRANSCRIBE_API_KEY", "the Speak button does nothing on any iPhone");

  /**
   * Not in the list above, because it is a warning rather than an
   * absence: without it the scoped and unscoped connections are the same
   * role, and if that role owns the tables then row-level security is
   * enforcing nothing at all.
   */
  if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL_UNSCOPED?.trim()) {
    console.warn(
      "[config] DATABASE_URL_UNSCOPED is not set. Scoped and unscoped queries share one " +
        "connection — if it owns the tables or has BYPASSRLS, tenant isolation is not " +
        "being enforced by the database. See src/server/db/rls.sql."
    );
  }

  if (missing.length === 0) {
    console.info("[config] every external service is configured");
    return;
  }

  console.warn(
    `[config] ${missing.length} service${missing.length === 1 ? " is" : "s are"} not ` +
      `configured. Each one fails quietly at the moment it is first needed:\n` +
      missing.map((m) => `  - ${m}`).join("\n") +
      `\n  See .env.example.`
  );
}
