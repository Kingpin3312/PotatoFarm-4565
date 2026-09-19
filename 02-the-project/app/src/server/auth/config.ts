import NextAuth from "next-auth";
import Resend from "next-auth/providers/resend";
import { PrismaAdapter } from "@auth/prisma-adapter";
import { crossTenant } from "@/server/db/client";

/**
 * Authentication.
 *
 * **No passwords.** Sign-in is a one-time link to a work email address.
 * That is a deliberate trade, and the reasoning is worth writing down
 * because someone will eventually ask for a password field:
 *
 *   - There is no password to store, so there is no hash to leak, no
 *     rotation policy to write, and nothing for a brokerage to reuse from
 *     another breach. The security page can say "we do not store
 *     passwords" and mean it.
 *   - Credential stuffing, the single most common attack on a product
 *     like this, has nothing to work with.
 *   - Agents already live in their inbox and on their phone. Adding a
 *     password adds a thing to forget, not a thing to protect.
 *
 * What it costs: sign-in depends on email delivery. Mitigated by verifying
 * the sending domain properly, and by the WhatsApp fallback below when
 * that lands.
 *
 * When a brokerage large enough to demand SAML turns up, add it as another
 * provider. The adapter and session model do not change.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  /**
   * `crossTenant("pre-tenant")`, not a bare `rootDb`.
   *
   * The adapter reads and writes User, Account and Session before any
   * brokerage is known, so it genuinely cannot be tenant-scoped — which
   * is exactly the case "pre-tenant" exists to name. The identifier used
   * here was `rootDb`, which was never imported and would in any case
   * have failed the bare-rootDb check in crm-audit.py.
   */
  adapter: PrismaAdapter(crossTenant("pre-tenant")),

  session: {
    /**
     * Database sessions, not JWTs.
     *
     * A JWT cannot be revoked before it expires. In a product where an
     * owner sacks an agent and expects them out of the client list
     * immediately, that is the wrong default — and "log out everywhere"
     * has to actually work. Database sessions cost a query; they are
     * worth it here.
     */
    strategy: "database",
    maxAge: 30 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
  },

  providers: [
    Resend({
      /**
       * Passed explicitly, because the inferred name is not ours.
       *
       * Auth.js derives a provider's key from `AUTH_<ID>_KEY`
       * (`@auth/core/lib/utils/env.js`), which for this provider is
       * `AUTH_RESEND_KEY`. Every other part of this project documents
       * and reads `RESEND_API_KEY` — `lib/mail.ts` does, and
       * `.env.example` calls it **"the only way into the product"**.
       *
       * Those were different variables, and nothing connected them. An
       * operator who set the documented key exactly as instructed left
       * this provider with `apiKey: undefined`, so every sign-in email
       * was sent as `Authorization: Bearer undefined`, Resend answered
       * 401, and the provider threw — on the one path a new customer
       * cannot route around. It could not be caught by checking that
       * `RESEND_API_KEY` was set, because it was.
       *
       * So the documented name is authoritative and there is **one key
       * for the whole product**, which `check:preflight` now asserts.
       *
       * This deliberately does not also accept `AUTH_RESEND_KEY`. That
       * was the first fix, and `crm-audit.py` rejected it: an env var
       * read in code and absent from `.env.example` is one nobody
       * deploying this will know to set. Documenting it instead would
       * have put two names for one Resend account in front of the
       * operator — the same confusion this comment exists to end, moved
       * one file along. One name, asserted.
       */
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.MAIL_FROM,
      // 10 minutes. Long enough to switch to a phone, short enough that a
      // forwarded email is not a standing key.
      maxAge: 10 * 60,
    }),
  ],

  pages: {
    signIn: "/sign-in",
    verifyRequest: "/sign-in/check-your-email",
    error: "/sign-in/error",
  },

  callbacks: {
    async session({ session, user }) {
      session.user.id = user.id;
      return session;
    },
  },

  events: {
    async signIn({ user }) {
      await crossTenant("pre-tenant").user.update({
        where: { id: user.id },
        data: { lastSeenAt: new Date() },
      });
    },
  },

  // Cookies are host-only and same-site. `lax` rather than `strict` so a
  // magic link opened from an email client still lands signed in — with
  // `strict` the first request after the redirect arrives without the
  // cookie and the user is bounced back to sign-in, which looks broken.
  useSecureCookies: process.env.NODE_ENV === "production",
  trustHost: true,
});
