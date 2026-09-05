import type { FeedbackReason, Verdict } from "@prisma/client";

/**
 * The vendor report.
 *
 * Written before a `Vendor` model existed, which meant it generated a
 * summary for a person the system had no record of. It now resolves a
 * real owner, respects how they asked to be contacted, and will not
 * send at all to somebody who said offers only.
 *
 * Vendor communication is the most common complaint about estate agents
 * in every market anybody has measured, and the reason is that agents
 * have nothing to say. "We had three viewings, no news" is not a report,
 * it is an apology.
 *
 * This turns collected feedback into the conversation an agent is
 * avoiding: **the price is wrong, and here is the evidence.** That
 * conversation is the hardest one in the business, and it is much easier
 * to have with a count than with an opinion.
 */

export type FeedbackRow = { verdict: Verdict | null; reasons: FeedbackReason[] };

const REASON_LABEL: Record<FeedbackReason, string> = {
  PRICE_TOO_HIGH: "price",
  TOO_SMALL: "size",
  LAYOUT: "layout",
  CONDITION: "condition",
  LOCATION: "location",
  VIEW: "the view",
  NOISE: "noise",
  PARKING: "parking",
  SERVICE_CHARGE: "service charge",
  NOT_AS_ADVERTISED: "the listing not matching the property",
  BUYING_ELSEWHERE: "buying elsewhere",
  OTHER: "other reasons",
};

export type Signal =
  | { kind: "price"; confidence: "strong" | "moderate"; message: string }
  | { kind: "listing"; confidence: "strong" | "moderate"; message: string }
  | { kind: "exposure"; confidence: "strong" | "moderate"; message: string }
  | { kind: "none"; message: string };

/**
 * Reading the numbers.
 *
 * Three patterns, and they mean genuinely different things — which is why
 * "it's not selling" is such a useless summary:
 *
 *   - **Viewings but no offers** → the property is priced above what the
 *     market will pay for it. This is the common one and the one nobody
 *     wants to say out loud.
 *   - **Few viewings** → the price is wrong at the *listing* level, or
 *     the marketing is. People are not even coming to look.
 *   - **"Not as advertised"** → the listing is overselling it, and every
 *     viewing is burning goodwill and an agent's afternoon.
 */
export function signal(args: {
  viewings: number;
  offers: number;
  reasons: FeedbackReason[];
  daysListed: number;
}): Signal {
  const count = (r: FeedbackReason) => args.reasons.filter((x) => x === r).length;
  const priceMentions = count("PRICE_TOO_HIGH");
  const misleading = count("NOT_AS_ADVERTISED");

  if (misleading >= 2) {
    return {
      kind: "listing",
      confidence: "strong",
      message:
        `${misleading} viewers said the property wasn't what they expected from the listing. ` +
        `That is costing viewings that were never going to work — worth fixing the photos and ` +
        `description before anything else.`,
    };
  }

  // Few viewings over a meaningful period is a different problem from
  // viewings that do not convert, and conflating them wastes a month.
  if (args.daysListed >= 30 && args.viewings <= 2) {
    return {
      kind: "exposure",
      confidence: args.viewings === 0 ? "strong" : "moderate",
      message:
        `${args.viewings} viewing${args.viewings === 1 ? "" : "s"} in ${args.daysListed} days. ` +
        `People aren't coming to look, which usually means the asking price is out of range for ` +
        `the searches buyers are actually running — not that the property is wrong.`,
    };
  }

  if (args.viewings >= 5 && args.offers === 0) {
    const strong = priceMentions >= Math.ceil(args.viewings / 3);
    return {
      kind: "price",
      confidence: strong ? "strong" : "moderate",
      message: strong
        ? `${args.viewings} viewings, no offers, and ${priceMentions} viewers named the price. ` +
          `The market is telling us what it thinks it's worth.`
        : `${args.viewings} viewings and no offers. People are coming and not bidding, which is ` +
          `almost always price rather than the property.`,
    };
  }

  return {
    kind: "none",
    message:
      args.viewings === 0
        ? "No viewings yet."
        : `${args.viewings} viewing${args.viewings === 1 ? "" : "s"}, ${args.offers} offer${args.offers === 1 ? "" : "s"}. Nothing conclusive yet.`,
  };
}

