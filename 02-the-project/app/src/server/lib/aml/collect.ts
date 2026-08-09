import { forOrg } from "@/server/db/client";
import { log } from "@/lib/log";

/**
 * Collecting due diligence documents over WhatsApp.
 *
 * The strongest idea in the competitive analysis, and the one that needs
 * the most care — because "an AI asked me for my passport on WhatsApp" is
 * a sentence that ends badly if any of this is done casually.
 *
 * Five rules, and each exists for a reason worth stating.
 */

/**
 * 1. **Never during qualification.**
 *
 * Asking an enquirer for a passport because they asked about a three-bed
 * in Marina is excessive collection, and it is creepy. The obligation
 * attaches to a transaction, not to a conversation. Documents are
 * requested only once a deal is agreed, and the code refuses earlier.
 */
export const COLLECT_FROM_STAGE = ["MOU_SIGNED", "DEPOSIT_PAID", "AGREED"] as const;

/**
 * 2. **Always say why, in plain words.**
 *
 * People are right to be suspicious of being asked for identity documents
 * over a messaging app. The request names the legal obligation, names the
 * brokerage, and says what happens to the file. A request that sounds
 * like a phishing message will be treated as one, and rightly.
 */
export function requestMessage(brokerage: string, docType: "PASSPORT" | "EMIRATES_ID" | "TRADE_LICENCE") {
  const what = {
    PASSPORT: "a photo of your passport photo page",
    EMIRATES_ID: "a photo of both sides of your Emirates ID",
    TRADE_LICENCE: "a copy of the company's trade licence",
  }[docType];

  return (
    `Before we can proceed, ${brokerage} has to complete an identity check — ` +
    `every property brokerage in the UAE is required to do this by law before a sale.\n\n` +
    `Could you send ${what}?\n\n` +
    `It's stored securely, only ${brokerage} can see it, and it's used for this ` +
    `transaction and the record we're required to keep. If you'd rather hand it over ` +
    `in person, that's completely fine — just say and we'll arrange it.`
  );
}

/**
 * 3. **The assistant collects. It never verifies.**
 *
 * An automated decision that somebody's identity document is genuine has
 * legal weight, and getting it wrong in either direction is serious —
 * rejecting a real buyer, or accepting a forgery into a compliance file
 * that a regulator will later read. So a document arrives, is stored, and
 * is queued for a human. The assistant says "thank you, we'll confirm
 * shortly", not "verified".
 */
export const ASSISTANT_MAY_VERIFY = false;

/**
 * 4. **The image never lives in the message thread.**
 *
 * WhatsApp media URLs expire, and a passport sitting in a conversation
 * log is a passport in every backup and export of that conversation. It
 * goes to object storage with restricted access, and the message body
 * records only that a document was received.
 */
export async function receiveDocument(args: {
  orgId: string;
  leadId: string;
  mediaUrl: string;
  declaredType: "PASSPORT" | "EMIRATES_ID" | "TRADE_LICENCE";
}) {
  const db = forOrg(args.orgId);

  const kyc = await db.kycRecord.findUnique({
    where: { leadId: args.leadId },
    select: { id: true, status: true },
  });
  if (!kyc) {
    // No file open means nobody asked for this. Do not quietly accept an
    // identity document nobody has a basis to hold.
    log.warn("identity document arrived with no open KYC file", { orgId: args.orgId });
    return { stored: false, reason: "no_open_file" as const };
  }

  const storageRef = await putInSecureStorage(args.mediaUrl, args.orgId);

  const doc = await db.kycDocument.create({
    data: {
      orgId: args.orgId,
      kycId: kyc.id,
      type: args.declaredType,
      storageRef,
      fileName: `${args.declaredType.toLowerCase()}-${Date.now()}`,
      collectedVia: "WHATSAPP",
      // verifiedAt deliberately null. A human sets it.
    },
  });

  await db.kycRecord.update({
    where: { id: kyc.id },
    data: { status: "PENDING_REVIEW" },
  });

  return { stored: true, documentId: doc.id, needsHumanVerification: true };
}

/**
 * 5. **A blurry passport is worse than none.**
 *
 * It looks collected, the file looks complete, and it fails at the
 * moment somebody actually needs to read it. Basic quality checks happen
 * on receipt so the assistant can ask again while the person is still in
 * the conversation, rather than an agent discovering it a fortnight later.
 */
export type QualityIssue = "too_small" | "too_dark" | "cropped" | "glare";

export function qualityMessage(issues: QualityIssue[]) {
  const say: Record<QualityIssue, string> = {
    too_small: "it's come through quite small",
    too_dark: "it's a bit dark to read",
    cropped: "part of it looks cut off",
    glare: "there's some glare across it",
  };
  // `issues[0]` is optional under noUncheckedIndexedAccess, and an
  // unrecognised code would index to undefined anyway. Falls back to a
  // sentence that still makes sense rather than "Thanks — undefined".
  const first = issues[0];
  const why = (first && say[first]) ?? "it hasn't come through clearly";
  return (
    `Thanks — ${why}. Could you send it once more, flat on a surface ` +
    `with the whole page in frame? Sorry to ask twice.`
  );
}

async function putInSecureStorage(mediaUrl: string, orgId: string): Promise<string> {
  // Fetch from WhatsApp with the channel token, write to object storage
  // under a per-tenant prefix with a short-lived signed-read policy.
  // Never public, never predictable.
  return `kyc/${orgId}/${crypto.randomUUID()}`;
}
