/**
 * Identity documents in a due diligence file.
 *
 * ## Why this exists
 *
 * Every open file told its agent "Waiting on both documents", and
 * **nothing in the product could ever put one in.** The only writer of a
 * `KycDocument` was `receiveDocument`, which nothing called — and which
 * stored nothing even if it had been: its "secure storage" returned a
 * random key and wrote no bytes, under a comment describing the fetch and
 * the write in detail. Wired up as it stood, it would have filled
 * compliance files with pointers to passports that were never kept — the
 * positive evidence of a control that did not happen, in the file an
 * inspector reads, for records the law says to keep for five years.
 *
 * And nothing could verify one either: `verifiedAt` had no writer, so the
 * panel's "your compliance officer checks it" described a step with no
 * button.
 *
 * ## The rules
 *
 * - **The agent collects; a compliance approver verifies.** Upload is
 *   `kyc:write`; viewing and verifying are `kyc:approve`, which an agent
 *   does not hold. An agent can see that a document is in and whether it
 *   has been checked, never the image — a passport opened on an agent's
 *   phone is a passport in that phone's cache.
 * - **Every view is recorded.** Who opened which person's identity
 *   document, and when, is exactly the question asked after a leak.
 * - **The bytes prove the type.** JPEG, PNG or PDF, checked by their
 *   first bytes and exact size before anything is recorded; a mismatch is
 *   deleted, never kept.
 * - **One file's prefix.** `kyc/<org>/<file>/…`, apart from brochures and
 *   listing photos, so a bucket policy can treat identity documents more
 *   strictly than anything else — and a key from another file is refused.
 */

export const KYC_DOC_MIME = ["image/jpeg", "image/png", "application/pdf"] as const;
/** A phone photo of a passport page is 2–6MB; a scanned PDF rarely over 10. */
export const KYC_DOC_MAX_BYTES = 15 * 1024 * 1024;
/** Long enough to open it; short enough that a copied link dies at once. */
export const KYC_DOC_VIEW_SECONDS = 120;

export function kycPrefix(orgId: string, kycId: string) {
  return `kyc/${orgId}/${kycId}/`;
}
