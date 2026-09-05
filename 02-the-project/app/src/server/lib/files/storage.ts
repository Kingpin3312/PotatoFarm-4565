import { authHeaders, presign, type Creds } from "./sigv4";

/**
 * Object storage.
 *
 * Three functions were called and none of them existed. `upload.ts`
 * signed a PUT with `signPut` and confirmed the object with
 * `objectExists`; `whatsapp.ts` read the bytes back with `readObject`
 * before pushing them to Meta. Together they are the whole file feature —
 * the brochure an agent sends a buyer — and there was nothing underneath
 * any of it.
 *
 * This is now implemented against the S3 API, which is not a choice of
 * provider: AWS S3, Cloudflare R2, Backblaze B2, DigitalOcean Spaces and
 * MinIO all speak it, and the difference between them is the endpoint
 * string. Signing is in `sigv4.ts` rather than an SDK — see the note at
 * the top of that file.
 *
 * **It still fails loudly when unconfigured**, and deliberately does not
 * fake a working store. A stub returning success would put rows in the
 * attachment library pointing at objects that were never written, and an
 * agent would find out in front of a customer — which is exactly what
 * `confirmUpload` exists to prevent.
 *
 * **Bucket rules the call sites assume.** Keys are
 * `org/<orgId>/files/<uuid>`, so a bucket policy scoped by prefix keeps
 * one brokerage out of another's files even if the application gets it
 * wrong. The bucket must not be public: the send path uploads bytes to
 * Meta rather than handing out a URL, precisely so that no brochure is
 * left sitting on an unauthenticated endpoint.
 */

const NOT_WIRED =
  "Object storage is not configured. Set S3_BUCKET, S3_ENDPOINT, S3_REGION, " +
  "S3_ACCESS_KEY_ID and S3_SECRET_ACCESS_KEY. Any S3-compatible provider works — " +
  "AWS, Cloudflare R2, Backblaze B2, DigitalOcean Spaces or MinIO.";

type Config = { creds: Creds; host: string; prefix: string; scheme: "http" | "https" };

/** Said once per instance, not once per upload. */
let warnedAboutHttp = false;

/**
 * Resolved per call rather than at module load.
 *
 * A module-level constant is evaluated when the bundle is first
 * imported, which on a serverless platform can be before the
 * environment is fully populated — and the failure mode is the whole
 * feature being permanently unconfigured for the life of that instance
 * rather than for one request.
 */
function config(): Config | null {
  const bucket = process.env.S3_BUCKET?.trim();
  const endpoint = process.env.S3_ENDPOINT?.trim();
  const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();
  if (!bucket || !endpoint || !accessKeyId || !secretAccessKey) return null;

  const endpointHost = endpoint.replace(/^https?:\/\//, "").replace(/\/+$/, "");

  /**
   * The scheme comes from the endpoint, because MinIO on a private
   * network legitimately runs over http and refusing it would rule out a
   * self-hosted deployment for no gain.
   *
   * It is warned about in production and not blocked: a presigned URL
   * carries its own authorisation in the query string, so over http
   * anyone on the path can replay the upload — but "anyone on the path"
   * inside a private VPC is a different risk from the open internet, and
   * that is the operator's call to make, not ours to guess.
   */
  const scheme: "http" | "https" = endpoint.startsWith("http://") ? "http" : "https";
  if (scheme === "http" && process.env.NODE_ENV === "production" && !warnedAboutHttp) {
    warnedAboutHttp = true;
    console.warn(
      "[storage] S3_ENDPOINT is http, not https. Presigned URLs carry their " +
        "authorisation in the query string, so anyone who can see the traffic can " +
        "replay an upload. Only reasonable on a private network."
    );
  }

  /**
   * Path style or virtual-hosted style.
   *
   * AWS wants `bucket.s3.region.amazonaws.com/key`. R2, MinIO and most
   * self-hosted setups want `endpoint/bucket/key`. Getting it wrong is a
   * 404 or a DNS failure rather than an auth error, so it reads as "the
   * bucket does not exist" and sends whoever is debugging it in the
   * wrong direction entirely.
   *
   * Default is virtual-hosted for AWS and path style for everything
   * else, which is what each provider's own documentation assumes.
   */
  const forcePath =
    process.env.S3_FORCE_PATH_STYLE === "true" ||
    (process.env.S3_FORCE_PATH_STYLE !== "false" && !endpointHost.endsWith("amazonaws.com"));

  return {
    creds: {
      accessKeyId,
      secretAccessKey,
      region: process.env.S3_REGION?.trim() || "auto",
      service: "s3",
    },
    host: forcePath ? endpointHost : `${bucket}.${endpointHost}`,
    prefix: forcePath ? `/${bucket}` : "",
    scheme,
  };
}

function need(): Config {
  const c = config();
  if (!c) throw new Error(NOT_WIRED);
  return c;
}

/** Whether the feature is available, for a caller that wants to say so. */
export function storageConfigured(): boolean {
  return config() !== null;
}

/**
 * A presigned PUT the browser uploads straight to.
 *
 * `content-length` is signed, so the cap is enforced by the far end
 * rather than by us. That is the whole reason the exact byte count is
 * signed rather than the category limit: a ticket issued for a 2MB PDF
 * cannot be used to push 100MB. The previous signature took `maxBytes`
 * and the comment claimed the same protection, which it could not have
 * given — a cap that is not in the signature is a cap the client is
 * being asked politely to respect.
 */
export async function signPut(args: {
  key: string;
  mimeType: string;
  sizeBytes: number;
  expiresInSeconds: number;
}): Promise<string> {
  const c = need();
  const { url } = presign({
    creds: c.creds,
    method: "PUT",
    scheme: c.scheme,
    host: c.host,
    path: `${c.prefix}/${args.key}`,
    headers: {
      "content-type": args.mimeType,
      "content-length": String(args.sizeBytes),
    },
    expiresInSeconds: args.expiresInSeconds,
  });
  return url;
}

async function request(method: string, key: string, init?: RequestInit) {
  const c = need();
  const path = `${c.prefix}/${key}`;
  return fetch(`${c.scheme}://${c.host}${path}`, {
    ...init,
    method,
    headers: authHeaders({ creds: c.creds, method, host: c.host, path }),
    // A storage call that hangs must not hold a serverless function open
    // until the platform kills it — the caller gets an answer either way.
    signal: AbortSignal.timeout(30_000),
  });
}

/** Did the upload actually land? Checked before any row is written. */
export async function objectExists(key: string): Promise<boolean> {
  const res = await request("HEAD", key);
  if (res.status === 404) return false;
  if (!res.ok) throw new Error(`Storage HEAD ${key}: ${res.status}`);
  return true;
}

/** The bytes, for forwarding to Meta's media endpoint. */
export async function readObject(key: string): Promise<Uint8Array> {
  const res = await request("GET", key);
  if (!res.ok) throw new Error(`Storage GET ${key}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

/** Called when an attachment is deleted, so the object goes too. */
export async function deleteObject(key: string): Promise<void> {
  const res = await request("DELETE", key);
  // S3 returns 204 for a delete, and also for a key that was never
  // there. Both are the outcome the caller wanted.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Storage DELETE ${key}: ${res.status}`);
  }
}
