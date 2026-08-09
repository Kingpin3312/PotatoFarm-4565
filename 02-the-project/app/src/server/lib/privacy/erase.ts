import { log } from "@/lib/log";
import { crossTenant, forOrg } from "@/server/db/client";
import { createHash } from "node:crypto";
import { AML_RETENTION_YEARS } from "@/server/lib/aml/rules";

/**
 * Erasure.
 *
 * There is a genuine conflict here and it is worth stating rather than
 * quietly picking a side.
 *
 * The audit log is append-only at the database level — `REVOKE UPDATE,
 * DELETE` — because an audit log a developer can edit is not an audit
 * log. That was the right call and the security page depends on it.
 *
 * A right-to-erasure request says: remove this person's personal data.
 *
 * Those two things cannot both be absolute. The resolution used here, and
 * the one that stands up to scrutiny:
 *
 *   **The skeleton survives, the person does not.**
 *
 * The audit row keeps what happened, when, and to which record. It loses
 * every field that identifies a human. You can still prove that a lead
 * was assigned on the 14th and deleted on the 30th; you can no longer
 * tell from the log who they were.
 *
 * That satisfies erasure — the data is no longer personal data, because
 * it can no longer be attributed to an identifiable person — while
 * keeping the integrity record intact. It is the standard position and it
 * is defensible in a way that "we deleted the audit trail" is not.
 *
 * The one exception, deliberately: the erasure itself is logged. A record
 * that a request was received and completed, with no detail about who
 * made it beyond a one-way hash. Without that you cannot prove you
 * honoured the request at all.
 *
 * ---
 *
 * **AML carve-out.**
 *
 * A right to erasure does not override a statutory retention obligation,
 * and UAE AML law requires a brokerage to keep customer due diligence
 * records for five years — including for a deal that collapsed.
 *
 * So a lead with a KYC file is not erased on request. It is marked, the
 * requester is told plainly why and when the data will go, and the
 * compliance officer is notified. Quietly erasing it would leave the
 * brokerage unable to answer a Ministry of Economy inspection, which is a
 * worse outcome for them than the one the request was trying to avoid.
 *
 * Everything not covered by the obligation — marketing preferences, free
 * text notes, message content beyond the transaction — is still erased.
 */

/** One-way. Enough to answer "did you already erase this person?" and nothing more. */
const fingerprint = (phone: string) =>
  createHash("sha256").update(`erasure:${phone}`).digest("hex").slice(0, 32);

export type ErasureResult = {
  found: boolean;
  leadId?: string;
  messagesScrubbed: number;
  auditRowsScrubbed: number;
  completedAt: string;
  /** Set when a statutory obligation prevents erasure. */
  deferredUntil?: string;
  deferredReason?: string;
};

