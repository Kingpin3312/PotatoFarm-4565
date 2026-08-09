/**
 * Three layers, cheapest first. Most junk never reaches the third.
 *
 * Cloudflare Turnstile rather than reCAPTCHA: reCAPTCHA sets Google
 * cookies before anyone has consented, which is a real problem given how
 * much European traffic this market gets.
 */

/** 1. Honeypot — a field hidden from people, irresistible to bots. */
export function trippedHoneypot(website?: string) {
  return typeof website === "string" && website.length > 0;
}

/**
 * 2. Timing. Nobody fills in five fields in under three seconds. We reject
 * implausibly fast, never slow — someone who wanders off mid-form and comes
 * back an hour later is a real lead, not a bot.
 */
export function tooFast(startedAt?: number, minMs = 3000) {
  if (!startedAt) return false;
  const elapsed = Date.now() - startedAt;
  return elapsed >= 0 && elapsed < minMs;
}

/** 3. Turnstile. Only reached by submissions that pass the first two. */
export async function verifyTurnstile(token: string | undefined, ip: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY;

  // No key means Turnstile is off. Say so loudly in the log rather than
  // silently pretending the check passed.
  if (!secret) {
    console.warn("[spam] TURNSTILE_SECRET_KEY not set - captcha check skipped");
    return true;
  }
  if (!token) return false;

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    });
    const data = (await res.json()) as { success: boolean };
    return data.success === true;
  } catch (err) {
    // If Cloudflare is unreachable we let it through. Losing a real lead
    // costs more than the occasional bot, and two layers are still standing.
    console.error("[spam] Turnstile unreachable, allowing through:", err);
    return true;
  }
}
