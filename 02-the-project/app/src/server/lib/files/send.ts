import { forOrg } from "@/server/db/client";
import { sendDocument } from "@/server/lib/whatsapp";
import { messagingWindow } from "@/server/lib/whatsapp";
import { audit } from "@/server/lib/audit";
import { log } from "@/lib/log";

/**
 * Sending a file to a lead.
 *
 * Half an agent's messages are a floor plan or a payment plan. With no
 * way to attach one, the first time a buyer asks the agent leaves for
 * WhatsApp — and does not come back for the next thing either. That was
 * the third blocker in the agent test and it is the one that quietly
 * loses the whole product.
 */

/**
 * What WhatsApp will actually accept.
 *
 * Checked here rather than discovered at the API. A 120MB video rejected
 * by Meta after a two-minute upload on hotel wifi is a minute of an
 * agent's life and an error they cannot act on.
 */
export const LIMITS = {
  document: { maxBytes: 100 * 1024 * 1024, types: ["application/pdf"] },
  image: {
    maxBytes: 5 * 1024 * 1024,
    types: ["image/jpeg", "image/png"],
  },
} as const;

export type SendResult =
  | { ok: true; messageId: string }
  | { ok: false; reason: string; fix?: string };

export async function sendFile(args: {
  orgId: string;
  conversationId: string;
  attachmentId: string;
  actorId: string;
  caption?: string;
}): Promise<SendResult> {
  const db = forOrg(args.orgId);

  const [file, convo] = await Promise.all([
    db.attachment.findUnique({ where: { id: args.attachmentId } }),
    db.conversation.findUnique({
      where: { id: args.conversationId },
      select: { id: true, lastInboundAt: true, channelId: true, leadId: true },
    }),
  ]);

  if (!file) return { ok: false, reason: "That file is no longer here." };
  if (!convo) return { ok: false, reason: "That conversation is no longer here." };

  /**
   * The window applies to files exactly as it applies to text.
   *
   * This is the one people forget. An agent sends a brochure to a lead
   * who went quiet three days ago, Meta accepts it, and it is never
   * delivered — so the agent believes the buyer has the floor plan and
   * is ignoring it.
   */
  const window = messagingWindow(convo.lastInboundAt);
  if (!window.open) {
    return {
      ok: false,
      reason: "It's been more than 24 hours since they messaged, so WhatsApp won't deliver a file.",
      fix: "Send an approved template to reopen the conversation, or give them a call.",
    };
  }

  const kind = file.mimeType.startsWith("image/") ? "image" : "document";
  const limit = LIMITS[kind];

  if (!limit.types.includes(file.mimeType as never)) {
    return {
      ok: false,
      reason: `WhatsApp won't take a ${file.mimeType.split("/")[1]?.toUpperCase() ?? "file"} here.`,
      fix: kind === "image" ? "Save it as a JPEG or PNG." : "Save it as a PDF.",
    };
  }
  if (file.sizeBytes > limit.maxBytes) {
    return {
      ok: false,
      reason: `That file is ${(file.sizeBytes / 1024 / 1024).toFixed(0)}MB. WhatsApp's limit is ${limit.maxBytes / 1024 / 1024}MB.`,
      fix: "Compress it, or send a link instead.",
    };
  }

  try {
    const sent = await sendDocument({
      orgId: args.orgId,
      channelId: convo.channelId,
      conversationId: convo.id,
      storageRef: file.storageRef,
      fileName: file.fileName,
      mimeType: file.mimeType,
      caption: args.caption?.slice(0, 1024),
    });

    const message = await db.message.create({
      data: {
        orgId: args.orgId,
        conversationId: convo.id,
        direction: "OUTBOUND",
        author: "AGENT",
        // The filename is the body. A transcript reading "[attachment]"
        // tells nobody anything six months later in a dispute about what
        // the buyer was actually shown.
        body: args.caption ? `${file.fileName} — ${args.caption}` : file.fileName,
        status: "SENT",
        providerRef: sent.providerRef,
        sentAt: new Date(),
      },
    });

    await db.attachment.update({
      where: { id: file.id },
      data: { messageId: message.id },
    });

    await audit(db, args.orgId, {
      actorId: args.actorId,
      action: "message.file_sent",
      entity: "Message",
      entityId: message.id,
      after: { fileName: file.fileName, leadId: convo.leadId },
    });

    return { ok: true, messageId: message.id };
  } catch (err) {
    log.error("file send failed", { orgId: args.orgId }, {
      attachmentId: file.id, err: String(err).slice(0, 140),
    });
    return {
      ok: false,
      reason: "That didn't send. Nothing was delivered.",
      fix: "Try again — if it keeps failing, send it from WhatsApp directly.",
    };
  }
}

/**
 * The library.
 *
 * A brochure uploaded once against a listing, sendable to any lead
 * without re-uploading. The alternative is an agent finding the same PDF
 * in their downloads folder forty times, which is what they do today.
 */
export async function libraryFor(orgId: string, listingId: string) {
  return forOrg(orgId).attachment.findMany({
    where: { listingId, messageId: null },
    select: { id: true, kind: true, fileName: true, sizeBytes: true, mimeType: true },
    orderBy: { createdAt: "desc" },
  });
}
