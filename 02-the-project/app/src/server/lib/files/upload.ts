import { forOrg } from "@/server/db/client";
import { audit } from "@/server/lib/audit";
import { LIMITS } from "./send";
import { signPut, objectExists } from "./storage";

/**
 * Getting a file in.
 *
 * `sendFile` could send an attachment and `libraryFor` could list them,
 * and **nothing anywhere created one.** The send path had nothing to
 * send — a complete feature with no way to start using it, which is the
 * same class of gap as billing that could not acquire a customer.
 */

/**
 * Uploaded straight to storage, not through this server.
 *
 * A 40MB brochure posted to a serverless function is a timeout on a
 * platform with a 10MB body limit. The browser gets a signed URL, PUTs
 * to it directly, and tells us when it lands.
 *
 * It also means a large file on hotel wifi is slow for the agent and
 * costs us nothing.
 */
export type Ticket = {
  uploadUrl: string;
  storageRef: string;
  expiresInSeconds: number;
};

export type TicketResult = { ok: true; ticket: Ticket } | { ok: false; reason: string; fix?: string };

export async function requestUpload(args: {
  orgId: string;
  actorId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<TicketResult> {
  const kind = args.mimeType.startsWith("image/") ? "image" : "document";
  const limit = LIMITS[kind];

  /**
   * Checked before the upload, not after.
   *
   * The same rule as the send path and for a stronger reason here: an
   * agent who waits two minutes for a 120MB video to upload and is then
   * told WhatsApp will not take it has lost two minutes and learned
   * something we knew before they started.
   */
  if (!limit.types.includes(args.mimeType as never)) {
    return {
      ok: false,
      reason: `WhatsApp won't accept a ${args.mimeType.split("/")[1]?.toUpperCase() ?? "file"}.`,
      fix: kind === "image" ? "Save it as a JPEG or PNG." : "Save it as a PDF.",
    };
  }
  if (args.sizeBytes > limit.maxBytes) {
    return {
      ok: false,
      reason: `That's ${(args.sizeBytes / 1024 / 1024).toFixed(0)}MB and the limit is ${limit.maxBytes / 1024 / 1024}MB.`,
      fix: "Compress it, or send a link instead.",
    };
  }
  if (args.sizeBytes <= 0) {
    return { ok: false, reason: "That file is empty." };
  }

  // Scoped by org in the path so a misconfigured bucket policy still
  // cannot let one brokerage read another's brochures.
  const storageRef = `org/${args.orgId}/files/${crypto.randomUUID()}`;

  const uploadUrl = await signPut({
    key: storageRef,
    mimeType: args.mimeType,
    /**
     * The exact size, not the category limit.
     *
     * This passed `maxBytes` and the comment beside it claimed a client
     * could not lie about the size and upload something else. It could:
     * a 100MB ceiling in the signature permits anything up to 100MB, and
     * the declared size was never checked against anything. Signing the
     * exact byte count is what makes the claim true — the far end
     * rejects a body of any other length.
     */
    sizeBytes: args.sizeBytes,
    expiresInSeconds: 900,
  });

  return { ok: true, ticket: { uploadUrl, storageRef, expiresInSeconds: 900 } };
}

/**
 * Recorded only once the object exists.
 *
 * Creating the row first and hoping the upload lands leaves a library
 * full of brochures that fail when an agent tries to send one, in front
 * of a buyer. The row is written after the object is confirmed.
 */
export async function confirmUpload(args: {
  orgId: string;
  actorId: string;
  storageRef: string;
  listingId?: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  kind: "BROCHURE" | "FLOOR_PLAN" | "PAYMENT_PLAN" | "PHOTO" | "DOCUMENT" | "OTHER";
}) {
  const exists = await objectExists(args.storageRef);
  if (!exists) {
    return { ok: false as const, reason: "That upload didn't finish. Try again." };
  }

  const db = forOrg(args.orgId);
  const file = await db.attachment.create({
    data: {
      orgId: args.orgId,
      listingId: args.listingId,
      kind: args.kind,
      fileName: args.fileName.slice(0, 200),
      storageRef: args.storageRef,
      mimeType: args.mimeType,
      sizeBytes: args.sizeBytes,
      uploadedById: args.actorId,
    },
  });

  await audit(db, args.orgId, {
    actorId: args.actorId,
    action: "file.uploaded",
    entity: "Attachment",
    entityId: file.id,
    after: { fileName: file.fileName, listingId: args.listingId },
  });

  return { ok: true as const, attachmentId: file.id };
}

/**
 * Orphans.
 *
 * An agent who starts an upload and closes the tab leaves an object with
 * no row. It would be swept weekly rather than daily, because the window
 * between upload and confirm can legitimately be several minutes on bad
 * signal and deleting somebody's brochure mid-upload is worse than
 * paying for a week of storage.
 *
 * **Not implemented and not scheduled**, which is the honest state.
 * `storage.ts` no longer blocks it — that is real now — but this needs
 * `ListObjectsV2` paged over the bucket and cross-checked against
 * Attachment, and nothing registers it in `jobs/index.ts`, so writing
 * the body would produce a correct function nothing calls. It is the
 * shape this codebase keeps finding: a complete module with nothing that
 * starts it.
 *
 * The cost of leaving it is storage rent on abandoned uploads, which at
 * pilot scale is pennies. Add it to `jobs/index.ts` and `vercel.json`
 * together, or not at all.
 */
export async function sweepOrphans() {
  return {
    removed: 0,
    note: "not implemented — needs ListObjectsV2 and a job registration, see the comment",
  };
}
