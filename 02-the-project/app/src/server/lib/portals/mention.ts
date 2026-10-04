import { compactRef } from "@/lib/reference";

/**
 * Which portal a WhatsApp message says the buyer came from, and which
 * listing reference it quotes.
 *
 * ## Why this exists
 *
 * A large share of portal buyers never fill in the portal's form. They
 * press the WhatsApp button on the advert, which opens a chat with the
 * agent's number and a pre-written line — "Hi, I saw your property on
 * Bayut, ref MG-202" — or they type much the same themselves. Every one
 * of those arrived here as a `WHATSAPP_AD` lead with no property, so:
 *
 * - "where they come from" credited WhatsApp with leads Bayut and
 *   Dubizzle paid for, which is the figure a brokerage uses to decide
 *   where its advertising goes;
 * - routing rules written per portal ("Bayut leads to the rentals
 *   team") never matched a buyer who came that way;
 * - the agent opened the thread without knowing which property it was.
 *
 * ## What it will and will not claim
 *
 * Only a portal **named** in the message counts — by its Latin name, its
 * web address, or its Arabic name where that name means nothing else.
 * Bayut's Arabic spelling is the ordinary word for "houses", so it is not
 * read: "looking for houses in JVC" is not a Bayut lead. A portal's own
 * listing id in a link (`details-9876543`) cannot be matched to our
 * listing, so links name the portal and nothing more.
 *
 * Reference candidates are compacted (`compactRef`, the same rule search
 * uses) and are only ever *candidates*: the caller keeps one only if this
 * brokerage has a live listing with that reference, which is what keeps
 * "AED 180" or "unit 12" from attaching a property by accident.
 */

export type MentionedPortal = "BAYUT" | "DUBIZZLE" | "PROPERTY_FINDER";

export const PORTAL_LABEL: Record<MentionedPortal, string> = {
  BAYUT: "Bayut",
  DUBIZZLE: "Dubizzle",
  PROPERTY_FINDER: "Property Finder",
};

const PORTALS: [MentionedPortal, RegExp][] = [
  ["BAYUT", /\bbayut(?:\.com)?\b/i],
  ["DUBIZZLE", /\bdubizzle(?:\.com)?\b|دوبيزل/i],
  ["PROPERTY_FINDER", /\bproperty\s?finder(?:\.ae)?\b|بروبرتي\s?فايندر/i],
];

/** The portal named first in the message, or null. */
export function mentionedPortal(text: string | null | undefined): MentionedPortal | null {
  if (!text) return null;
  let best: { portal: MentionedPortal; at: number } | null = null;
  for (const [portal, re] of PORTALS) {
    const m = re.exec(text);
    if (m && (!best || m.index < best.at)) best = { portal, at: m.index };
  }
  return best?.portal ?? null;
}

/**
 * Listing references the message might be quoting, compacted, the ones
 * written after "ref" first.
 *
 * Reference-shaped means letters then digits — MG-202, AR 508, dh101 —
 * the shape every listing reference in this product has.
 */
export function referenceCandidates(text: string | null | undefined): string[] {
  if (!text) return [];
  // Links are the portal's own ids, never ours.
  const plain = text.replace(/https?:\/\/\S+/gi, " ");
  const out: string[] = [];
  const add = (s: string) => {
    const c = compactRef(s);
    if (/^[a-z]{1,6}\d{2,8}$/.test(c) && !out.includes(c)) out.push(c);
  };
  const afterRef = /\b(?:ref(?:erence)?\.?(?:\s*(?:no\.?|number|id|#))?|رقم\s*المرجع|المرجع)\s*[:#.\-]?\s*([a-z]{1,6}[\s\-_/]?\d{2,8})\b/giu;
  for (const m of plain.matchAll(afterRef)) add(m[1]!);
  // Elsewhere only the short prefixes references use, so "budget 180000"
  // is not offered: a 1–4 letter prefix, then the digits.
  for (const m of plain.matchAll(/\b([a-z]{1,4}[\-_ ]?\d{2,8})\b/giu)) add(m[1]!);
  return out;
}
