import { Prisma } from "@prisma/client";
import { forOrg } from "@/server/db/client";
import { availableSlots, offerable } from "@/server/lib/scheduling";
import { messagingWindow, sendText } from "@/server/lib/whatsapp";
import { getChannelCredentials } from "@/server/lib/secrets";
import { audit } from "@/server/lib/audit";
import { log } from "@/lib/log";
import { offerMessage, readPick, slotLabel, type Lang } from "./pick";

/**
 * Real free times, offered to a buyer; their pick held for the agent.
 *
 * The assistant's script ended "suggest a viewing and say an agent will
 * confirm the time" — with no time. The buyer was left to propose one,
 * the agent to check their diary, and the two to go back and forth on
 * WhatsApp, which is the slowest part of the journey the product exists
 * to make fast. Now the buyer is offered up to three of the agent's
 * actual free slots (`availableSlots`: working hours, the diary, travel
 * between viewings, the agent's own calendar), and their pick becomes a
 * held request.
 *
 * **Nothing is booked without the agent** — the owner's decision. A pick
 * holds the slot (so nobody else is offered it) until the agent confirms
 * or declines (`viewings.confirmRequest` / `declineRequest`), and the
 * buyer hears "confirmed" only from the agent's tap. A request the agent
 * never answers is not quietly released: `expireHolds` puts it on their
 * list.
 */

const OFFER_DAYS = 7;
const DURATION = 30;
const EXCLUSION_VIOLATION = "23P01";

type Db = ReturnType<typeof forOrg>;

async function context(db: Db, conversationId: string) {
  const c = await db.conversation.findUnique({
    where: { id: conversationId },
    select: {
      id: true, channelId: true, lastInboundAt: true,
      lead: {
        select: {
          id: true, phone: true, name: true, language: true, assignedToId: true,
          enquiries: { take: 1, orderBy: { createdAt: "desc" }, where: { listingId: { not: null } },
            select: { listing: { select: { id: true, title: true, community: true, building: true, agentId: true, deletedAt: true } } } },
        },
      },
    },
  });
  if (!c?.lead) return null;
  const listing = c.lead.enquiries[0]?.listing;
  return { convo: c, lead: c.lead, listing: listing && !listing.deletedAt ? listing : null };
}

const langOf = (l: string | null | undefined): Lang => (l === "ar" ? "ar" : "en");

/**
 * Make an offer: up to three free slots for the buyer's agent, worded in
 * their language. Closes any earlier open offer on the conversation —
 * there is one live set of times at once. Returns the text to send, or
 * why there is nothing to offer; sending is the caller's, because who
 * sends it (the assistant, or the agent's tap) is the caller's to know.
 */
export async function makeOffer(orgId: string, conversationId: string, now = new Date()) {
  const db = forOrg(orgId);
  const ctx = await context(db, conversationId);
  if (!ctx) return { ok: false as const, reason: "no_buyer" as const };
  const agentId = ctx.lead.assignedToId ?? ctx.listing?.agentId ?? null;
  if (!agentId) return { ok: false as const, reason: "no_agent" as const };

  const free = await availableSlots({ orgId, agentId, from: now, days: OFFER_DAYS, durationMins: DURATION, community: ctx.listing?.community });
  const slots = offerable(free.slots).map((s) => s.start);
  if (!slots.length) return { ok: false as const, reason: "no_free_time" as const };

  const agent = await db.user.findUnique({ where: { id: agentId }, select: { name: true } });
  const firstName = agent?.name?.split(" ")[0] ?? null;
  const offer = await db.$transaction(async (tx) => {
    await tx.viewingOffer.updateMany({ where: { conversationId, closedAt: null }, data: { closedAt: now } });
    return tx.viewingOffer.create({
      data: { orgId, conversationId, leadId: ctx.lead.id, listingId: ctx.listing?.id ?? null, agentId, slots },
      select: { id: true },
    });
  });
  const text = offerMessage({ lang: langOf(ctx.lead.language), agentName: firstName, listingTitle: ctx.listing?.title ?? null, slots });
  return { ok: true as const, offerId: offer.id, text, slots, agentId };
}

/**
 * Send a WhatsApp text on a buyer's thread and record it, the way
 * `conversations.send` does: PENDING first, so a message that leaves and
 * never comes back with an id is visible as stuck rather than lost.
 * Inside the 24-hour window only — outside it nothing free-form sends.
 */
