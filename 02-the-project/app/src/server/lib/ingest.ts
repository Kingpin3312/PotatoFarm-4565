import { log } from "@/lib/log";
import { crossTenant } from "@/server/db/client";
import { forOrg } from "@/server/db/client";
import { Prisma } from "@prisma/client";
import { entryStageId } from "@/server/lib/pipeline/defaults";
import { assignmentFor } from "@/server/lib/routing/apply";
import { normalisePhone } from "@/server/lib/portals/normalise";

/**
 * Inbound WhatsApp.
 *
 * Two things this has to survive, because both happen in production:
 *
 * 1. **Redelivery.** Meta resends anything it is not sure you received.
 *    Every write is keyed on the provider's message id, and a duplicate
 *    is a no-op rather than a second message in the thread.
 * 2. **Out-of-order arrival.** Status callbacks routinely land before the
 *    message they refer to. Statuses only ever move forward.
 */
const STATUS_ORDER = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4 } as const;

export async function ingest(payload: any) {
  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      const phoneNumberId = value?.metadata?.phone_number_id;
      if (!phoneNumberId) continue;

      // Which brokerage owns this number. Looked up unscoped because the
      // webhook has no session — this is the one place that is correct.
      const channel = await crossTenant("global-key").channel.findFirst({
        where: { type: "WHATSAPP", identifier: phoneNumberId, active: true },
        select: { id: true, orgId: true },
      });
      if (!channel) {
        log.warn("[whatsapp] message for an unknown number", phoneNumberId);
        continue;
      }

      const db = forOrg(channel.orgId);

      for (const msg of value.messages ?? []) await inbound(db, channel, msg, value);
      for (const st of value.statuses ?? []) await status(db, st);
    }
  }
}

async function inbound(db: any, channel: { id: string; orgId: string }, msg: any, value: any) {
  const from = `+${msg.from}`;
  const profileName = value.contacts?.[0]?.profile?.name as string | undefined;
  const sentAt = new Date(Number(msg.timestamp) * 1000);
  const body =
    msg.text?.body ??
    msg.button?.text ??
    msg.interactive?.list_reply?.title ??
    `[${msg.type}]`;

  // Checked before anything else. "Stop" has to work on the first
  // message, without a confirmation step and without a human seeing it
  // first — a stop that takes a day is not a stop.
  const { isOptOut } = await import("./matching/outreach");
  if (isOptOut(body)) {
    await db.lead.updateMany({
      where: { orgId: channel.orgId, phone: from },
      data: { optedOutOfOutreach: true, optedOutAt: new Date() },
    });
    // An owner's scheduled messages are the weekly report. "Stop" from
    // them turns it off, the same instruction in the only form it has.
    const owners = await ownersWithNumber(db, from);
    if (owners.length) {
      await db.vendor.updateMany({ where: { id: { in: owners.map((o) => o.id) } }, data: { reportsOff: true } });
    }
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    /**
     * A redelivery changes nothing.
     *
     * The file opens by promising that "a duplicate is a no-op", and the
     * message row was — but the conversation update beside it ran again
     * each time: another unread on the badge for a message already read,
     * and the reply clock moved to whatever the old message said.
     */
    const seen = await tx.message.findUnique({ where: { externalId: msg.id }, select: { id: true } });
    if (seen) return;

    // The lead is identified by phone. Upsert rather than create, because
    // a returning enquirer is the same person, not a new one.
    // Placed on the board at the moment it is created. Without this the
    // lead is complete, correct and invisible: `pipeline.board` selects
    // by `stageId`, so a null one means the enquiry never appears on the
    // screen the brokerage watches.
    const stageId = await entryStageId(tx, channel.orgId, "NEW");

    /**
     * Who gets it.
     *
     * `route()` existed and was called by nothing but the settings
     * preview, and neither this path nor the portal feed set
     * `assignedToId` at all — so every lead from every channel arrived
     * unowned and stayed that way, while a screen demonstrated the
     * rotation that never ran.
     *
     * Resolved before the upsert because it only applies to a lead being
     * created: a returning enquirer already has an owner, and reassigning
     * them on a new message would take a lead off the agent who has been
     * working it.
     */
    const known = await tx.lead.findUnique({
      where: { orgId_phone: { orgId: channel.orgId, phone: from } },
      select: { id: true, assignedToId: true },
    });

    /**
     * Not a buyer we know — perhaps an owner.
     *
     * Every number that was not a lead became one, so an owner replying
     * to their agent about their own flat was filed as a new enquiry,
     * handed to the routing rotation, and qualified as a buyer. A known
     * buyer still wins: somebody who enquired first is in that thread
     * already, and moving them would split one conversation into two.
     */
    if (!known) {
      const owner = (await ownersWithNumber(tx, from))[0];
      if (owner) {
        const conversation = await arrived(tx, { vendorId: owner.id }, channel, sentAt);
        await store(tx, channel.orgId, conversation.id, msg.id, body, sentAt);
        return;
      }
    }

    const assignment = known
      ? null
      : await assignmentFor(tx, { orgId: channel.orgId, source: "WHATSAPP_AD" });

    const lead = await tx.lead.upsert({
      where: { orgId_phone: { orgId: channel.orgId, phone: from } },
      create: {
        orgId: channel.orgId,
        phone: from,
        name: profileName,
        status: "NEW",
        source: "WHATSAPP_AD",
        ...(stageId ? { stageId } : {}),
        ...(assignment?.userId
          ? { assignedToId: assignment.userId, assignedAt: new Date() }
          : {}),
      },
      /**
       * Empty, and it has to be empty.
       *
       * The intent — never overwrite a name an agent has corrected with
       * the one from the WhatsApp profile — was written as
       * `{ name: { set: undefined } as any }`. Prisma rejects that at
       * validation:
       *
       *     Invalid `prisma.lead.upsert()` invocation
       *     update: { name: { set: undefined } }
       *                     ~~~~~~~~~~~~~~~~
       *
       * and it rejects the *call*, not the branch — so this threw for a
       * first-time enquirer as well as a returning one. **Every inbound
       * WhatsApp message failed**, on a WhatsApp-first CRM.
       *
       * It was invisible because the route answers Meta before it does
       * the work and the rejection landed in a `.catch` that logged to
       * the console, so Meta got its 200 and nobody got the message.
       * And it could not be reached at all until a channel could be
       * created, which is what surfaced it.
       *
       * The `as any` is what let it compile. That cast is the whole
       * story: the type system had the answer and was told to be quiet.
       */
      update: {},
    });

    /**
     * The ownership record, alongside the assignment.
     *
     * `routing.history` answers "why did that lead not come to me",
     * which agents ask more than anything else in this product, and it
     * reads `LeadOwnership`. An assignment with no ownership row is an
     * answer nobody can give — and `FIRST_ASSIGNMENT` is the reason
     * enum written for exactly this moment.
     */
    if (!known && assignment?.userId) {
      await tx.leadOwnership.create({
        data: {
          orgId: channel.orgId,
          leadId: lead.id,
          userId: assignment.userId,
          reason: "FIRST_ASSIGNMENT",
          note: assignment.why,
        },
      });
    }

    const conversation = await arrived(tx, { leadId: lead.id }, channel, sentAt);
    await store(tx, channel.orgId, conversation.id, msg.id, body, sentAt);
  });
}

