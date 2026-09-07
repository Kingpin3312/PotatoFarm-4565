import type { NextRequest } from "next/server";

import { handlers } from "@/server/auth/config";
import { keysFor, limitAll } from "@/server/lib/ratelimit";
import { callerIp } from "@/server/lib/website/cors";

/**
 * The NextAuth endpoint.
 *
 * `config.ts` has always exported `handlers`, and nothing had ever
 * mounted them. Without this file `/api/auth/*` does not exist, which
 * means the magic link in a sign-in email resolves to a 404 and there is
 * no way whatsoever to get a session — the sign-in page, the callback,
 * the session lookup and sign-out are all served from here.
 *
 * `runtime = "nodejs"` because the Prisma adapter writes User, Account
 * and Session rows, and Prisma does not run on the edge runtime.
 */
export const runtime = "nodejs";

export const GET = handlers.GET;

/**
 * The sign-in POST is throttled here, and it is the only reason this
 * file is more than one line.
 *
 * ## What was wrong
 *
 * `ratelimit.ts` has carried a rule called `auth.magicLink` — five
 * attempts in fifteen minutes, twenty a day — since it was written.
 * **Nothing ever invoked it.** `billing.signup`, `org.acceptInvite`,
 * `website.demo`, `website.subscribe` and `voice.transcribe` all call
 * `limitAll`; the one guarding the front door did not.
 *
 * So `POST /api/auth/signin/resend` accepted unlimited requests, and
 * every one of them sent a real email through Resend from the verified
 * sending domain. Three consequences, in order of how much they cost:
 *
 *   1. **Anyone could bomb any inbox.** Type a competitor's address,
 *      loop the request, and their mail fills with our sign-in links
 *      from our domain. That is a deliverability and reputation
 *      incident, and the domain is the asset — once it is on a
 *      blocklist, invoices and vendor reports stop arriving too.
 *   2. **It costs money per send**, billed to us, at whatever rate the
 *      attacker chooses.
 *   3. It is free enumeration pressure on the account table.
 *
 * This is the same shape CLAUDE.md keeps naming — a declared thing that
 * changes no behaviour — and the front door is the worst place to find
 * it.
 *
 * ## Why here rather than in `sendVerificationRequest`
 *
 * Overriding the provider's sender means reimplementing the email —
 * subject, HTML, the link — on the one path where being wrong locks
 * every customer out of the product. Throttling in front of the handler
 * needs none of that: the check runs, and NextAuth is left to do
 * exactly what it did before.
 *
 * Only the sign-in submission is throttled. The callback is a GET
 * carrying a token NextAuth generated, and rate-limiting the click in
 * an email punishes the person who did nothing wrong.
 *
 * The page calls `signIn(..., { redirect: false })`, so a 429 arrives as
 * `res.error` and it renders the failure state rather than a raw status
 * page.
 */
export async function POST(req: NextRequest) {
  if (new URL(req.url).pathname.endsWith("/signin/resend")) {
    /**
     * Two budgets, not one, and the difference was found by testing.
     *
     * The obvious version passes both keys to a single rule:
     *
     *     limitAll("auth.magicLink", keysFor({ ip, email }))
     *
     * That was written, run against a live server, and **it locks a
     * brokerage out of its own product.** An office shares one NAT
     * address, so five sign-ins in fifteen minutes — one person
     * retrying plus two colleagues — spends the window for everybody;
     * `agent2@` and `agent3@` were both refused after an unrelated
     * address had used it. At nine in the morning that is a total
     * sign-in outage caused by a security fix.
     *
     * So the address gets the tight budget (it is the inbox being
     * protected) and the caller gets a loose one (it only needs to stop
     * a spray across many addresses). See `ratelimit.ts`.
     *
     * The body is read from a clone: consuming the original stream
     * leaves NextAuth with nothing to parse, which turns a rate-limit
     * feature into a different total outage.
     */
    let email: string | null = null;
    try {
      const value = (await req.clone().formData()).get("email");
      email = typeof value === "string" ? value.trim().toLowerCase() : null;
    } catch {
      // Not a form post. Fall through to the caller budget rather than
      // refusing something this file does not understand.
    }

    const ip = callerIp(req);
    const verdict = email
      ? await limitAll("auth.magicLink", keysFor({ email }))
      : { ok: true as const };
    const byCaller = verdict.ok
      ? await limitAll("auth.magicLinkIp", keysFor({ ip }))
      : verdict;

    if (!byCaller.ok) {
      return Response.json(
        { error: "RateLimited" },
        { status: 429, headers: { "retry-after": String(byCaller.retryAfterSeconds) } },
      );
    }
  }

  return handlers.POST(req);
}