export async function sendOnThread(orgId: string, conversationId: string, body: string,
  by: { author: "ASSISTANT" | "AGENT"; authorId?: string | null }) {
  const db = forOrg(orgId);
  const c = await db.conversation.findUnique({
    where: { id: conversationId }, select: { id: true, channelId: true, lastInboundAt: true, lead: { select: { phone: true } } },
  });
  if (!c?.lead) return { sent: false as const, reason: "no_buyer" as const };
  if (!messagingWindow(c.lastInboundAt).open) return { sent: false as const, reason: "window_closed" as const };
  const creds = await getChannelCredentials(orgId, c.channelId);
  const pending = await db.message.create({
    data: { orgId, conversationId, direction: "OUTBOUND", author: by.author, authorId: by.authorId ?? null, body, status: "PENDING" },
  });
  try {
    const { externalId } = await sendText({ phoneNumberId: creds.phoneNumberId, accessToken: creds.accessToken, to: c.lead.phone.replace("+", ""), body });
    await db.conversation.update({ where: { id: conversationId }, data: { lastOutboundAt: new Date() } });
    await db.message.update({ where: { id: pending.id }, data: { externalId, status: "SENT" } });
    return { sent: true as const, messageId: pending.id };
  } catch (err) {
    await db.message.update({ where: { id: pending.id }, data: { status: "FAILED", failure: String((err as Error).message).slice(0, 300) } });
    return { sent: false as const, reason: "send_failed" as const };
  }
}

/**
 * A buyer's message, read against the open offer on their thread. A pick
 * holds that slot as a request for the agent; anything else leaves the
 * offer open and the message to the usual reply. The hold lasts until
 * the slot itself, and the exclusion constraint on Viewing is what makes
 * "somebody took it first" a refusal rather than a double booking.
 */
export async function handlePick(orgId: string, conversationId: string, text: string, now = new Date()) {
  const db = forOrg(orgId);
  const offer = await db.viewingOffer.findFirst({
    where: { conversationId, closedAt: null, createdAt: { gt: new Date(now.getTime() - OFFER_DAYS * 86_400_000) } },
    orderBy: { createdAt: "desc" },
  });
  if (!offer) return { picked: false as const };
  const i = readPick(text, offer.slots);
  if (i === null) return { picked: false as const };
  const at = offer.slots[i]!;

  const ctx = await context(db, conversationId);
  const who = ctx?.lead.name ?? ctx?.lead.phone ?? "A buyer";
  const where = ctx?.listing?.title ? ` at ${ctx.listing.title}` : "";
  const label = slotLabel(at, "en");

  if (at.getTime() < now.getTime() + 60 * 60_000) {
    await db.$transaction(async (tx) => {
      await tx.viewingOffer.update({ where: { id: offer.id }, data: { closedAt: now } });
      await tx.followUp.create({ data: {
        orgId, agentId: offer.agentId, leadId: offer.leadId, dueAt: now,
        title: `${who} picked ${label}, which has passed`,
        body: `They answered your viewing times too late for the one they chose${where}. Offer them new ones.`,
      } });
    });
    return { picked: false as const, reason: "too_late" as const };
  }

  try {
    const viewing = await db.$transaction(async (tx) => {
      const v = await tx.viewing.create({
        data: {
          orgId, leadId: offer.leadId, listingId: offer.listingId, agentId: offer.agentId,
          scheduledAt: at, durationMins: DURATION, status: "SCHEDULED",
          heldUntil: at, requestedAt: now,
          building: ctx?.listing?.building ?? null,
        },
        select: { id: true },
      });
      await tx.viewingOffer.update({ where: { id: offer.id }, data: { closedAt: now, viewingId: v.id } });
      await tx.followUp.create({ data: {
        orgId, agentId: offer.agentId, leadId: offer.leadId, viewingId: v.id, listingId: offer.listingId, dueAt: now,
        title: `Confirm ${who}'s viewing: ${label}`,
        body: `They picked this from the times you were offered${where}. The slot is held for you; nothing is booked until you confirm it on Viewings.`,
      } });
      await audit(tx, orgId, { actorId: null, action: "viewing.requested", entity: "Viewing", entityId: v.id, after: { offerId: offer.id, slot: i + 1 } });
      return v;
    });
    return { picked: true as const, viewingId: viewing.id };
  } catch (err) {
    const code = (err as { code?: string; meta?: { code?: string } }).meta?.code ?? (err as { code?: string }).code;
    const taken = (err instanceof Prisma.PrismaClientKnownRequestError || err instanceof Prisma.PrismaClientUnknownRequestError)
      && (code === EXCLUSION_VIOLATION || String(err.message).includes(EXCLUSION_VIOLATION) || /exclusion|conflicting key/i.test(String(err.message)));
    if (!taken) throw err;
    log.info("[viewings] picked slot was taken first", { orgId });
    await db.$transaction(async (tx) => {
      await tx.viewingOffer.update({ where: { id: offer.id }, data: { closedAt: now } });
      await tx.followUp.create({ data: {
        orgId, agentId: offer.agentId, leadId: offer.leadId, dueAt: now,
        title: `${who} picked ${label}, but it went to somebody else`,
        body: `The slot was booked before they answered${where}. Offer them new times.`,
      } });
    });
    return { picked: false as const, reason: "taken" as const };
  }
}
