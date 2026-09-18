import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";
import { crossTenant } from "@/server/db/client";

/**
 * Somewhere to put a token.
 *
 * `readSecret` read `process.env["SECRET_" + ref]` and threw otherwise,
 * and **nothing anywhere could write a secret**. The consequences were
 * not subtle:
 *
 *   - Connecting a brokerage's WhatsApp number meant an owner reading a
 *     reference off a settings screen, somebody setting an environment
 *     variable, and a redeploy. Per brokerage, per channel. The connect
 *     form says so in a comment — it deliberately refuses the token,
 *     because there was nowhere to put it.
 *   - A mailbox token had nowhere to go at all, which is why
 *     `EmailAccount` has never had a row and `email.sync` has swept an
 *     empty list every half hour since it was written.
 *   - Portal feed credentials, the same.
 *
 * ## "Tokens never go into Postgres" — and they still do not
 *
 * `lib/secrets.ts` opens with that rule and the reasoning behind it: a
 * database dump is the likeliest thing to leak, and it must not carry
 * anything capable of messaging a customer's clients. **That rule is
 * intact.** What goes into Postgres is ciphertext sealed with a key that
 * lives only in the environment; a dump without `SECRETS_KEY` is a
 * column of noise.
 *
 * What changed is the honest reading of the alternative. "We never store
 * tokens" was, in practice, "we cannot onboard a customer without a
 * deploy", and an unprovisionable product is not a more secure one.
 *
 * ## AES-256-GCM, and why the tag matters
 *
 * GCM is authenticated: decryption fails loudly if the ciphertext has
 * been altered, rather than returning plausible rubbish that then gets
 * sent to Meta as a bearer token. The nonce and tag are stored beside
 * the ciphertext because neither is secret and neither is useful without
 * the key.
 *
 * A fresh 12-byte nonce per write. Reusing one under the same key is the
 * single way to break GCM badly, so it is generated at the point of
 * encryption and never derived from anything.
 *
 * ## What this is not
 *
 * Not a KMS. There is one master key, held in the environment, and it
 * protects everything. A real deployment should move to AWS Secrets
 * Manager, Vault or Doppler — and the point of `readSecret` being the
 * only reader is that doing so touches this file and nothing else.
 * `keyVersion` is stored so a rotation has something to rotate *from*.
 */

const ALGO = "aes-256-gcm";

/** The current master key's version. Bump when a new key is introduced. */
export const KEY_VERSION = 1;

/**
 * Resolved per call, not at module load.
 *
 * Same reasoning as `files/storage.ts`: a module-level constant is read
 * when the bundle is first imported, which on a serverless platform can
 * be before the environment is fully populated — and the failure mode is
 * the whole feature being permanently unconfigured for the life of that
 * instance rather than for one request.
 */
function masterKey(): Buffer | null {
  const raw = process.env.SECRETS_KEY?.trim();
  if (!raw) return null;

  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    // Loudly, and without printing the value. A 31-byte key is a typo,
    // and the failure it would otherwise produce is "cannot decrypt"
    // long after the secret was written.
    throw new Error(
      `SECRETS_KEY must be 32 bytes of base64 (got ${key.length}). ` +
      `Generate one with: openssl rand -base64 32`
    );
  }
  return key;
}

export const NOT_CONFIGURED =
  "SECRETS_KEY is not set, so tokens cannot be stored. Generate one with " +
  "`openssl rand -base64 32` and set it in the environment. Losing it means " +
  "every connected channel and mailbox has to be reconnected.";

export type Sealed = { ciphertext: string; iv: string; tag: string; keyVersion: number };

export function seal(plaintext: string): Sealed {
  const key = masterKey();
  if (!key) throw new Error(NOT_CONFIGURED);

  const iv = randomBytes(12);
  const c = createCipheriv(ALGO, key, iv);
  const ciphertext = Buffer.concat([c.update(plaintext, "utf8"), c.final()]);
  return {
    ciphertext: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: c.getAuthTag().toString("base64"),
    keyVersion: KEY_VERSION,
  };
}

export function open(s: Sealed): string {
  const key = masterKey();
  if (!key) throw new Error(NOT_CONFIGURED);
  if (s.keyVersion !== KEY_VERSION) {
    throw new Error(
      `Secret was sealed with key version ${s.keyVersion} and this deployment ` +
      `has version ${KEY_VERSION}. Re-wrap it before rotating the key away.`
    );
  }

  const d = createDecipheriv(ALGO, key, Buffer.from(s.iv, "base64"));
  d.setAuthTag(Buffer.from(s.tag, "base64"));
  return Buffer.concat([
    d.update(Buffer.from(s.ciphertext, "base64")),
    d.final(),
  ]).toString("utf8");
}

/**
 * Store one, replacing whatever was there.
 *
 * `crossTenant("global-key")` because a ref is globally unique and the
 * reader is handed nothing else — the same reason the channel lookup in
 * `secrets.ts` uses it. The `orgId` is written so an erasure can find a
 * brokerage's secrets and so row-level security has something to hold.
 */
export async function writeSecret(args: { orgId: string; ref: string; value: string }) {
  const sealed = seal(args.value);
  await crossTenant("global-key").secret.upsert({
    where: { ref: args.ref },
    create: { orgId: args.orgId, ref: args.ref, ...sealed },
    // `rotatedAt` only on replacement, so a screen can say how old a
    // token is without ever reading it.
    update: { ...sealed, rotatedAt: new Date() },
  });
}

/** Null rather than throwing, so the caller decides what absence means. */
export async function fetchSecret(ref: string): Promise<string | null> {
  const row = await crossTenant("global-key").secret.findUnique({
    where: { ref },
    select: { ciphertext: true, iv: true, tag: true, keyVersion: true },
  });
  return row ? open(row) : null;
}

/**
 * Forget one.
 *
 * Deleted rather than blanked. Everything else in this product scrubs
 * rather than deletes so an audit trail survives — a secret is the one
 * thing where the row itself is the liability, and there is nothing in
 * it worth auditing that the `Channel` or `EmailAccount` beside it does
 * not already record.
 */
export async function forgetSecret(ref: string) {
  await crossTenant("global-key").secret.deleteMany({ where: { ref } });
}

/** Whether a token could be stored at all, for a screen to say so. */
export function vaultReady() {
  try {
    return masterKey() !== null;
  } catch {
    // A malformed key is not ready either, and the screen should say
    // "not configured" rather than crash rendering.
    return false;
  }
}

/**
 * Compare two secrets without leaking which byte differed.
 *
 * Used by the reconnect path to tell "they pasted the same token again"
 * from "they pasted a new one", which decides whether `rotatedAt` moves.
 */
export function sameSecret(a: string, b: string) {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
