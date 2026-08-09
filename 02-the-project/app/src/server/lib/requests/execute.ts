import { forOrg } from "@/server/db/client";
import { comparables } from "./comparables";
import { messagingWindow } from "@/server/lib/whatsapp";
import type { Classified } from "./classify";

/**
 * Doing what was asked.
 *
 * **Most recipes are routing, not new machinery.** Booking a viewing,
 * logging a contact, an owner update — all of that already exists and
 * has been reachable through screens for weeks. The spoken request is a
 * second door onto the same rooms, not a second house.
 *
 * Writing six new engines here would mean six new places for the rules
 * to drift out of step. The reply window, the hold-then-confirm
 * sequence, the vendor's contact preference — those live where they
 * already live.
 */

export type Outcome =
  | { kind: "DONE"; summary: string; href?: string; caveats?: string[] }
  | { kind: "NEEDS"; question: string; recipe: string; partial?: Record<string, string> }
  | { kind: "REFUSED"; reason: string };

export async function execute(args: {
  orgId: string; agentId: string; c: Classified; transcript: string;
}): Promise<Outcome> {
  const db = forOrg(args.orgId);
  const { c } = args;

  switch (c.recipe) {
    /* ---------------------------------------------------------------- */
    case "LOG_CONTACT": {
      // The exact use case the competing product advertises: met
      // somebody, drop a voice note, the CRM update and the follow-up
      // happen. Theirs takes an advisor and some hours.
      const name = c.entities.personName;
      if (!name) return { kind: "NEEDS", question: "What's their name?", recipe: c.recipe };

      const entry = await db.blackbookEntry.create({
        data: {
          orgId: args.orgId, agentId: args.agentId,
          standaloneName: name,
          // The transcript is the note. An agent's own words about
          // somebody they just met are better than anything generated
          // from them, and this is their private note either way.
          privateNote: args.transcript,
          tags: [], lastTouched: new Date(),
        },
        select: { id: true },
      });

      // The follow-up is the half people forget, so it is not optional.
      const due = new Date(Date.now() + 3 * 86_400_000);
      await db.followUp.create({
        data: {
          orgId: args.orgId, agentId: args.agentId,
          title: `Follow up with ${name}`,
          body: args.transcript.slice(0, 300),
          blackbookEntryId: entry.id,
          dueAt: due,
        },
      });

      return {
        kind: "DONE",
        summary: `${name} is in your blackbook, with a reminder to follow up on ${
          due.toLocaleDateString("en-GB", { weekday: "long" })}.`,
        href: `/blackbook`,
      };
    }

    /* ---------------------------------------------------------------- */
    case "DAY_BRIEF": {
      const start = new Date(); start.setHours(0, 0, 0, 0);
      const end = new Date(start); end.setDate(end.getDate() + 1);

      const [viewings, unanswered] = await Promise.all([
        db.viewing.findMany({
          // "HELD" is not a ViewingStatus and never was. A hold is a
          // SCHEDULED viewing with `heldUntil` set — scheduling.ts is the
          // source of truth for that and filters the same two statuses.
          where: { agentId: args.agentId, scheduledAt: { gte: start, lt: end },
                   status: { in: ["SCHEDULED", "CONFIRMED"] } },
          orderBy: { scheduledAt: "asc" },
          select: { scheduledAt: true, listing: { select: { building: true } } },
        }),
        db.conversation.count({
          // Lead names the column `assignedToId`; there is no `agentId`
          // on Lead. (Viewing has one, which is where the mix-up came
          // from.)
          where: { unreadCount: { gt: 0 }, lead: { assignedToId: args.agentId } },
        }),
      ]);

      // Spoken back, so it has to sound like a person saying it.
      const bits: string[] = [];
      const [first] = viewings;
      if (!first) bits.push("No viewings today.");
      else {
        bits.push(`${viewings.length} viewing${viewings.length === 1 ? "" : "s"}, ` +
          `first at ${first.scheduledAt.toLocaleTimeString("en-GB",
            { hour: "2-digit", minute: "2-digit" })} at ` +
          `${first.listing?.building ?? "a property"}.`);
      }
      if (unanswered > 0)
        bits.push(`${unanswered} conversation${unanswered === 1 ? "" : "s"} waiting on you.`);

      return { kind: "DONE", summary: bits.join(" "), href: "/viewings" };
    }

    /* ---------------------------------------------------------------- */
    case "BOOK_VIEWING": {
      // Deliberately not booked from a voice note alone. The slot
      // matters, double-booking an agent costs a viewing, and
      // hold-then-confirm exists for that reason — this hands over to
      // it with the building already filled in.
      const b = c.entities.building;
      return {
        kind: "NEEDS",
        question: b
          ? `Which time at ${b}?`
          : "Which property, and roughly when?",
        recipe: c.recipe,
        partial: b ? { building: b } : undefined,
      };
    }

    /* ---------------------------------------------------------------- */
    case "VENDOR_UPDATE": {
      const name = c.entities.personName ?? c.entities.building;
      if (!name)
        return { kind: "NEEDS", question: "Which owner or which property?", recipe: c.recipe };

      const vendor = await db.vendor.findFirst({
        where: { OR: [{ name: { contains: name, mode: "insensitive" } },
                      { listings: { some: { building: { contains: name, mode: "insensitive" } } } }] },
        select: { id: true, name: true, prefers: true },
      });
      if (!vendor)
        return { kind: "REFUSED", reason: `No owner on file matching "${name}".` };

      // The contact preference is an instruction, and this is exactly
      // where an agent in a hurry would breach it.
      if (vendor.prefers === "OFFERS_ONLY")
        return {
          kind: "REFUSED",
          reason: `${vendor.name} asked to be contacted only when there's an offer. ` +
                  `Nothing sent.`,
        };

      return {
        kind: "DONE",
        summary: `Brief ready for ${vendor.name}.`,
        href: `/vendors/${vendor.id}`,
      };
    }

    /* ---------------------------------------------------------------- */
    case "DRAFT_REPLY": {
      const who = c.entities.personName;
      if (!who) return { kind: "NEEDS", question: "Who to?", recipe: c.recipe };

      const lead = await db.lead.findFirst({
        where: { name: { contains: who, mode: "insensitive" } },
        // `conversation`, singular. Lead has at most one — the model
        // declares `conversation Conversation?`, not a list.
        select: { id: true, name: true,
                  conversation: { select: { id: true, lastInboundAt: true } } },
      });
      if (!lead) return { kind: "REFUSED", reason: `No lead called "${who}".` };

      const conv = lead.conversation;
      const w = messagingWindow(conv?.lastInboundAt ?? null);
      // Checked before offering to draft anything. Drafting a message
      // that cannot be delivered wastes the agent's time twice.
      if (!w.open)
        return {
          kind: "REFUSED",
          reason: `The 24-hour window on ${lead.name} has closed — a normal message ` +
                  `won't arrive. Send a template, or ring them.`,
        };

      return {
        kind: "DONE",
        summary: `Open ${lead.name} — ${w.hoursLeft}h left to reply normally.`,
        href: `/inbox/${conv?.id ?? ""}`,
      };
    }

    /* ---------------------------------------------------------------- */
    case "COMPARABLES": {
      const b = c.entities.building;
      if (!b) return { kind: "NEEDS", question: "Which building?", recipe: c.recipe };
      // Bedrooms decides everything and is rarely spoken. Ask rather
      // than assume two.
      return { kind: "NEEDS", question: `How many bedrooms in ${b}?`,
               recipe: c.recipe, partial: { building: b } };
    }

    /* ---------------------------------------------------------------- */
    case "LISTING_PITCH": {
      const b = c.entities.building;
      if (!b) return { kind: "NEEDS", question: "Which property?", recipe: c.recipe };

      const listing = await db.listing.findFirst({
        where: { building: { contains: b, mode: "insensitive" }, deletedAt: null },
        select: { id: true, building: true, bedrooms: true,
                  _count: { select: { viewings: true, enquiries: true } } },
      });
      if (!listing) return { kind: "REFUSED", reason: `No listing matching "${b}".` };

      // Both columns are nullable and `comparables` needs both. Without
      // a building and a bed count there is nothing to compare against,
      // so this refuses rather than running a search that would silently
      // match on whatever happened to be non-null.
      if (!listing.building || listing.bedrooms === null)
        return { kind: "REFUSED", reason: `"${b}" has no building or bedroom count recorded, so there is nothing to compare it against.` };

      const report = await comparables({
        orgId: args.orgId, building: listing.building, beds: listing.bedrooms,
      });

      return {
        kind: "DONE",
        summary: `${listing._count.enquiries} enquiries and ` +
                 `${listing._count.viewings} viewings on ${listing.building}.`,
        href: `/listings/${listing.id}`,
        // The pitch inherits the comparables caveats. A pitch built on
        // thin evidence is thin, and the agent should know before they
        // stand in front of an owner with it.
        caveats: report.caveats,
      };
    }

    default:
      return { kind: "NEEDS", question: c.question ?? "What do you need?", recipe: "UNCLEAR" };
  }
}
