import { forOrg } from "@/server/db/client";
import { comparables } from "./comparables";
import { messagingWindow } from "@/server/lib/whatsapp";
import type { Classified } from "./classify";
import { extractIntake } from "./intake";
import { applyIntake } from "./apply-intake";

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
      /**
       * The flagship flow, and the thing the audit found missing.
       *
       * This used to create a blackbook entry whose note was the raw
       * transcript, plus a reminder in three days — and that was all. An
       * agent saying "met Sarah, four-bed villa in Dubai Hills, around
       * twelve million, needs to move in three months" still typed the
       * budget, the bedrooms, the community and the timeframe into a
       * form afterwards, if they remembered.
       *
       * Now a second extraction pass fills in everything the CRM has
       * columns for, plus the things it does not — motivation, a lease
       * ending, an objection mentioned in passing — which have somewhere
       * to live in ClientFact.
       *
       * **It falls back rather than failing.** If the extraction cannot
       * be read, the person still lands in the blackbook with their
       * follow-up, which is what happened before and is never worse than
       * before. A richer feature that can lose a contact is a worse
       * feature.
       */
      const extracted = await extractIntake({ orgId: args.orgId, transcript: args.transcript });

      if (!extracted.ok) {
        const name = c.entities.personName;
        if (!name) return { kind: "NEEDS", question: "What's their name?", recipe: c.recipe };

        const entry = await db.blackbookEntry.create({
          data: {
            orgId: args.orgId, agentId: args.agentId,
            standaloneName: name,
            privateNote: args.transcript,
            tags: [], lastTouched: new Date(),
          },
          select: { id: true },
        });
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
          href: "/blackbook",
          caveats: [extracted.reason],
        };
      }

      // A note with nobody in it is not a contact. Ask, rather than
      // creating an anonymous row somebody has to clean up later.
      if (!extracted.intake.person.name && !extracted.intake.person.phone) {
        return { kind: "NEEDS", question: "Who was it?", recipe: c.recipe };
      }

      const result = await applyIntake({
        orgId: args.orgId,
        agentId: args.agentId,
        transcript: args.transcript,
        intake: extracted.intake,
      });

      /**
       * Read back as one sentence, because it is spoken.
       *
       * "Added Sarah to your leads, saved what she's looking for, found
       * one on your book that fits, reminder set for Monday." An agent
       * walking to a car hears that and knows what happened. A list of
       * six confirmations is a screen they have to stop and read.
       */
      const summary = sentence(result.did);

      const caveats: string[] = [];
      if (result.match) {
        caveats.push(
          `${result.match.title} — ${result.match.reference}` +
          (result.match.reasons.length ? ` (${result.match.reasons.join(", ")})` : "")
        );
      }
      // Said out loud rather than silently omitted. A budget the model
      // was unsure of and dropped is a budget the agent thinks is
      // recorded.
      if (extracted.dropped.length) {
        caveats.push(`I didn't catch the ${extracted.dropped.join(" or the ")} — add it when you can.`);
      }
      if (result.ask) caveats.push(result.ask);

      return { kind: "DONE", summary, href: result.href, caveats };
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

/**
 * A list of things done, as a person would say them.
 *
 * "Added Sarah to your leads, saved what she's looking for and set a
 * reminder for Monday." Oxford-comma-free and with an "and" before the
 * last, because this is read aloud as often as it is read.
 */
function sentence(parts: string[]): string {
  const p = parts.filter(Boolean);
  if (p.length === 0) return "Nothing to do there.";
  const first = p[0]!;
  const head = first.charAt(0).toUpperCase() + first.slice(1);
  const rest = p.slice(1);
  if (rest.length === 0) return `${head}.`;
  if (rest.length === 1) return `${head} and ${rest[0]}.`;
  return `${head}, ${rest.slice(0, -1).join(", ")} and ${rest[rest.length - 1]}.`;
}