/**
 * The owners whose number this is. Owners' numbers are typed by agents —
 * "050 123 4567" — so they are compared once normalised, never as typed.
 * The one with a thread already comes first, then the most recent.
 */
async function ownersWithNumber(db: any, from: string): Promise<{ id: string }[]> {
  const rows: { id: string; phone: string | null; updatedAt: Date; conversation: { id: string } | null }[] =
    await db.vendor.findMany({
      where: { phone: { not: null } },
      select: { id: true, phone: true, updatedAt: true, conversation: { select: { id: true } } },
      take: 5000,
    });
  return rows
    .filter((v) => normalisePhone(v.phone ?? undefined) === from)
    .sort((a, b) => Number(!!b.conversation) - Number(!!a.conversation) || b.updatedAt.getTime() - a.updatedAt.getTime());
}

/**
 * The party's thread, with the message counted on it.
 *
 * The reply clock only moves forward — the comment here always said so
 * and the code set it to whatever arrived. Meta delivers out of order,
 * and an older message landing second would have closed a window that
 * was open.
 */
async function arrived(
  tx: any,
  party: { leadId: string } | { vendorId: string },
  channel: { id: string; orgId: string },
  sentAt: Date,
): Promise<{ id: string }> {
  const existing = await tx.conversation.findUnique({ where: party, select: { id: true, lastInboundAt: true } });
  if (!existing) {
    return tx.conversation.create({
      data: { orgId: channel.orgId, ...party, channelId: channel.id, lastInboundAt: sentAt, unreadCount: 1 },
      select: { id: true },
    });
  }
  return tx.conversation.update({
    where: { id: existing.id },
    data: {
      unreadCount: { increment: 1 },
      ...(!existing.lastInboundAt || sentAt > existing.lastInboundAt ? { lastInboundAt: sentAt } : {}),
    },
    select: { id: true },
  });
}

async function store(tx: any, orgId: string, conversationId: string, externalId: string, body: string, sentAt: Date) {
  await tx.message.upsert({
    // The provider id is unique, so a redelivery racing this one updates nothing.
    where: { externalId },
    create: {
      orgId, conversationId, externalId,
      direction: "INBOUND",
      // The party, whoever they are. `LEAD` is the enum's name for
      // "the other side", and an owner is the other side too.
      author: "LEAD",
      body, status: "DELIVERED", sentAt,
    },
    update: {},
  });
}

async function status(db: any, st: any) {
  const next = String(st.status).toUpperCase() as keyof typeof STATUS_ORDER;
  if (!(next in STATUS_ORDER)) return;

  const existing = await db.message.findUnique({
    where: { externalId: st.id },
    select: { id: true, status: true },
  });
  // A status for a message we have not stored yet. Meta will resend.
  if (!existing) return;

  // Statuses only move forward. A late 'sent' must not undo a 'read'.
  if (STATUS_ORDER[next] <= STATUS_ORDER[existing.status as keyof typeof STATUS_ORDER]) return;

  await db.message.update({
    where: { id: existing.id },
    data: {
      status: next,
      deliveredAt: next === "DELIVERED" ? new Date() : undefined,
      readAt: next === "READ" ? new Date() : undefined,
      failure: st.errors?.[0]?.title,
    },
  });
}
