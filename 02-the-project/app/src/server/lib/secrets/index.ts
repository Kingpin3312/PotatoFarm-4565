import { crossTenant } from "@/server/db/client";
import { fetchSecret } from "./vault";

/**
 * Channel credentials.
 *
 * Access tokens are never stored in Postgres. `Channel.secretRef` is a
 * pointer into the secrets manager, so a database dump — the most likely
 * thing to leak — contains no keys capable of sending messages as a
 * customer's brokerage.
 *
 * Cached briefly in memory because the inbox reads this on every send and
 * a secrets round trip per message is a latency tax for no benefit.
 */
type Creds = { phoneNumberId: string; accessToken: string };

const cache = new Map<string, { value: Creds; expiresAt: number }>();
const TTL_MS = 5 * 60 * 1000;

export async function getChannelCredentials(orgId: string, channelId: string): Promise<Creds> {
  const key = `${orgId}:${channelId}`;
  const hit = cache.get(key);
  if (hit && hit.expiresAt > Date.now()) return hit.value;

  const channel = await crossTenant("global-key").channel.findFirst({
    where: { id: channelId, orgId, active: true },
    select: { identifier: true, secretRef: true, type: true },
  });
  /**
   * Every channel type reaches this, so the message cannot name one.
   *
   * It read "This WhatsApp number isn't connected." and surfaced on a
   * Facebook Page that had been connected perfectly — sending whoever
   * read the log looking at WhatsApp while Meta lead ads were the thing
   * failing. The type is in the row; say it.
   */
  if (!channel?.secretRef) {
    throw new Error(
      `No stored credential for this ${channel?.type === "META_LEAD_ADS" ? "Facebook Page" : "channel"}. ` +
      "Reconnect it in Settings → Channels.",
    );
  }

  const accessToken = await readSecret(channel.secretRef);
  const value = { phoneNumberId: channel.identifier, accessToken };

  cache.set(key, { value, expiresAt: Date.now() + TTL_MS });
  return value;
}

/** Swap for AWS Secrets Manager, Vault or Doppler. The call site doesn't change. */
/**
 * Read one secret by reference.
 *
 * Exported because mailbox tokens need the same path WhatsApp
 * credentials use. A second way to fetch a secret is a second way to
 * leak one — there is one reader and everything goes through it.
 */
export async function readSecret(ref: string): Promise<string> {
  /**
   * The environment first, then the store.
   *
   * Not the other way round, for two reasons. An existing deployment
   * that already sets `SECRET_<ref>` keeps working untouched — this
   * change must not disconnect a channel that was working yesterday.
   * And it leaves an escape hatch: if the vault is misconfigured or a
   * key is lost, a value can be put back by hand without a database
   * write, which is the position somebody will be in at 2am one day.
   */
  const local = process.env[`SECRET_${ref}`];
  if (local) return local;

  const stored = await fetchSecret(ref);
  if (stored) return stored;

  throw new Error(
    `Secret ${ref} not resolved. Either it was never stored, or SECRETS_KEY ` +
    `has changed since it was — in which case it has to be reconnected.`
  );
}

export { writeSecret, forgetSecret, vaultReady, vaultProblem, NOT_CONFIGURED } from "./vault";

/** Called when a channel is disconnected or rotated. */
export function invalidate(orgId: string, channelId: string) {
  cache.delete(`${orgId}:${channelId}`);
}
