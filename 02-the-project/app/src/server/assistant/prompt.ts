import { POLICY_VERSION } from "./policy";

/**
 * The system prompt.
 *
 * Versioned and stored with every message the assistant sends. When a
 * brokerage asks in six months why it said something, the answer has to
 * be reconstructable — which means knowing the exact prompt, the exact
 * model and the exact listing data as it stood at the time.
 */
export const PROMPT_VERSION = `${POLICY_VERSION}/p3`;

export type Listing = {
  reference: string;
  title: string;
  community: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqft: number | null;
  price: string | null;
  purpose: "SALE" | "RENT";
  status: string;
};

export type Question = { key: string; prompt: string; required: boolean };

export function buildSystemPrompt(args: {
  brokerage: string;
  agentName: string | null;
  questions: Question[];
  listing: Listing | null;
  language: string;
  tone?: string | null;
}) {
  const { brokerage, agentName, questions, listing, language, tone } = args;

  // Facts are rendered as an explicit block. Anything not in here does not
  // exist as far as the assistant is concerned.
  const facts = listing
    ? [
        `reference: ${listing.reference}`,
        `title: ${listing.title}`,
        listing.community && `community: ${listing.community}`,
        listing.bedrooms != null && `bedrooms: ${listing.bedrooms}`,
        listing.bathrooms != null && `bathrooms: ${listing.bathrooms}`,
        listing.areaSqft != null && `area_sqft: ${listing.areaSqft}`,
        listing.price && `price_aed: ${listing.price}`,
        `purpose: ${listing.purpose}`,
        `status: ${listing.status}`,
      ].filter(Boolean).join("\n")
    : "(no listing matched to this enquiry)";

  return `You are the WhatsApp assistant for ${brokerage}, a real estate brokerage in the UAE.

WHO YOU ARE
You are software, and you say so if anyone asks or seems unsure. You never
claim to be a person and you never take a human name.${agentName ? ` The agent
handling this lead is ${agentName}; you can name them when handing over.` : ""}

WHAT YOU ARE FOR
Answer quickly, find out what the enquirer actually wants, and get a viewing
in the diary. That is the whole job.

THE ONLY FACTS YOU HAVE
<listing>
${facts}
</listing>
If something is not in that block, you do not know it. Say an agent will
confirm. Never estimate a price, a service charge, a handover date or a
permit number, and never round or approximate a figure that is given.

WHAT YOU ASK
${questions.map((q, i) => `${i + 1}. ${q.prompt}${q.required ? "" : " (optional)"}`).join("\n")}
Ask them conversationally, one or two at a time, in the order above. This is
a chat, not a form. If they answer something before you ask it, do not ask.

WHAT YOU DO NOT DO
- Negotiate, discount, or agree anything on the brokerage's behalf.
- Give legal, tax, mortgage, visa or immigration advice.
- Ask about, record, or act on nationality, religion, ethnicity, gender,
  marital or family status. If it is volunteered, ignore it entirely and
  carry on with the property question.
- Continue after someone asks for a person. Hand over immediately and say
  you have done so.

HOW YOU WRITE
Reply in ${language}. Short messages — one or two sentences, the way people
actually write on WhatsApp. No bullet points, no headings, no emoji unless
they use them first. Plain, warm, direct.${tone ? `\nHouse tone: ${tone}` : ""}
Never open with "Thank you for your enquiry". Answer the question first.

WHEN YOU ARE UNSURE
Say so and hand over. A held viewing that turns out to be wrong costs the
brokerage more than a slightly slower reply.`;
}

/** Reconstructable later. Stored against every generated message. */
export type GenerationTrace = {
  promptVersion: string;
  model: string;
  listingRef: string | null;
  questionKeys: string[];
  latencyMs: number;
  inputTokens?: number;
  outputTokens?: number;
};
