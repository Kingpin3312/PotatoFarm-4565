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
 * This is the seam, written the same way `secrets.ts` is: one module,
 * one place to swap in S3, R2 or GCS, and a loud failure until somebody
 * does. It deliberately does not fake a working store. A stub that
 * returned success would put rows in the attachment library pointing at
 * objects that were never written, and an agent would find out in front
 * of a customer — which is exactly the failure `confirmUpload` was
 * written to prevent.
 *
 * **Bucket rules the call sites already assume, for whoever wires this
 * up.** Keys are `org/<orgId>/files/<uuid>`, so a bucket policy scoped by
 * prefix keeps one brokerage out of another's files even if the
 * application gets it wrong. The bucket must not be public: the send
 * path uploads bytes to Meta rather than handing out a URL, precisely so
 * that no brochure is left sitting on an unauthenticated endpoint.
 */

const NOT_WIRED =
  "Object storage is not configured. Implement src/server/lib/files/storage.ts " +
  "against S3, Cloudflare R2 or GCS and set the bucket credentials.";

/**
 * A presigned PUT the browser uploads straight to.
 *
 * The size cap belongs in the signature rather than in a check on our
 * side — the client is told a limit either way, and only the signature
 * stops it uploading something else.
 */
export async function signPut(_args: {
  key: string;
  mimeType: string;
  maxBytes: number;
  expiresInSeconds: number;
}): Promise<string> {
  throw new Error(NOT_WIRED);
}

/** Did the upload actually land? Checked before any row is written. */
export async function objectExists(_key: string): Promise<boolean> {
  throw new Error(NOT_WIRED);
}

/** The bytes, for forwarding to Meta's media endpoint. */
export async function readObject(_key: string): Promise<Uint8Array> {
  throw new Error(NOT_WIRED);
}

/** Called when an attachment is deleted, so the object goes too. */
export async function deleteObject(_key: string): Promise<void> {
  throw new Error(NOT_WIRED);
}
