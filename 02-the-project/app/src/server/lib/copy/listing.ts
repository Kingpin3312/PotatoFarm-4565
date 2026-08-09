import type { Listing } from "@prisma/client";

/**
 * Writing a listing description.
 *
 * The same rule as the assistant, for the same reason: **only facts that
 * are on the record.** A description is an advertisement, the Trakheesi
 * permit ties that advertisement to the brokerage, and a claim that
 * cannot be substantiated is a misrepresentation rather than a bit of
 * enthusiasm.
 *
 * There is a neat loop here that was not designed on purpose. The
 * feedback module counts `NOT_AS_ADVERTISED` as a reason a viewing
 * failed. So the system that writes the copy is measured by the system
 * that collects what buyers thought of it — and a listing whose
 * description is overselling shows up as a listing signal within a
 * fortnight, without anybody having to notice.
 */

export const PROMPT_VERSION = "listing-copy/v1";

/**
 * Portal content rules.
 *
 * These are rejection reasons, not style preferences. A listing that
 * breaks them is refused, and — as with everything else in this product —
 * the rejection is silent from the brokerage's side.
 */
export const PORTAL_RULES = [
  "No phone numbers, email addresses or agent names in the description.",
  "No website addresses or references to other listings.",
  "No block capitals for emphasis.",
  "No claims about investment returns, guaranteed rents or capital growth.",
  "No comparisons to named competitors or other developments.",
  "Nothing that is not true of this specific unit.",
] as const;

const BANNED = [
  /\+?\d[\d\s\-()]{7,}/,                 // phone numbers
  /[\w.+-]+@[\w-]+\.[\w.]+/,             // email
  /\b(?:www\.|https?:\/\/)\S+/i,         // urls
  /\b(?:guaranteed|assured)\s+(?:roi|return|rent|yield)/i,
  /\b\d{1,2}(?:\.\d)?%\s*(?:roi|return|yield)/i,
  /\b(?:best|cheapest|only)\s+(?:price|deal|unit)\s+in\b/i,
];

export type CopyProblem = { rule: string; found: string };

export function check(text: string): CopyProblem[] {
  const problems: CopyProblem[] = [];

  for (const re of BANNED) {
    const m = text.match(re);
    if (m) problems.push({ rule: "Portal content rule", found: m[0].slice(0, 40) });
  }

  // Shouting. Three or more consecutive capitalised words is emphasis,
  // not an acronym.
  const shout = text.match(/\b[A-Z]{2,}(?:\s+[A-Z]{2,}){2,}\b/);
  if (shout) problems.push({ rule: "No block capitals", found: shout[0].slice(0, 40) });

  return problems;
}

/**
 * The fact block.
 *
 * Rendered explicitly, exactly as for the assistant. Anything not in here
 * does not exist — the model cannot decide the kitchen is "recently
 * refurbished" because that is the sort of thing kitchens are.
 */
export function facts(l: Pick<Listing,
  "reference" | "title" | "community" | "building" | "bedrooms" | "bathrooms" |
  "areaSqft" | "price" | "purpose" | "status">) {
  return [
    `reference: ${l.reference}`,
    l.community && `community: ${l.community}`,
    l.building && `building: ${l.building}`,
    l.bedrooms != null && `bedrooms: ${l.bedrooms}`,
    l.bathrooms != null && `bathrooms: ${l.bathrooms}`,
    l.areaSqft != null && `area_sqft: ${l.areaSqft}`,
    l.price && `price_aed: ${l.price}`,
    `purpose: ${l.purpose}`,
  ].filter(Boolean).join("\n");
}

export function buildPrompt(args: {
  brokerage: string;
  tone: string | null;
  language: "en" | "ar";
  factBlock: string;
  /** Anything an agent added by hand. Treated as fact, because a person
   *  who viewed the property is a better source than a database row. */
  agentNotes?: string | null;
}) {
  return `You are writing a property listing description for ${args.brokerage}, a brokerage in the UAE.

THE ONLY FACTS YOU HAVE
<property>
${args.factBlock}
</property>
${args.agentNotes ? `\nThe agent who saw it added:\n${args.agentNotes}\n` : ""}
If something is not above, you do not know it. Do not describe the view, the
finish, the light, the neighbours, the schools or the investment potential
unless it is stated. An adjective you cannot point at in the facts is a
claim, and this description is an advertisement the brokerage is legally
responsible for.

RULES THE PORTALS ENFORCE
${PORTAL_RULES.map((r) => `- ${r}`).join("\n")}

HOW TO WRITE IT
${args.language === "ar" ? "Write in Arabic." : "Write in English."}
120 to 180 words. Three short paragraphs: what it is, what is notable
about it from the facts, and the practical detail. Plain sentences. No
block capitals, no exclamation marks, no estate-agent superlatives —
"stunning", "boasts", "nestled", "opportunity not to be missed".
${args.tone ? `\nHouse tone: ${args.tone}` : ""}

Write only the description. No headings, no preamble.`;
}

/**
 * Never published automatically.
 *
 * Same position as the KYC collection: the model drafts, a person
 * publishes. A description that goes live without anybody reading it is
 * an advertisement nobody checked, attached to a permit in the
 * brokerage's name.
 */
export const AUTO_PUBLISH = false;