/**
 * Composing the report.
 *
 * **Buyer comments are never sent verbatim.** Two reasons, and both
 * matter: buyers are blunt in a way that is unhelpful when repeated to
 * an owner about their home, and a comment that is identifiable to one
 * viewer is a privacy problem in a document that goes to a third party.
 *
 * Counts are the honest version anyway — "three of five viewers
 * mentioned the second bedroom" carries far more weight than one person
 * saying it rudely.
 */
export function compose(args: {
  propertyTitle: string;
  viewings: number;
  offers: number;
  rows: FeedbackRow[];
  daysListed: number;
}) {
  const reasons = args.rows.flatMap((r) => r.reasons);
  const tally = new Map<FeedbackReason, number>();
  for (const r of reasons) tally.set(r, (tally.get(r) ?? 0) + 1);

  const top = [...tally.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([r, n]) => `${n} mentioned ${REASON_LABEL[r]}`);

  const answered = args.rows.filter((r) => r.verdict).length;
  const s = signal({ viewings: args.viewings, offers: args.offers, reasons, daysListed: args.daysListed });

  return {
    headline: `${args.propertyTitle} — ${args.viewings} viewing${args.viewings === 1 ? "" : "s"} in the last ${args.daysListed} days`,
    body: [
      answered
        ? `We asked everyone who viewed. ${answered} came back to us.`
        : `We asked everyone who viewed; nobody has come back yet.`,
      ...(top.length ? [`What they said: ${top.join(", ")}.`] : []),
      s.message,
    ].join("\n\n"),
    signal: s,
    // Only proposed when the evidence is strong. Recommending a price
    // drop on two data points is how an agent loses an instruction.
    recommendation:
      s.kind === "price" && s.confidence === "strong"
        ? "Worth a conversation about the asking price this week."
        : s.kind === "listing"
          ? "Worth reshooting the photos and rewriting the description."
          : null,
  };
}

/**
 * Who gets a report this week, and who deliberately does not.
 *
 * Three ways a vendor is skipped, and each is a real instruction rather
 * than an edge case:
 *
 *   - `reportsOff` — they asked not to hear from us on a schedule.
 *   - `OFFERS_ONLY` — the strongest version of that. Ringing one of
 *     these for a chat is the fastest way to lose an instruction.
 *   - Wrong day — an owner who asked for Thursday gets Thursday, not
 *     whenever the job happens to run.
 *
 * Nothing at all happened this week is **not** a reason to skip. An
 * owner who hears nothing assumes we have stopped trying, and "no
 * viewings this week, here is what we are changing" is the call that
 * keeps an instruction.
 */
export async function vendorsDueToday(orgId: string, today = new Date()) {
  const { forOrg } = await import("@/server/db/client");
  const dow = today.getUTCDay() === 0 ? 7 : today.getUTCDay();

  return forOrg(orgId).vendor.findMany({
    where: {
      reportsOff: false,
      prefers: { not: "OFFERS_ONLY" },
      reportDay: dow,
    },
    select: {
      id: true, name: true, phone: true, email: true, prefers: true,
      lastReportedAt: true,
    },
  });
}

/**
 * Sent through the channel they chose.
 *
 * A vendor who asked for email and gets WhatsApp has been told, twice
 * now, that we do not listen. The preference is not a nicety — it is
 * usually the first thing an owner says and the first thing an agent
 * forgets.
 */
export function channelFor(prefers: string): "whatsapp" | "email" | "call" | null {
  switch (prefers) {
    case "WHATSAPP": return "whatsapp";
    case "EMAIL":    return "email";
    // A call is a person's job. The report is prepared and put on the
    // agent's list rather than sent — pretending we can automate a phone
    // call is how a vendor gets a text they explicitly did not want.
    case "CALL":     return "call";
    default:         return null;
  }
}
