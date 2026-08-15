import type { DocumentType, DocumentOwner, Prisma } from "@prisma/client";
import { state, RULES } from "./expiry";

/**
 * Putting a document in the register.
 *
 * `expiry.ts` encodes UAE renewal turnaround for eight document types,
 * `documents.expiry` sweeps them daily and groups them per recipient,
 * and `README.md` explains why the broker card is the one that catches
 * people out. All of it was correct, and **nothing anywhere created a
 * `Document` row** — the sweep ran every night, found nothing, reported
 * success, and a brokerage was told nothing precisely because nothing
 * could be told. The light switch wired to nothing, for the fifth time.
 *
 * This is the switch.
 */

/**
 * Accepts a transaction client or the extended client from `forOrg()`.
 *
 * Same structural shape as `AuditWriter` in `lib/audit.ts`, and for the
 * same reason: the two are different types and both are legitimate
 * callers.
 */
export type DocumentWriter = {
  document: {
    findFirst: (args: Prisma.DocumentFindFirstArgs) => Promise<{ id: string } | null>;
    updateMany: (args: Prisma.DocumentUpdateManyArgs) => Promise<{ count: number }>;
    create: (args: Prisma.DocumentCreateArgs) => Promise<{ id: string; expiresAt: Date | null }>;
  };
};

export type RecordArgs = {
  orgId: string;
  actorId: string;
  ownerType: DocumentOwner;
  ownerId: string;
  type: DocumentType;
  reference?: string | null;
  issuedAt?: Date | null;
  expiresAt?: Date | null;
  /** Present only when something was actually uploaded. */
  file?: { fileName: string; storageRef: string; mimeType?: string; sizeBytes?: number } | null;
};

/**
 * A renewal supersedes, it does not accumulate.
 *
 * The `supersededById` column has existed since the first schema and
 * `README.md` records that "the upload path does not set it". Nothing
 * setting it is worse than untidy: the daily sweep filters on
 * `supersededById: null`, so a renewed broker card leaves the expired
 * one still live in the query, and the admin is warned about a lapsed
 * card every morning for the rest of the year. That is precisely how
 * somebody turns the notifications off — the failure the grouping rule
 * in `expiry.ts` was written to avoid, arriving by another door.
 *
 * So the previous live document of the same type, on the same owner, is
 * closed in the same transaction that creates its replacement. One
 * statement, so there is no window in which both are live or neither is.
 */
export async function recordDocument(tx: DocumentWriter, args: RecordArgs) {
  const created = await tx.document.create({
    data: {
      orgId: args.orgId,
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      type: args.type,
      reference: args.reference?.trim() || null,
      issuedAt: args.issuedAt ?? null,
      expiresAt: args.expiresAt ?? null,
      fileName: args.file?.fileName.slice(0, 200) ?? null,
      storageRef: args.file?.storageRef ?? null,
      mimeType: args.file?.mimeType ?? null,
      sizeBytes: args.file?.sizeBytes ?? null,
      uploadedById: args.actorId,
    },
  });

  const { count } = await tx.document.updateMany({
    where: {
      orgId: args.orgId,
      ownerType: args.ownerType,
      ownerId: args.ownerId,
      type: args.type,
      supersededById: null,
      id: { not: created.id },
    },
    data: { supersededById: created.id },
  });

  return { id: created.id, superseded: count };
}

/**
 * The types worth offering, in the order somebody reaches for them.
 *
 * Ordered by what stops work rather than alphabetically. A list that
 * opens with `EJARI` buries the broker card, and the broker card is the
 * one nobody is looking at.
 */
export function typesFor(ownerType: DocumentOwner): DocumentType[] {
  switch (ownerType) {
    case "USER":
      return ["RERA_BROKER_CARD", "EMIRATES_ID", "PASSPORT", "VISA", "OTHER"];
    case "ORGANISATION":
      return ["BROKERAGE_LICENCE", "TRADE_LICENCE", "OTHER"];
    case "LISTING":
      return [
        "TRAKHEESI_PERMIT", "TITLE_DEED", "NOC", "SERVICE_CHARGE_CLEARANCE",
        "EJARI", "TENANCY_CONTRACT", "FLOOR_PLAN", "OTHER",
      ];
    case "LEAD":
      return ["EMIRATES_ID", "PASSPORT", "VISA", "TRADE_LICENCE", "OTHER"];
    case "DEAL":
      return ["FORM_F", "SPA", "NOC", "TITLE_DEED", "OTHER"];
  }
}

/**
 * Whether a type expires at all, and what it costs when it does.
 *
 * A floor plan has no expiry and asking for one invites a made-up date,
 * which then alarms. `RULES` is the single source — a type absent from
 * it is a type with no lead time and no consequence to state.
 */
export function expiryRule(type: DocumentType) {
  return RULES.find((r) => r.type === type) ?? null;
}

/** Re-exported so a caller needs one import rather than two. */
export { state };
