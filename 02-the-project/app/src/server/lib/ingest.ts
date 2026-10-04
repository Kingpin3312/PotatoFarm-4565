import { log } from "@/lib/log";
import { crossTenant } from "@/server/db/client";
import { forOrg } from "@/server/db/client";
import { Prisma } from "@prisma/client";
import { entryStageId } from "@/server/lib/pipeline/defaults";
import { assignmentFor } from "@/server/lib/routing/apply";
import { normalisePhone } from "@/server/lib/portals/normalise";
import { reply } from "@/server/assistant/run";
import { detectLanguage } from "@/server/lib/language";
import { mentionedPortal, referenceCandidates, PORTAL_LABEL } from "@/server/lib/portals/mention";
import { micrositeInText } from "@/lib/microsite/content";
import { loadLive } from "@/server/lib/microsite/public";
import { refVariants } from "@/lib/reference";
import { handlePick } from "@/server/lib/viewings/offer";

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

      for (const msg of value.messages ?? []) {
        const fresh = await inbound(db, channel, msg, value);
        /**
         * A reply: sent by the assistant while the buyer is being
         * qualified at a brokerage that has switched that on, drafted for
         * a person otherwise — `reply` in `assistant/run.ts` decides.
         *
         * After the message is stored and committed, never inside that
         * transaction: the model takes seconds, and a failure here must
         * not lose the buyer's message. Only for a buyer's new message —
         * not a redelivery, not an owner. The assistant itself decides the
         * rest (kill switch, handover, mute, the window) in `prepare`.
         */
        if (fresh) {
          /**
           * A pick from the viewing times they were offered becomes a
           * held request for the agent (`viewings/offer.ts`) — before the
           * reply, so the reply is drafted knowing it.
           */
          const text = msg.text?.body ?? msg.button?.text ?? msg.interactive?.list_reply?.title;
          if (text) {
            await handlePick(channel.orgId, fresh.conversationId, text).catch((err) =>
              log.error("[whatsapp] could not read a viewing pick", { orgId: channel.orgId }, { reason: String(err).slice(0, 200) }));
          }
          await reply(channel.orgId, fresh.conversationId, fresh.messageId, msg.id).catch((err) =>
            log.error("[whatsapp] could not reply", { orgId: channel.orgId }, { reason: String(err).slice(0, 200) }));
        }
      }
      for (const st of value.statuses ?? []) await status(db, st);
    }
  }
}

/** The buyer's conversation and the message, when this was a new message from a buyer. */
async function inbound(
  db: any, channel: { id: string; orgId: string }, msg: any, value: any,
): Promise<{ conversationId: string; messageId: string } | null> {
  const from = `+${msg.from}`;
  const profileName = value.contacts?.[0]?.profile?.name as string | undefined;
  const sentAt = new Date(Number(msg.timestamp) * 1000);
  const media = sentFile(msg);
  const body =
    msg.text?.body ??
    msg.button?.text ??
    msg.interactive?.list_reply?.title ??
    media?.body ??
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

  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    /**
     * A redelivery changes nothing.
     *
     * The file opens by promising that "a duplicate is a no-op", and the
     * message row was — but the conversation update beside it ran again
     * each time: another unread on the badge for a message already read,
     * and the reply clock moved to whatever the old message said.
     */
    const seen = await tx.message.findUnique({ where: { externalId: msg.id }, select: { id: true } });
    if (seen) return null;

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
        await store(tx, channel.orgId, conversation.id, msg.id, body, sentAt, media);
        return null;
      }
    }

    /**
     * Which portal sent them, when the message says so.
     *
     * A buyer who pressed WhatsApp on a Bayut advert arrives here, not at
     * a portal webhook, and was filed as `WHATSAPP_AD` — so the report of
     * where leads come from credited WhatsApp with what the portal was
     * paid for, and a routing rule for Bayut leads never matched them.
     * Read off the first message only: a returning buyer is already
     * filed, and "I also saw one on Bayut" months later says nothing about
     * where they came from. `portals/mention.ts` says what counts.
     */
    const portal = known ? null : mentionedPortal(body);
    /**
     * Which agent's microsite sent them, when the message carries its
     * address — which the site's "WhatsApp me" button writes in. The
     * buyer chose that agent, so the lead goes to them rather than
     * through the rotation. First message only, for the same reason as
     * the portal: a returning buyer already has an agent.
     */
    const site = known ? null : await micrositeFromMessage(channel.orgId, body);
    const source = site ? "AGENT_MICROSITE" : portal ?? "WHATSAPP_AD";
    const assignment = known
      ? null
      : site
        ? { userId: site.userId, why: `Messaged from ${site.name}'s microsite.` }
        : await assignmentFor(tx, { orgId: channel.orgId, source });

    const lead = await tx.lead.upsert({
      where: { orgId_phone: { orgId: channel.orgId, phone: from } },
      create: {
        orgId: channel.orgId,
        phone: from,
        name: profileName,
        // The language they wrote their first message in, so the reply
        // is in it too. See `lib/language.ts`.
        language: detectLanguage(body) ?? "en",
        status: "NEW",
        source,
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
    const message = await store(tx, channel.orgId, conversation.id, msg.id, body, sentAt, media);
    await enquiryFromMessage(tx, {
      orgId: channel.orgId, channelId: channel.id, leadId: lead.id, isNew: !known,
      portal, site, body, externalId: msg.id, sentAt,
    });
    return { conversationId: conversation.id, messageId: message.id };
  });
}

