import { crossTenant } from "@/server/db/client";

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
    select: { identifier: true, secretRef: true },
  });
  if (!channel?.secretRef) throw new Error("This WhatsApp number isn't connected.");

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
  const local = process.env[`SECRET_${ref}`];
  if (local) return local;
  throw new Error(`Secret ${ref} not resolved. Wire up the secrets provider.`);
}

/** Called when a channel is disconnected or rotated. */
export function invalidate(orgId: string, channelId: string) {
  cache.delete(`${orgId}:${channelId}`);
}
