import { z } from "zod";
import { gate } from "@/server/assistant/controls";
import { callModel } from "@/server/assistant/run";
import { CONFIDENCE_FLOOR } from "@/server/assistant/extract";

/**
 * One sentence in, a client on file.
 *
 * The gap the audit found. An agent says:
 *
 *   "Met Sarah today. She's after a four-bed villa in Dubai Hills, around
 *    twelve million, needs to move within three months."
 *
 * and the old `LOG_CONTACT` recipe produced a blackbook entry whose note
 * was that sentence, plus a reminder in three days. Everything an agent
 * would want to *do* with it — the budget, the bedrooms, the community,
 * the timeframe, the matching — they still typed by hand, into a form,
 * later, if they remembered.
 *
 * The classifier extracts three fields: a building, a person, a when.
 * This extracts what the CRM actually has columns for, plus the things it
 * does not — motivation, circumstance, the objection they mentioned in
 * passing — which now have somewhere to live in `ClientFact`.
 *
 * **Separate model call from the classifier, on purpose.** The classifier
 * decides *which* recipe; this one fills it in. Asking one call to do both
 * makes both worse, and a parsing failure in the second costs a field
 * rather than the whole request.
 */

/**
 * Budgets arrive as "twelve million", "12m", "around 12", "AED 12,000,000"
 * and, from speech-to-text, "12 million dirhams" with the last word
 * mangled. The model normalises to a plain number of **dirhams** — not
 * fils — because asking it for fils invites a hundredfold error in the
 * one field where that is unrecoverable. The conversion happens here,
 * once, in code.
 */
export const intake = z.object({
  person: z.object({
    name: z.string().trim().min(1).max(80).nullable(),
    /** E.164 if they said one. Usually they did not. */
    phone: z.string().trim().max(30).nullable(),
    email: z.string().trim().max(160).nullable(),
  }),

  /** What they are to us. Both is common and normal — most sellers buy. */
  role: z.enum(["BUYER", "SELLER", "BOTH", "CONTACT"]).nullable(),

  requirement: z.object({
    intent: z.enum(["BUY_TO_LIVE", "BUY_TO_INVEST", "RENT", "SELL", "LIST"]).nullable(),
    /** Whole dirhams. Never fils — see above. */
    budgetMinAed: z.number().nullable(),
    budgetMaxAed: z.number().nullable(),
    bedrooms: z.number().int().min(0).max(20).nullable(),
    /** "villa", "apartment", "townhouse", "penthouse", "plot". */
    propertyType: z.string().trim().max(40).nullable(),
    /** Alternatives, not a list of separate requirements. */
    communities: z.array(z.string().trim().max(60)).max(6).default([]),
    /** In their words: "within three months", "before the summer". */
    timeframe: z.string().trim().max(60).nullable(),
    /** Sea view, high floor, furnished. Scored loosely, never disqualifying. */
    preferences: z.array(z.string().trim().max(60)).max(8).default([]),
  }),

  /**
   * The half a CRM has no columns for, and the half a twenty-year agent
   * actually trades on.
   */
  facts: z.array(z.object({
    kind: z.enum(["MOTIVATION", "OBJECTION", "CIRCUMSTANCE", "PREFERENCE",
                  "COMMUNICATION", "KEY_DATE", "BUYING_SIGNAL", "SELLING_SIGNAL",
                  "LOSS_REASON", "OTHER"]),
    /** Their words, or the agent's. Never a paraphrase into a code. */
    body: z.string().trim().min(3).max(300),
  })).max(8).default([]),

  /** Per field, so a low-confidence budget is dropped and the rest kept. */
  confidence: z.record(z.string(), z.number().min(0).max(1)).default({}),
});

export type Intake = z.infer<typeof intake>;

const SYSTEM = `You turn a UAE estate agent's note about a person into structured data.

The agent has just met somebody, or come off a call. Extract only what
they actually said.

Rules:
- **Never invent a value.** No name, no budget, no bedrooms, no area
  unless it is in the text. Missing is null. A guessed budget is worse
  than no budget, because the agent will plan around it.
- Budgets in **whole dirhams**, as a number. "12m" is 12000000.
  "around 2.5" in a Dubai property context is 2500000. If they gave a
  range, fill both min and max; if one figure, put it in max and leave
  min null.
- "around", "about", "circa" is still that number. Do not widen it.
- Communities are Dubai areas: Dubai Hills, Emirates Hills, Marina, JBR,
  Palm Jumeirah, Downtown, Arabian Ranches, Damac Hills, JVC, Business
  Bay. Speech-to-text mangles them — extract what you heard, do not
  correct it to something else.
- A seller mentioning what they want to buy next is BOTH.
- facts: only things that are genuinely stated and would matter in three
  months. Relocating, expecting a baby, lease ends in May, walked away
  from the last one over service charges, only answers WhatsApp. Do not
  manufacture a motivation from a budget.
- confidence: one entry per field you filled, keyed by the field name
  ("name", "phone", "budgetMaxAed", "bedrooms", "communities",
  "timeframe", "propertyType", "intent"). Be honest. Speech-to-text on a
  number is often wrong.
- Reply with JSON only, no prose and no code fence.`;

