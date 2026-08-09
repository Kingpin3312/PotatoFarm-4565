import { crossTenant } from "@/server/db/client";
import { log } from "@/lib/log";

/**
 * Rate limiting.
 *
 * The endpoint an unauthenticated stranger can use to write to the
 * database is `billing.signup`. It creates an organisation, a user, a
 * membership and a subscription.
 *
 * Left open, one script fills the database with brokerages overnight,
 * every trial sweep runs against them daily, and the invoicing job
 * starts generating documents for companies that do not exist. That is
 * not a security incident so much as a slow, embarrassing mess that
 * somebody has to clean up by hand.
 *
 * Database-backed rather than in-memory, because in-memory means "per
 * serverless instance", which means no limit at all on the platform this
 * actually deploys to.
 */

export type Verdict = { ok: true } | { ok: false; retryAfterSeconds: number };

/**
 * Two windows, deliberately.
 *
 * A short one stops a burst. A long one stops a patient script that
 * sends one request a minute all night — which is what somebody does
 * after they hit the short limit once.
 */
const RULES: Record<string, { short: [number, number]; long: [number, number] }> = {
  // [max attempts, window seconds]
  "billing.signup":  { short: [3, 600],  long: [10, 86_400] },
  "org.acceptInvite": { short: [5, 300],  long: [30, 86_400] },
  "auth.magicLink":  { short: [5, 900],  long: [20, 86_400] },

  /**
   * The two public marketing forms. Looser than the rest, because the
   * cost of a false positive here is a brokerage owner who wanted a call
   * and was told to come back later.
   *
   * They each send email, which is the thing worth protecting: an
   * unthrottled form is a way to have Resend send abuse from a verified
   * domain, and that ends with the domain's reputation, not ours.
   */
  "website.demo":      { short: [3, 300], long: [15, 86_400] },
  "website.subscribe": { short: [3, 300], long: [15, 86_400] },

  /**
   * Voice notes. Looser than the forms, because an agent legitimately
   * dictates several in a row walking out of a building — but capped,
   * because every call costs money and the endpoint takes an upload
   * from anybody with a session.
   */
  "voice.transcribe":  { short: [20, 300], long: [200, 86_400] },
};

export async function limit(action: string, key: string): Promise<Verdict> {
  const rule = RULES[action];
  if (!rule) return { ok: true };

  const db = crossTenant("pre-tenant");
  const now = new Date();

  for (const [max, seconds] of [rule.short, rule.long]) {
    const since = new Date(now.getTime() - seconds * 1000);
    const count = await db.rateLimitHit.count({
      where: { action, key, at: { gte: since } },
    });
    if (count >= max) {
      log.warn("rate limit hit", {}, { action, count, windowSeconds: seconds });
      return { ok: false, retryAfterSeconds: seconds };
    }
  }

  await db.rateLimitHit.create({ data: { action, key, at: now } });
  return { ok: true };
}

/**
 * What the key should be, and why it is not just the IP.
 *
 * An IP alone punishes an entire office behind one NAT — a brokerage
 * where two partners sign up from adjacent desks looks like an attack.
 * An email alone is trivially varied.
 *
 * Both, checked independently, so a single actor is caught by whichever
 * they did not think to change.
 */
export function keysFor(args: { ip?: string | null; email?: string | null }) {
  return [args.ip && `ip:${args.ip}`, args.email && `email:${args.email.toLowerCase()}`]
    .filter((k): k is string => Boolean(k));
}

export async function limitAll(action: string, keys: string[]): Promise<Verdict> {
  for (const k of keys) {
    const v = await limit(action, k);
    if (!v.ok) return v;
  }
  return { ok: true };
}

/**
 * Old hits are swept daily. Without it this table grows forever and is
 * the first thing to become the largest in the database — which is a
 * silly way to run out of disk.
 */
export async function sweepRateLimits() {
  const cutoff = new Date(Date.now() - 2 * 86_400_000);
  const { count } = await crossTenant("sweep").rateLimitHit.deleteMany({
    where: { at: { lt: cutoff } },
  });
  return { removed: count };
}