/**
 * The enquiry a WhatsApp message makes, when it names a portal or one of
 * this brokerage's properties.
 *
 * The same row a portal's own delivery writes, so the property's
 * enquiries, "who wants this property" and the report of where leads
 * come from all count it. Its campaign is "Bayut, via WhatsApp": the
 * report groups on campaign before channel, so the portal is credited
 * and the way it arrived is still said.
 *
 * A reference counts only when this brokerage has a live listing with
 * it. A returning buyer makes a new enquiry only for a property they
 * have not enquired about — every "is it still available?" about the
 * same flat is one enquiry, not a column of them. Keyed on the message,
 * so a redelivery adds nothing.
 */
async function enquiryFromMessage(tx: any, m: {
  orgId: string; channelId: string; leadId: string; isNew: boolean;
  portal: ReturnType<typeof mentionedPortal>; site: Awaited<ReturnType<typeof micrositeFromMessage>>;
  body: string; externalId: string; sentAt: Date;
}) {
  const refs = referenceCandidates(m.body);
  const listing = refs.length
    ? await tx.listing.findFirst({
        where: {
          orgId: m.orgId, deletedAt: null,
          OR: refs.flatMap(refVariants).map((r) => ({ reference: { equals: r, mode: "insensitive" } })),
        },
        select: { id: true },
      })
    : null;
  if (!listing && !(m.isNew && (m.portal || m.site))) return;
  if (!m.isNew && listing) {
    const already = await tx.enquiry.findFirst({
      where: { orgId: m.orgId, leadId: m.leadId, listingId: listing.id }, select: { id: true },
    });
    if (already) return;
  }
  await tx.enquiry.create({
    data: {
      orgId: m.orgId, leadId: m.leadId, listingId: listing?.id ?? null, channelId: m.channelId,
      externalId: `wa:${m.externalId}`,
      message: m.body.slice(0, 2000),
      campaign: m.site ? `Agent microsite · ${m.site.name}, via WhatsApp` : m.portal ? `${PORTAL_LABEL[m.portal]}, via WhatsApp` : null,
      micrositeId: m.site?.micrositeId ?? null,
      createdAt: m.sentAt,
    },
  });
  if (m.site) {
    await tx.micrositeEvent.create({ data: { orgId: m.orgId, micrositeId: m.site.micrositeId, kind: "LEAD", listingId: listing?.id ?? null } });
  }
}

/**
 * The live microsite of *this* brokerage whose address the message
 * carries, or null. An address of another brokerage's agent, a draft, or
 * a site an admin took down gives nothing.
 */
async function micrositeFromMessage(orgId: string, body: string) {
  const found = micrositeInText(body);
  if (!found) return null;
  const l = await loadLive(found.orgSlug, found.agentSlug);
  if (!l || l.org.id !== orgId) return null;
  return { userId: l.site.userId, micrositeId: l.site.id, name: l.content.name };
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

/**
 * A photo or a document, as a reference and a line for the thread.
 *
 * It was `[image]` and nothing else: the id Meta sends — the only way to
 * fetch the file — was dropped on arrival. So the passport the identity
 * panel's request asks a buyer to send on WhatsApp arrived, showed as
 * "[image]", and could never reach the file; the agent had to ask again
 * some other way. The id is kept now, and the file stays with Meta until
 * somebody files it — `collect.ts` rule 4: the image never lives in the
 * thread.
 */
export function sentFile(msg: any): { body: string; mediaId: string; mediaType: string | null } | null {
  const part = msg.type === "image" ? msg.image : msg.type === "document" ? msg.document : null;
  if (!part?.id) return null;
  const caption = typeof part.caption === "string" && part.caption.trim() ? part.caption.trim() : null;
  const name = typeof part.filename === "string" && part.filename.trim() ? part.filename.trim().slice(0, 120) : null;
  const what = msg.type === "image" ? "[photo]" : `[document${name ? `: ${name}` : ""}]`;
  return {
    body: caption ? `${what} ${caption}` : what,
    mediaId: String(part.id).slice(0, 100),
    mediaType: typeof part.mime_type === "string" ? part.mime_type.split(";")[0].trim().slice(0, 100) : null,
  };
}

async function store(
  tx: any, orgId: string, conversationId: string, externalId: string, body: string, sentAt: Date,
  media: { mediaId: string; mediaType: string | null } | null = null,
): Promise<{ id: string }> {
  return tx.message.upsert({
    // The provider id is unique, so a redelivery racing this one updates nothing.
    where: { externalId },
    create: {
      orgId, conversationId, externalId,
      direction: "INBOUND",
      // The party, whoever they are. `LEAD` is the enum's name for
      // "the other side", and an owner is the other side too.
      author: "LEAD",
      body, status: "DELIVERED", sentAt,
      ...(media ? { mediaId: media.mediaId, mediaType: media.mediaType } : {}),
    },
    update: {},
    select: { id: true },
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
