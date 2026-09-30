import type { Prisma, Role } from "@prisma/client";
import { can } from "@/server/auth/rbac";
import { normalisePhone } from "@/server/lib/portals/normalise";

/**
 * Who a conversation is with, and who may open it.
 *
 * A conversation used to be with a buyer, always: `leadId` was required,
 * and every screen and send path read `conversation.lead`. It is now
 * with a buyer **or** a property owner — the database holds exactly one
 * of the two (`Conversation_one_party`) — and these are the only places
 * that decide which, so the inbox, the thread and the send paths cannot
 * each answer it differently.
 */

/**
 * The conversations a caller may open.
 *
 * A buyer's thread is their agent's, as `leadScope` has always said. An
 * owner's thread is for whoever looks after one of their properties
 * (`Listing.agentId`) — the person the weekly report already goes to.
 * Managers and above see every one. A buyer removed from the book takes
 * their thread with them.
 *
 * `lead: { assignedToId }` alone — the old filter — does not merely
 * leave owners out for agents: a relation filter on a null relation is
 * false, so it hid every owner's thread from everybody, managers too.
 */
export function conversationScope(role: Role, userId: string): Prisma.ConversationWhereInput {
  if (can(role, "lead:read:all")) {
    return { OR: [{ lead: { deletedAt: null } }, { vendorId: { not: null } }] };
  }
  return {
    OR: [
      { lead: { deletedAt: null, assignedToId: userId } },
      { vendor: { listings: { some: { agentId: userId, deletedAt: null } } } },
    ],
  };
}

/** Only the caller's own: their buyers, and owners of properties they look after. */
export function mineOnly(userId: string): Prisma.ConversationWhereInput {
  return conversationScope("AGENT", userId);
}

/** What every reader selects, so `partyOf` always has what it needs. */
export const partySelect = {
  lead: { select: { id: true, name: true, phone: true, language: true } },
  vendor: { select: { id: true, name: true, phone: true } },
} as const;

export type Party = {
  kind: "BUYER" | "OWNER";
  id: string;
  name: string | null;
  phone: string | null;
  language: string;
};

export function partyOf(c: {
  lead: { id: string; name: string | null; phone: string; language: string | null } | null;
  vendor: { id: string; name: string; phone: string | null } | null;
}): Party {
  if (c.lead) return { kind: "BUYER", id: c.lead.id, name: c.lead.name, phone: c.lead.phone, language: c.lead.language ?? "en" };
  if (c.vendor) return { kind: "OWNER", id: c.vendor.id, name: c.vendor.name, phone: c.vendor.phone, language: "en" };
  // The database refuses a row with neither. Reaching this means a
  // select left the party out — a bug in the caller, said as one.
  throw new Error("Conversation read without its party — select `partySelect`.");
}

/**
 * The number WhatsApp's API takes: country code first, digits only.
 *
 * A buyer's number arrives from WhatsApp already in E.164. An owner's is
 * typed by an agent — "050 123 4567", "+971501234567", "00971…" — and
 * sending "0501234567" to the API reaches nobody. Null when it cannot be
 * read with confidence: a wrong guess messages a stranger.
 */
export function waNumber(phone: string | null | undefined): string | null {
  const e164 = normalisePhone(phone ?? undefined);
  return e164 ? e164.slice(1) : null;
}