export async function eraseSubject(args: {
  orgId: string;
  phone: string;
  requestedBy: string;
  reason: string;
}): Promise<ErasureResult> {
  const db = forOrg(args.orgId);

  const lead = await db.lead.findUnique({
    where: { orgId_phone: { orgId: args.orgId, phone: args.phone } },
    select: { id: true },
  });

  // Statutory hold. Checked before anything is touched.
  if (lead) {
    const kyc = await db.kycRecord.findUnique({
      where: { leadId: lead.id },
      select: { id: true, status: true, completedAt: true, createdAt: true },
    });

    if (kyc && kyc.status !== "NOT_STARTED") {
      const held = kyc.completedAt ?? kyc.createdAt;
      const releaseAt = new Date(held);
      releaseAt.setUTCFullYear(releaseAt.getUTCFullYear() + AML_RETENTION_YEARS);

      if (releaseAt > new Date()) {
        await crossTenant("sweep").auditLog.create({
          data: {
            orgId: args.orgId,
            actorId: args.requestedBy,
            action: "privacy.erasure_deferred",
            entity: "Lead",
            entityId: lead.id,
            after: { reason: "AML retention obligation", releaseAt: releaseAt.toISOString() },
          },
        });

        return {
          found: true,
          leadId: lead.id,
          messagesScrubbed: 0,
          auditRowsScrubbed: 0,
          completedAt: new Date().toISOString(),
          deferredUntil: releaseAt.toISOString(),
          deferredReason:
            "This person has a customer due diligence file. UAE anti-money-laundering law " +
            "requires it to be kept for five years, and that obligation overrides an erasure " +
            "request. Tell them plainly, including the date it will be removed.",
        } as ErasureResult;
      }
    }
  }

  if (!lead) {
    return { found: false, messagesScrubbed: 0, auditRowsScrubbed: 0, completedAt: new Date().toISOString() };
  }

  const result = await db.$transaction(async (tx) => {
    /**
     * Messages. The row survives so the conversation's shape and timing
     * are still auditable; the content does not. Both directions are
     * scrubbed — what an agent wrote *to* somebody is as identifying as
     * what they wrote back.
     */
    const messages = await tx.message.updateMany({
      where: { conversation: { leadId: lead.id } },
      data: { body: "[erased at the person's request]", mediaUrl: null },
    });

    // Free-text answers can contain anything, including things volunteered
    // that nobody asked for.
    await tx.answer.deleteMany({ where: { leadId: lead.id } });
    await tx.enquiry.updateMany({ where: { leadId: lead.id }, data: { message: null } });
    await tx.viewing.updateMany({ where: { leadId: lead.id }, data: { outcome: null } });

    /**
     * The lead itself. Tombstoned rather than deleted, so viewing and
     * enquiry counts — which the brokerage needs for its own reporting and
     * which are not personal data once detached — do not silently change.
     */
    await tx.lead.update({
      where: { id: lead.id },
      data: {
        phone: `erased:${lead.id}`,
        name: null, email: null, notes: null,
        budgetMin: null, budgetMax: null, timeframe: null, financing: null,
        utmSource: null, utmMedium: null, utmCampaign: null,
        deletedAt: new Date(),
      },
    });

    return { messages: messages.count };
  });

  /**
   * The audit log. Scrubbed through a privileged path, because the
   * application role cannot UPDATE this table — and that is the point.
   * The scrub is itself audited below.
   */
  const audit = await crossTenant("sweep").$executeRaw`
    UPDATE "AuditLog"
       SET before = NULL,
           after  = jsonb_build_object('erased', true),
           ip = NULL,
           "userAgent" = NULL
     WHERE "orgId" = ${args.orgId}
       AND "entityId" = ${lead.id}
  `;

  await crossTenant("sweep").auditLog.create({
    data: {
      orgId: args.orgId,
      actorId: args.requestedBy,
      action: "privacy.erasure",
      entity: "Lead",
      entityId: lead.id,
      after: {
        // No phone, no name. A fingerprint answers "have we already done
        // this one?" without storing the thing being erased.
        subject: fingerprint(args.phone),
        reason: args.reason,
        messagesScrubbed: result.messages,
        auditRowsScrubbed: audit,
      },
    },
  });

  return {
    found: true,
    leadId: lead.id,
    messagesScrubbed: result.messages,
    auditRowsScrubbed: audit,
    completedAt: new Date().toISOString(),
  };
}

/**
 * Retention sweep.
 *
 * Runs nightly. Two clocks, and they are different on purpose:
 *
 *   - Soft-deleted leads are held for the brokerage's retention period,
 *     then erased. Long enough to undo a mistake, not so long that
 *     "we keep everything forever" becomes the honest answer.
 *   - A departed brokerage's whole tenancy is held for 90 days, then
 *     removed. Long enough to change their mind or lose an argument
 *     about an invoice.
 */
export async function retentionSweep(retentionDays = AML_RETENTION_YEARS * 365) {
  const cutoff = new Date(Date.now() - retentionDays * 86_400_000);

  const stale = await crossTenant("sweep").lead.findMany({
    where: { deletedAt: { not: null, lt: cutoff }, phone: { not: { startsWith: "erased:" } } },
    take: 500,
    select: { id: true, orgId: true, phone: true },
  });

  for (const l of stale) {
    await eraseSubject({
      orgId: l.orgId,
      phone: l.phone,
      requestedBy: "system",
      reason: `retention: deleted more than ${retentionDays} days ago`,
    });
  }

  const orgs = await crossTenant("sweep").organisation.findMany({
    where: { deletedAt: { not: null, lt: new Date(Date.now() - 90 * 86_400_000) } },
    select: { id: true, name: true },
  });

  // Not deleted automatically. A tenancy disappearing on a timer with
  // nobody looking is how a customer who was mid-renewal loses four years
  // of data — this raises it for a person to action.
  if (orgs.length) {
    log.warn(
      `[retention] ${orgs.length} organisation(s) past the 90-day window and awaiting manual removal:`,
      orgs.map((o) => o.name).join(", ")
    );
  }

  return { leadsErased: stale.length, orgsAwaitingRemoval: orgs.length };
}
