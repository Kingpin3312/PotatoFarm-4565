/**
 * Per-IP rate limiting.
 *
 * The in-memory fallback is per-instance, so on serverless it slows an
 * attacker down rather than stopping them. Fine for a marketing form. Set
 * the Upstash variables and it switches to shared state automatically.
 */
type Bucket = { count: number; resetAt: number };
const memory = new Map<string, Bucket>();

const WINDOW_MS = 60_000;
const MAX_PER_WINDOW = 5;

export async function rateLimit(key: string) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (url && token) {
    try {
      const res = await fetch(`${url}/incr/ratelimit:${encodeURIComponent(key)}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(3000),
      });
      const { result } = (await res.json()) as { result: number };
      if (result === 1) {
        await fetch(`${url}/expire/ratelimit:${encodeURIComponent(key)}/60`, {
          headers: { Authorization: `Bearer ${token}` },
        });
      }
      return { ok: result <= MAX_PER_WINDOW, remaining: Math.max(0, MAX_PER_WINDOW - result) };
    } catch {
      // Redis down: fall through to memory rather than blocking every lead.
    }
  }

  const now = Date.now();

  // Evict expired buckets before doing anything else. Without this the Map
  // grows with every unique IP and is never cleared — an unbounded leak,
  // and a cheap one for an attacker to grow deliberately.
  if (memory.size > 5_000) {
    for (const [k, v] of memory) if (now > v.resetAt) memory.delete(k);
  }

  const b = memory.get(key);
  if (!b || now > b.resetAt) {
    memory.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return { ok: true, remaining: MAX_PER_WINDOW - 1 };
  }
  b.count += 1;
  return { ok: b.count <= MAX_PER_WINDOW, remaining: Math.max(0, MAX_PER_WINDOW - b.count) };
}
