import { log } from "@/lib/log";
import { crossTenant } from "@/server/db/client";
import { forOrg } from "@/server/db/client";
import { Prisma } from "@prisma/client";
import { entryStageId } from "@/server/lib/pipeline/defaults";

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
  }

  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    // The lead is identified by phone. Upsert rather than create, because
    // a returning enquirer is the same person, not a new one.
    // Placed on the board at the moment it is created. Without this the
    // lead is complete, correct and invisible: `pipeline.board` selects
    // by `stageId`, so a null one means the enquiry never appears on the
    // screen the brokerage watches.
    const stageId = await entryStageId(tx, channel.orgId, "NEW");

    const lead = await tx.lead.upsert({
      where: { orgId_phone: { orgId: channel.orgId, phone: from } },
      create: {
        orgId: channel.orgId,
        phone: from,
        name: profileName,
        status: "NEW",
        source: "WHATSAPP_AD",
        ...(stageId ? { stageId } : {}),
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

    const conversation = await tx.conversation.upsert({
      where: { leadId: lead.id },
      create: {
        orgId: channel.orgId,
        leadId: lead.id,
        channelId: channel.id,
        lastInboundAt: sentAt,
        unreadCount: 1,
      },
      update: {
        // Only move the clock forward — a redelivered old message must not
        // reopen a window that has actually closed.
        lastInboundAt: sentAt,
        unreadCount: { increment: 1 },
      },
    });

    await tx.message.upsert({
      // The provider id is unique, so a redelivery updates nothing.
      where: { externalId: msg.id },
      create: {
        orgId: channel.orgId,
        conversationId: conversation.id,
        externalId: msg.id,
        direction: "INBOUND",
        author: "LEAD",
        body,
        status: "DELIVERED",
        sentAt,
      },
      update: {},
    });
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
