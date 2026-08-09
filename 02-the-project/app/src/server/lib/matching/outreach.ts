import type { LeadStatus } from "@prisma/client";
import { messagingWindow } from "@/server/lib/whatsapp";
import type { Match } from "./score";

/**
 * Messaging somebody first.
 *
 * This is the difference between the product being useful and the product
 * being spam, and it is entirely decided by restraint. Nobody in this
 * market does proactive outbound matching on WhatsApp — partly because
 * nobody holds both halves of it, and partly because done badly it gets
 * your number reported and your WhatsApp Business account restricted.
 *
 * That last risk is not theoretical. Meta acts on user reports, and a
 * restricted number takes the whole brokerage's lead flow with it. Every
 * rule below is protecting that number as much as the recipient.
 */

/** Statuses where a proactive message is unwelcome or wrong. */
const DO_NOT_CONTACT: LeadStatus[] = ["WON", "LOST", "UNRESPONSIVE"];

export type OutreachDecision =
  | { send: true; useTemplate: boolean; reason: string }
  | { send: false; reason: string };

export function decide(args: {
  lead: {
    status: LeadStatus;
    optedOut: boolean;
    lastInboundAt: Date | null;
    lastOutreachAt: Date | null;
    createdAt: Date;
  };
  match: Match;
  now?: Date;
  timezone?: string;
}): OutreachDecision {
  const now = args.now ?? new Date();
  const { lead } = args;

  // 1. They asked us to stop. Nothing else in this function matters.
  if (lead.optedOut) return { send: false, reason: "opted out" };

  if (DO_NOT_CONTACT.includes(lead.status)) {
    // A lead marked unresponsive has already ignored us. Messaging them
    // unprompted about a new listing is how a number gets reported.
    return { send: false, reason: `status is ${lead.status.toLowerCase()}` };
  }

  // 2. Frequency. Once a fortnight at most, however good the match.
  if (lead.lastOutreachAt) {
    const days = (now.getTime() - lead.lastOutreachAt.getTime()) / 86_400_000;
    if (days < 14) return { send: false, reason: `messaged ${Math.floor(days)} days ago` };
  }

  // 3. Never before they have said anything. A lead who has enquired but
  //    not yet replied is mid-conversation, not a target.
  if (!lead.lastInboundAt) return { send: false, reason: "never replied to us" };

  // 4. A lead who went quiet six months ago is a cold contact, not a
  //    warm one, and the basis for messaging them has gone stale.
  const quietDays = (now.getTime() - lead.lastInboundAt.getTime()) / 86_400_000;
  if (quietDays > 120) return { send: false, reason: `quiet for ${Math.round(quietDays)} days` };

  // 5. Local hours only. A property alert at 3am is a reason to block a
  //    number, not a reason to reply.
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: args.timezone ?? "Asia/Dubai", hour: "2-digit", hour12: false,
    }).format(now)
  );
  if (hour < 9 || hour >= 20) return { send: false, reason: "outside sending hours" };

  /**
   * 6. The 24-hour window.
   *
   * A match message almost always goes to somebody who last wrote days
   * ago, so free-form will be accepted by Meta and never delivered. It
   * has to be an approved template, and the template has to carry the
   * opt-out — which is both the decent thing and what keeps the number
   * out of trouble.
   */
  const useTemplate = !messagingWindow(lead.lastInboundAt).open;

  return {
    send: true,
    useTemplate,
    reason: useTemplate ? "outside the window, template" : "inside the window",
  };
}

/**
 * What it says.
 *
 * Short, specific, and it names the thing they told us. "The 3 bed in
 * Marina you were after" is a message from somebody paying attention.
 * "New properties matching your search" is a mailshot, and it reads like
 * one.
 *
 * The opt-out is one word and it is honoured immediately.
 */
export function message(args: { firstName: string | null; match: Match; agentName: string | null }) {
  const { match } = args;
  const price = match.listing.priceFils
    ? `AED ${(Number(match.listing.priceFils) / 100).toLocaleString("en-GB")}`
    : "price on application";

  const opener = args.firstName ? `${args.firstName}, ` : "";
  const caveat = match.caveats.length ? ` It's ${match.caveats[0]}.` : "";

  return (
    `${opener}something's just come up that looks like what you were after — ` +
    `${match.listing.title}, ${price}.${caveat}\n\n` +
    `Want me to book you in to see it${args.agentName ? `, or have ${args.agentName} call you` : ""}?\n\n` +
    `Reply STOP and I won't send these again.`
  );
}

/** One word, honoured immediately, no confirmation step. */
export const OPT_OUT_WORDS = ["stop", "unsubscribe", "no more", "remove me"];

export function isOptOut(text: string) {
  const t = text.trim().toLowerCase().replace(/[^a-z ]/g, "");
  return OPT_OUT_WORDS.some((w) => t === w || t.startsWith(w));
}
