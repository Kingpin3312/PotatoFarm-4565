/**
 * The origin a browser uploads to and loads photos from, or null.
 *
 * The page's security policy has to name it: uploads go straight from
 * the browser to storage (a signed PUT), and `connect-src` allowed only
 * this server and Stripe — so **every direct upload was refused by the
 * browser in production**, brochures included, while working in
 * development where the policy is looser. Nothing server-side sees that
 * refusal; the agent sees an upload that "failed", with no reason.
 *
 * Kept here, importing nothing, because the policy is built in
 * middleware on the edge runtime, which cannot load the signing code in
 * `server/lib/files`. `storage-origin.test.ts` holds this to the address
 * `storage.ts` actually signs, so the two cannot drift.
 */
export function storageOrigin(env: Record<string, string | undefined> = process.env): string | null {
  const bucket = env.S3_BUCKET?.trim();
  const endpoint = env.S3_ENDPOINT?.trim();
  if (!bucket || !endpoint) return null;
  const host = endpoint.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  const scheme = endpoint.startsWith("http://") ? "http" : "https";
  // The same path-style rule as storage.ts: virtual-hosted for AWS only.
  const forcePath = env.S3_FORCE_PATH_STYLE === "true" ||
    (env.S3_FORCE_PATH_STYLE !== "false" && !host.endsWith("amazonaws.com"));
  return `${scheme}://${forcePath ? host : `${bucket}.${host}`}`;
}
