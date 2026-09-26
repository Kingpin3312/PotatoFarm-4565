import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Time-based one-time codes (RFC 6238), the six digits an authenticator
 * app shows — Google Authenticator, Microsoft Authenticator, 1Password,
 * Authy all speak this.
 *
 * Written here rather than taken from a package because it is forty
 * lines of HMAC over a counter, and the package would be the only thing
 * standing between a stolen magic link and an owner's client book.
 *
 * Pure: no database, no clock of its own. The caller passes the time and
 * the last step it accepted, so the tests can be exact and replay is the
 * caller's to record.
 */

const STEP_SECONDS = 30;
const DIGITS = 6;
const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

export function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += B32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch);
    if (i < 0) throw new Error("Not a base32 key.");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** 160 bits, the size RFC 4226 recommends, as the key an app is given. */
export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

/** RFC 4226's HOTP: HMAC-SHA1 of the counter, dynamically truncated. */
export function hotp(key: Buffer, counter: number, digits = DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(msg).digest();
  const off = h[h.length - 1]! & 0xf;
  const bin = ((h[off]! & 0x7f) << 24) | (h[off + 1]! << 16) | (h[off + 2]! << 8) | h[off + 3]!;
  return String(bin % 10 ** digits).padStart(digits, "0");
}

export function stepAt(now: Date): number {
  return Math.floor(now.getTime() / 1000 / STEP_SECONDS);
}

export function totp(secret: string, now: Date, digits = DIGITS): string {
  return hotp(base32Decode(secret), stepAt(now), digits);
}

/**
 * The step the code belongs to, or null.
 *
 * One step either side is accepted, because a phone's clock drifts and a
 * person reads the code, switches app and types it — a strict window
 * refuses a correct code about one time in six. Anything at or before
 * `lastStep` is refused: a code seen over a shoulder, or replayed from a
 * phishing page, has already been used.
 */
export function checkTotp(secret: string, code: string, now: Date, lastStep: number | null): number | null {
  const typed = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(typed)) return null;
  const key = base32Decode(secret);
  const here = stepAt(now);
  for (const step of [here - 1, here, here + 1]) {
    if (lastStep !== null && step <= lastStep) continue;
    const want = Buffer.from(hotp(key, step));
    if (timingSafeEqual(want, Buffer.from(typed))) return step;
  }
  return null;
}

/** What the authenticator app scans or is given. */
export function otpauthUri(secret: string, account: string, issuer = "PotatoFarm"): string {
  const label = encodeURIComponent(`${issuer}:${account}`);
  return `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
}

/**
 * Ten recovery codes, for the day the phone is lost.
 *
 * Shown once; only their hashes are stored. Unambiguous letters and
 * digits in two groups of four, so one read aloud over the phone is not
 * mistyped. A fast hash is enough: each is 40 random bits and they are
 * only checked behind the sign-in rate limit.
 */
const RC = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
export function newRecoveryCodes(n = 10): string[] {
  return Array.from({ length: n }, () => {
    const b = randomBytes(8);
    const s = [...b].map((x) => RC[x % RC.length]).join("");
    return `${s.slice(0, 4)}-${s.slice(4, 8)}`;
  });
}

export function hashRecovery(code: string): string {
  return createHash("sha256").update(code.toUpperCase().replace(/[^A-Z0-9]/g, "")).digest("hex");
}
