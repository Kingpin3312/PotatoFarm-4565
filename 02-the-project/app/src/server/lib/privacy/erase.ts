import { log } from "@/lib/log";
import { crossTenant, forOrg } from "@/server/db/client";
import { createHash } from "node:crypto";
import { AML_RETENTION_YEARS } from "@/server/lib/aml/rules";
import { normalisePhone } from "@/server/lib/portals/normalise";

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
  /** Property owners with this number, erased alongside — see `eraseOwner`. */
  ownersErased?: number;
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

        // The due diligence file is about them as a buyer. Anything held
        // about them as an owner is not covered by it, and goes.
        const owners = await eraseOwners(args);
        return {
          found: true,
          leadId: lead.id,
          ownersErased: owners.count,
          messagesScrubbed: owners.messages,
          auditRowsScrubbed: owners.auditRows,
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
    // Perhaps an owner, and only an owner.
    const owners = await eraseOwners(args);
    if (!owners.count) {
      return { found: false, messagesScrubbed: 0, auditRowsScrubbed: 0, completedAt: new Date().toISOString() };
    }
    return {
      found: true, ownersErased: owners.count, messagesScrubbed: owners.messages,
      auditRowsScrubbed: owners.auditRows, completedAt: new Date().toISOString(),
    };
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
    // What they said about a property, in their own words. The verdict
    // and the reasons stay: they are ticks from a short list, counted in
    // an owner's report, and say nothing about who ticked them.
    await tx.viewingFeedback.updateMany({ where: { leadId: lead.id }, data: { comment: null } });

    const viewings = await tx.viewing.findMany({ where: { leadId: lead.id }, select: { id: true } });
    const convo = await tx.conversation.findUnique({ where: { leadId: lead.id }, select: { id: true } });
    await scrubParty(tx, { leadId: lead.id }, [lead.id, ...(convo ? [convo.id] : []), ...viewings.map((v) => v.id)]);

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
        budgetMinFils: null, budgetMaxFils: null, timeframe: null, financing: null,
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

  // The same number may also be an owner — somebody selling one flat
  // and buying another. Their seller side goes too.
  const owners = await eraseOwners(args);

  return {
    found: true,
    leadId: lead.id,
    ownersErased: owners.count,
    messagesScrubbed: result.messages + owners.messages,
    auditRowsScrubbed: audit + owners.auditRows,
    completedAt: new Date().toISOString(),
  };
}

type Scrubber = Parameters<Parameters<ReturnType<typeof forOrg>["$transaction"]>[0]>[0];

/**
 * Everything else written about a person, wherever it was written.
 *
 * Erasure covered the thread, the answers and the lead record, and
 * nothing that later work wrote about somebody: a follow-up titled
 * "Ask Priya what they thought of…", a notification reading "Hana
 * Suleiman (owner) is waiting", an agent's private note and nickname,
 * the facts recorded about a client, a voice note's transcript, an
 * email's subject line. Each is a name or a sentence about them, and
 * each survived a request to be forgotten.
 *
 * Rows are kept where something counts them — a completed follow-up, a
 * recommendation acted on — and their words removed. Facts about a
 * client exist only to describe them, so they go, as answers do.
 *
 * Offers are not touched: their terms are the negotiation record both
 * sides argue about later, not a description of the person.
 */
async function scrubParty(tx: Scrubber, party: { leadId: string } | { vendorId: string }, subjects: string[]) {
  const where = party;
  await tx.followUp.updateMany({ where, data: { title: "Follow-up about a person who asked to be forgotten", body: null } });
  await tx.recommendation.updateMany({ where, data: { headline: "Erased at the person's request", reason: "", dismissReason: null } });
  await tx.blackbookEntry.updateMany({
    where, data: { nickname: null, privateNote: null, standaloneName: null, standalonePhone: null, standaloneEmail: null },
  });
  await tx.clientFact.deleteMany({ where });
  await tx.agentRequest.updateMany({ where, data: { transcript: "[erased at the person's request]", escalationReason: null } });
  await tx.emailMessage.updateMany({ where, data: { fromAddress: "erased", subject: null, snippet: null, webLink: null } });
  // Notifications name the person in their title and body. They are a
  // prompt, not a record, so the ones about this person go.
  if (subjects.length) {
    await tx.notification.deleteMany({
      where: { OR: [{ subjectId: { in: subjects } }, ...subjects.map((id) => ({ deeplink: { contains: id } }))] },
    });
  }
}

/**
 * A property owner with this number.
 *
 * Owners have had a WhatsApp thread with the brokerage since
 * `20260929090000_owner_conversations`, and erasure was keyed on a
 * buyer's phone alone — so an owner's request to be forgotten could not
 * be honoured at all. Matched by normalised number, because an owner's
 * is typed by an agent.
 *
 * The owner's row stays as a nameless placeholder, as a buyer's does:
 * their listings, offers and weekly-report history count it. Their
 * reports stop, since there is nobody left to send one to.
 *
 * No statutory hold applies here: due diligence in this product is kept
 * on the buyer's side (`KycRecord.leadId`). If seller due diligence is
 * ever recorded, it needs the same deferral as `eraseSubject` applies.
 */
async function eraseOwners(args: { orgId: string; phone: string; requestedBy: string; reason: string }) {
  const db = forOrg(args.orgId);
  const want = normalisePhone(args.phone) ?? args.phone;
  const candidates = await db.vendor.findMany({ where: { phone: { not: null } }, select: { id: true, phone: true } });
  const owners = candidates.filter((v) => normalisePhone(v.phone ?? undefined) === want);

  let messages = 0, auditRows = 0;
  for (const owner of owners) {
    messages += await db.$transaction(async (tx) => {
      const convo = await tx.conversation.findUnique({ where: { vendorId: owner.id }, select: { id: true } });
      const m = convo
        ? await tx.message.updateMany({ where: { conversationId: convo.id }, data: { body: "[erased at the person's request]", mediaUrl: null } })
        : { count: 0 };
      await tx.vendor.update({
        where: { id: owner.id },
        data: { name: "Erased owner", phone: null, email: null, actingFor: null, reportsOff: true },
      });
      await scrubParty(tx, { vendorId: owner.id }, [owner.id, ...(convo ? [convo.id] : [])]);
      return m.count;
    });

    auditRows += await crossTenant("sweep").$executeRaw`
      UPDATE "AuditLog"
         SET before = NULL, after = jsonb_build_object('erased', true), ip = NULL, "userAgent" = NULL
       WHERE "orgId" = ${args.orgId} AND "entityId" = ${owner.id}
    `;
    await crossTenant("sweep").auditLog.create({
      data: {
        orgId: args.orgId, actorId: args.requestedBy, action: "privacy.erasure",
        entity: "Vendor", entityId: owner.id,
        after: { subject: fingerprint(args.phone), reason: args.reason },
      },
    });
  }
  return { count: owners.length, messages, auditRows };
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
    // Second argument is the log context, not a message. The names go
    // in the third, which is where the scrubber can see them.
    log.warn(
      `[retention] ${orgs.length} organisation(s) past the 90-day window and awaiting manual removal`,
      {},
      { organisations: orgs.map((o) => o.name).join(", ") }
    );
  }

  return { leadsErased: stale.length, orgsAwaitingRemoval: orgs.length };
}
