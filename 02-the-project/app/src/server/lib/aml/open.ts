import type { Prisma } from "@prisma/client";

/**
 * Opening a due diligence file.
 *
 * **Nothing in this product ever created a `KycRecord`.** The whole AML
 * module reads one: `fileStatus` returns `{ exists: false }`,
 * `receiveDocument` refuses an identity document because there is "no
 * open file", and `assessRisk` calls `update` on a row that cannot be
 * there. Every screen, every guard and every tipping-off rule sat on top
 * of a table with no way in.
 *
 * The agent-facing panel already told the buyer's side of it:
 *
 *   > Nothing needed yet. A file opens when this becomes a transaction —
 *   > every brokerage concluding a sale is a DNFBP and the check is the
 *   > firm's obligation, not yours.
 *
 * That sentence was a promise nothing kept. This is the thing that keeps
 * it.
 *
 * ## When a file opens
 *
 * On an accepted offer, because that is when a lead becomes a
 * transaction — `negotiate.ts` already calls that moment "when the job
 * stops being about finding a buyer and starts being about not losing
 * one". UAE AML attaches the obligation to concluding the transaction,
 * so this is the honest trigger rather than a date somebody remembers.
 *
 * An agent can also open one by hand, earlier. A buyer who mentions cash
 * over the reporting threshold is a file worth opening while they are
 * still talking, and a product that only opens files on acceptance
 * quietly teaches people to leave it late.
 *
 * ## Why the legal name starts as the lead's name
 *
 * `KycRecord.legalName` is required and the only name available at this
 * point is whatever the lead is filed under — often a WhatsApp profile
 * name, which is not a legal name and may not be a real one.
 *
 * It is seeded anyway, because an empty required field is worse: it
 * makes the row impossible to create at the moment it must exist. What
 * carries the truth is `status: NOT_STARTED`, which means nothing here
 * has been checked against a document. The name is corrected from the
 * passport when the passport arrives, and `verifiedAt` on the document
 * is what an auditor reads — never this field on its own.
 */

/**
 * Anything that can open a file.
 *
 * Structural, for the reason `AuditWriter` in `lib/audit.ts` is: the
 * callers are a real `tx` inside `$transaction` (the offer acceptance)
 * and `ctx.db`, the `$extends`-ed client `forOrg()` returns (the
 * router). The latter is not structurally a `Prisma.TransactionClient`,
 * and the error it produces names thirty unrelated Prisma internals
 * rather than the mismatch.
 */
export type FileOpener = {
  kycRecord: {
    findUnique(args: {
      where: { leadId: string };
      select: { id: true };
    }): PromiseLike<{ id: string } | null>;
    create(args: {
      data: Prisma.KycRecordUncheckedCreateInput;
      select: { id: true };
    }): PromiseLike<{ id: string }>;
  };
  lead: {
    findUniqueOrThrow(args: {
      where: { id: string };
      select: { name: true; phone: true };
    }): PromiseLike<{ name: string | null; phone: string }>;
  };
};

export async function openKycFile(
  tx: FileOpener,
  args: { orgId: string; leadId: string; subjectType?: "INDIVIDUAL" | "COMPANY" | "TRUST" },
): Promise<{ id: string; created: boolean }> {
  /**
   * Idempotent, and that is load-bearing rather than tidy.
   *
   * `leadId` is `@unique`, so a second attempt throws — and the callers
   * are an offer acceptance inside a transaction and a button an agent
   * can press twice. The first would roll back a deal; the second would
   * show an error for asking twice for something that already exists.
   */
  const existing = await tx.kycRecord.findUnique({
    where: { leadId: args.leadId },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const lead = await tx.lead.findUniqueOrThrow({
    where: { id: args.leadId },
    select: { name: true, phone: true },
  });

  const record = await tx.kycRecord.create({
    data: {
      orgId: args.orgId,
      leadId: args.leadId,
      subjectType: args.subjectType ?? "INDIVIDUAL",
      // Not a legal name yet. See the note above — `status` is what says
      // so, and it is the field every screen reads.
      legalName: lead.name ?? lead.phone,
      status: "NOT_STARTED",
      // Deliberately not set: `riskRating` stays UNASSESSED until a human
      // runs `assessRisk`. Defaulting it to LOW because the form is empty
      // would be a risk rating nobody made.
    },
    select: { id: true },
  });

  return { id: record.id, created: true };
}
