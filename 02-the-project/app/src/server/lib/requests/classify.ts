import { z } from "zod";
import { gate } from "@/server/assistant/controls";
import { callModel } from "@/server/assistant/run";
import { CONFIDENCE_FLOOR } from "@/server/assistant/extract";

/**
 * Turning what an agent said into something to do.
 *
 * The competing product routes to seventeen fixed recipes and puts a
 * human advisor behind every one. We keep the closed set — an
 * "ask me anything" surface produces confident nonsense exactly where
 * this domain punishes it — and replace the human with a confidence
 * floor.
 *
 * The floor is `CONFIDENCE_FLOOR` from the extractor, not a second
 * number. One threshold across the product means an agent learns one
 * behaviour: below it, we ask.
 */

const Result = z.object({
  recipe: z.enum(["COMPARABLES", "LISTING_PITCH", "VENDOR_UPDATE", "LOG_CONTACT",
                  "BOOK_VIEWING", "DRAFT_REPLY", "DAY_BRIEF", "UNCLEAR"]),
  confidence: z.number().min(0).max(1),
  /** What it heard a reference to. Resolved against real records
   *  afterwards — never trusted as given. */
  entities: z.object({
    building: z.string().optional(),
    personName: z.string().optional(),
    when: z.string().optional(),
  }).default({}),
  /** One question, if unclear. An agent in a car answers one, not four. */
  question: z.string().optional(),
});

export type Classified = z.infer<typeof Result>;

const SYSTEM = `You route a UAE estate agent's spoken request to one recipe.

Recipes:
- COMPARABLES: what is a property worth, what similar ones sold for
- LISTING_PITCH: material to win or keep an instruction
- VENDOR_UPDATE: an update for a property owner
- LOG_CONTACT: record somebody they met, with a follow-up
- BOOK_VIEWING: arrange a viewing
- DRAFT_REPLY: write a message to a lead
- DAY_BRIEF: what is on today
- UNCLEAR: anything else

Rules:
- Speech-to-text mangles Dubai building names. "Marina Gate", "Damac
  Heights", "Burj Vista" arrive misspelled. Extract what you heard;
  do not correct it.
- If a request could be two recipes, that is UNCLEAR with one question.
- Never guess a number, a price or a date. Extraction only.
- Reply with JSON only, no prose and no code fence.`;

export async function classify(args: {
  orgId: string; transcript: string;
}): Promise<Classified> {
  // The same gate every other model call goes through. A kill switch
  // that some paths skip is not a kill switch, and the audit asserts it.
  const g = await gate(args.orgId);
  if (!g.allowed) {
    return { recipe: "UNCLEAR", confidence: 0, entities: {},
             question: "The assistant is switched off for your brokerage." };
  }

  const raw = await callModel(SYSTEM,
    [{ body: args.transcript.slice(0, 2000), direction: "INBOUND" }]);

  const parsed = Result.safeParse(safeJson(raw));
  if (!parsed.success) {
    // A malformed reply is UNCLEAR, not a crash and not a guess.
    return { recipe: "UNCLEAR", confidence: 0, entities: {},
             question: "Sorry — say that again?" };
  }

  const out = parsed.data;
  // Applied after parsing, so a confident-sounding wrong answer still
  // lands in UNCLEAR.
  if (out.confidence < CONFIDENCE_FLOOR && out.recipe !== "UNCLEAR") {
    return { ...out, recipe: "UNCLEAR",
             question: out.question ?? "Did you want comparables, or something else?" };
  }
  return out;
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s.replace(/```json|```/g, "").trim()); }
  catch { return null; }
}