/**
 * The order-of-magnitude guard, kept separate from the model.
 *
 * `extract.ts` has the same guard for the conversational extractor and
 * the reasoning is identical: the failure that actually happens is not a
 * subtly wrong number, it is 12,000 or 12,000,000,000 from a
 * misheard word. A Dubai property under AED 50,000 or over AED 500m is
 * not a property, it is a transcription error.
 */
const AED_MIN = 50_000;
const AED_MAX = 500_000_000;

function plausibleAed(n: number | null): number | null {
  if (n === null || !Number.isFinite(n)) return null;
  return n >= AED_MIN && n <= AED_MAX ? Math.round(n) : null;
}

/** Whole dirhams to fils. One conversion, one place. */
export const aedToFils = (aed: number) => BigInt(Math.round(aed)) * 100n;

/**
 * Everything below the confidence floor is dropped rather than flagged.
 *
 * Different from the conversational extractor, which stores low-confidence
 * values against the lead for a human to look at. This path *acts* — it
 * creates a requirement that drives matching — so the bar is higher. A
 * field the model was unsure about is simply not filled, and the reply
 * says what it did not catch, which is how the agent knows to add it.
 */
export function trusted(raw: Intake): { value: Intake; dropped: string[] } {
  const dropped: string[] = [];
  const conf = (field: string) => raw.confidence[field] ?? 1;
  const keep = <T>(field: string, v: T, empty: T): T => {
    if (v === empty || v === null) return v;
    if (conf(field) >= CONFIDENCE_FLOOR) return v;
    dropped.push(field);
    return empty;
  };

  let min = plausibleAed(raw.requirement.budgetMinAed);
  let max = plausibleAed(raw.requirement.budgetMaxAed);
  if (raw.requirement.budgetMaxAed !== null && max === null) dropped.push("budget (implausible)");
  // A range the wrong way round means it was misread. Drop both rather
  // than silently swapping them — the swap is a guess about which number
  // was heard correctly, and there is no basis for it.
  if (min !== null && max !== null && min > max) { min = null; max = null; dropped.push("budget (inverted)"); }
  if (max !== null && conf("budgetMaxAed") < CONFIDENCE_FLOOR) {
    min = null; max = null; dropped.push("budget");
  }

  return {
    value: {
      person: {
        name: keep("name", raw.person.name, null),
        phone: keep("phone", raw.person.phone, null),
        email: keep("email", raw.person.email, null),
      },
      role: raw.role,
      requirement: {
        intent: keep("intent", raw.requirement.intent, null),
        budgetMinAed: min,
        budgetMaxAed: max,
        bedrooms: keep("bedrooms", raw.requirement.bedrooms, null),
        propertyType: keep("propertyType", raw.requirement.propertyType, null),
        communities: keep("communities", raw.requirement.communities, []),
        timeframe: keep("timeframe", raw.requirement.timeframe, null),
        preferences: raw.requirement.preferences,
      },
      // Facts are the agent's own words about a person they just met.
      // They are not acted on automatically and they are never shown to
      // a customer, so a low-confidence one costs nothing and losing it
      // costs the thing the agent will want in three months.
      facts: raw.facts,
      confidence: raw.confidence,
    },
    dropped,
  };
}

/** E.164, or nothing. A half-valid phone number is worse than none. */
export function normalisePhone(raw: string | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/[^\d+]/g, "");
  const e164 = digits.startsWith("+")
    ? digits
    // A UAE mobile said as "050 448 2211" or "0504482211".
    : digits.startsWith("00") ? `+${digits.slice(2)}`
    : digits.startsWith("05") && digits.length === 10 ? `+971${digits.slice(1)}`
    : digits.startsWith("971") ? `+${digits}`
    : null;
  return e164 && /^\+[1-9]\d{7,14}$/.test(e164) ? e164 : null;
}

export async function extractIntake(args: {
  orgId: string;
  transcript: string;
}): Promise<{ ok: true; intake: Intake; dropped: string[] } | { ok: false; reason: string }> {
  // The same gate as every other model call. A kill switch some paths
  // skip is not a kill switch, and the audit asserts it.
  const g = await gate(args.orgId);
  if (!g.allowed) {
    return { ok: false, reason: "The assistant is switched off for your brokerage." };
  }

  const raw = await callModel(SYSTEM,
    [{ body: args.transcript.slice(0, 2000), direction: "INBOUND" }]);

  let json: unknown;
  try {
    json = JSON.parse(raw.text.replace(/```json|```/g, "").trim());
  } catch {
    return { ok: false, reason: "Couldn't read that one — say it again?" };
  }

  const parsed = intake.safeParse(json);
  if (!parsed.success) {
    return { ok: false, reason: "Couldn't read that one — say it again?" };
  }

  const { value, dropped } = trusted(parsed.data);
  return { ok: true, intake: value, dropped };
}
