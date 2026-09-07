import { createHash, createHmac } from "node:crypto";

/**
 * AWS Signature Version 4, by hand.
 *
 * Two reasons this is not `@aws-sdk/client-s3`:
 *
 * The SDK is about 3MB across its dependency tree for four operations —
 * PUT, HEAD, GET, DELETE — and it lands in a serverless bundle whose
 * cold start is on the path of an agent waiting to send a brochure to a
 * buyer who is standing in front of them.
 *
 * And it makes the provider a decision. The whole point of the storage
 * seam is that whoever deploys this picks S3, R2, B2, Spaces or MinIO on
 * their own terms; SigV4 over `fetch` is what every one of those speaks,
 * and the difference between them is an endpoint string.
 *
 * Verified against the signature published in AWS's own documentation —
 * see `sigv4.check.ts`. Hand-rolled crypto that has never been checked
 * against a known-good vector is how you get an integration that fails
 * only against the one provider you did not test.
 */

const sha256 = (data: string | Uint8Array) =>
  createHash("sha256").update(data).digest("hex");

const hmac = (key: Buffer | string, data: string) =>
  createHmac("sha256", key).update(data, "utf8").digest();

/**
 * Percent-encoding, S3's rules rather than JavaScript's.
 *
 * `encodeURIComponent` leaves `!'()*` alone and AWS requires them
 * encoded. Getting this wrong produces a signature mismatch on exactly
 * the filenames a person actually types — `Marina Gate (2 bed).pdf` —
 * and works perfectly in every test with a tidy name.
 */
export function uriEncode(value: string, encodeSlash = true): string {
  let out = "";
  for (const ch of value) {
    if (/[A-Za-z0-9\-._~]/.test(ch)) {
      out += ch;
    } else if (ch === "/") {
      out += encodeSlash ? "%2F" : "/";
    } else {
      for (const byte of Buffer.from(ch, "utf8")) {
        out += "%" + byte.toString(16).toUpperCase().padStart(2, "0");
      }
    }
  }
  return out;
}

/** `20130524T000000Z` and `20130524`. */
export function stamps(now: Date) {
  const iso = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  return { amzDate: iso, dateStamp: iso.slice(0, 8) };
}

function signingKey(secret: string, dateStamp: string, region: string, service: string) {
  return hmac(hmac(hmac(hmac("AWS4" + secret, dateStamp), region), service), "aws4_request");
}

export type Creds = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
  service: string;
};

/**
 * The canonical request, the string to sign, and the signature.
 *
 * Split out from both callers below because a presigned URL and a signed
 * request differ only in where the authorisation lands — the query
 * string or a header — and duplicating the canonicalisation is how the
 * two drift until one of them silently stops working.
 */
function sign(args: {
  creds: Creds;
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  payloadHash: string;
  amzDate: string;
  dateStamp: string;
}) {
  const { creds } = args;

  const canonicalQuery = Object.keys(args.query)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(args.query[k] ?? "")}`)
    .join("&");

  // Header names lowercased, values trimmed, sorted by name. The signed
  // list has to match the headers actually sent, exactly.
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(args.headers)) lower[k.toLowerCase()] = v.trim();
  const signedHeaders = Object.keys(lower).sort();

  const canonicalRequest = [
    args.method,
    uriEncode(args.path, false),
    canonicalQuery,
    signedHeaders.map((h) => `${h}:${lower[h]}`).join("\n") + "\n",
    signedHeaders.join(";"),
    args.payloadHash,
  ].join("\n");

  const scope = `${args.dateStamp}/${creds.region}/${creds.service}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    args.amzDate,
    scope,
    sha256(canonicalRequest),
  ].join("\n");

  const signature = createHmac(
    "sha256",
    signingKey(creds.secretAccessKey, args.dateStamp, creds.region, creds.service)
  )
    .update(stringToSign, "utf8")
    .digest("hex");

  return { signature, scope, signedHeaders: signedHeaders.join(";"), canonicalRequest, stringToSign };
}

/**
 * A URL somebody else can use, for a limited time, for one exact request.
 *
 * Every header passed in is *signed*, which is the point: sign
 * `content-length` and a client that asked for a ticket for a 2MB PDF
 * cannot then push 100MB through it. The cap belongs in the signature
 * rather than in a check on our side, because only the signature is
 * enforced by the far end.
 */
export function presign(args: {
  creds: Creds;
  method: string;
  /** http only for a private-network MinIO. See storage.ts. */
  scheme?: "http" | "https";
  host: string;
  path: string;
  headers: Record<string, string>;
  expiresInSeconds: number;
  now?: Date;
}): { url: string; query: Record<string, string> } {
  const { amzDate, dateStamp } = stamps(args.now ?? new Date());
  const headers = { host: args.host, ...args.headers };

  const query: Record<string, string> = {
    "X-Amz-Algorithm": "AWS4-HMAC-SHA256",
    "X-Amz-Credential": `${args.creds.accessKeyId}/${dateStamp}/${args.creds.region}/${args.creds.service}/aws4_request`,
    "X-Amz-Date": amzDate,
    "X-Amz-Expires": String(args.expiresInSeconds),
    "X-Amz-SignedHeaders": Object.keys(headers)
      .map((h) => h.toLowerCase())
      .sort()
      .join(";"),
  };

  const { signature } = sign({
    creds: args.creds,
    method: args.method,
    path: args.path,
    query,
    headers,
    // Presigned URLs use the literal string rather than a body hash —
    // the body does not exist yet at signing time.
    payloadHash: "UNSIGNED-PAYLOAD",
    amzDate,
    dateStamp,
  });

  const full: Record<string, string> = { ...query, "X-Amz-Signature": signature };
  const qs = Object.keys(full)
    .sort()
    .map((k) => `${uriEncode(k)}=${uriEncode(full[k] ?? "")}`)
    .join("&");

  const scheme = args.scheme ?? "https";
  return { url: `${scheme}://${args.host}${uriEncode(args.path, false)}?${qs}`, query: full };
}

/**
 * Headers for a request this server makes itself.
 *
 * Authorisation goes in a header here rather than the query string,
 * and the payload hash is real because we have the bytes.
 */
export function authHeaders(args: {
  creds: Creds;
  method: string;
  host: string;
  path: string;
  body?: Uint8Array;
  extraHeaders?: Record<string, string>;
  now?: Date;
}): Record<string, string> {
  const { amzDate, dateStamp } = stamps(args.now ?? new Date());
  const payloadHash = sha256(args.body ?? new Uint8Array());

  const headers: Record<string, string> = {
    host: args.host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
    ...args.extraHeaders,
  };

  const { signature, scope, signedHeaders } = sign({
    creds: args.creds,
    method: args.method,
    path: args.path,
    query: {},
    headers,
    payloadHash,
    amzDate,
    dateStamp,
  });

  return {
    ...headers,
    Authorization:
      `AWS4-HMAC-SHA256 Credential=${args.creds.accessKeyId}/${scope}, ` +
      `SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

/** Exposed for the check script, which asserts against AWS's own vector. */
export const _internals = { sign, sha256, stamps };
