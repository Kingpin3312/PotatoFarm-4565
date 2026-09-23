import { z } from "zod";

/**
 * Pulling structured answers out of a conversation.
 *
 * Run as a separate call from the reply, on purpose. Asking one model call
 * to both write a good message and emit clean JSON produces worse of both,
 * and it means a parsing failure costs the lead a reply.
 */
export const extraction = z.object({
  budgetMin: z.number().nullable(),
  budgetMax: z.number().nullable(),
  intent: z.enum(["BUY_TO_LIVE", "BUY_TO_INVEST", "RENT", "SELL", "LIST"]).nullable(),
  timeframe: z.string().max(60).nullable(),
  financing: z.enum(["CASH", "MORTGAGE", "UNKNOWN"]).nullable(),
  /**
   * The model's own confidence, per field. Anything under the threshold is
   * stored but flagged rather than shown as fact — an assistant that
   * confidently records a budget it guessed is worse than one that
   * records nothing, because an agent will plan around it.
   */
  confidence: z.record(z.string(), z.number().min(0).max(1)),
});

export type Extraction = z.infer<typeof extraction>;

export const CONFIDENCE_FLOOR = 0.7;

export function needsConfirmation(e: Extraction) {
  return Object.entries(e.confidence)
    .filter(([, c]) => c < CONFIDENCE_FLOOR)
    .map(([k]) => k);
}

/**
 * Budgets arrive as "2.5", "2.5m", "around 2-3 million", "AED 2,500,000".
 * The model normalises to a number; this catches the ones it gets wrong by
 * an order of magnitude, which is the failure that actually happens.
 */
export function sane(e: Extraction): Extraction {
  const plausible = (n: number | null) =>
    n === null ? null : n >= 50_000 && n <= 500_000_000 ? n : null;

  const min = plausible(e.budgetMin);
  const max = plausible(e.budgetMax);

  return {
    ...e,
    budgetMin: min,
    budgetMax: max,
    // A range the wrong way round means it was misread. Drop both rather
    // than silently swapping them.
    ...(min !== null && max !== null && min > max ? { budgetMin: null, budgetMax: null } : {}),
  };
}


/**
 * The extraction, as answers to the profile's own questions.
 *
 * Pulled out of `extractAndStore` so it can be tested without a model.
 * The function that wrote the lead row took a `profileId` and never
 * mentioned it again, so `Answer` had no writer at all — and the two
 * readers were both quietly wrong: a subject access request replied
 * "we hold nothing you told us" while the person's budget, timeframe,
 * intent and financing sat on the lead unexported, and the settings
 * screen told the brokerage the answers feed the pipeline.
 *
 * Keys are the `Question.key` values, and that coupling is the thing
 * most likely to rot: rename a question and the writer silently stops
 * writing. `check:qualification` asserts the two agree.
 *
 * `viewing` is deliberately absent. The profile asks it, and the
 * extractor has no field for it — inventing one here would put a
 * fabricated answer in a disclosure document.
 */
export function answersFrom(
  e: Extraction,
  fmt: (aed: number) => string,
): { key: string; value: string; confidence: number | null }[] {
  const out: { key: string; value: string; confidence: number | null }[] = [];
  /**
   * Confidence is looked up by the **extraction's** field names, not the
   * answer's key — and the two differ for three of the four.
   *
   * The extractor is told to give "a confidence for each field you
   * populate", and the fields are `budgetMin`, `timeframe`, `intent`.
   * `needsConfirmation` reads the same keys, which is where the lead
   * card's "Confirm with the lead: timeframe" comes from. This first
   * looked up `confidence[key]` with `key` = `"timeline"`, which the
   * model never writes, so every answer but `financing` — the one name
   * the two happen to share — was stored with no confidence at all, and a
   * guessed budget read as certain as a stated one.
   *
   * A budget is two fields; it takes the lower of the two, because a
   * range is only as sure as its least sure end.
   */
  const conf = (...fields: (keyof Extraction)[]) => {
    const known = fields
      .map((f) => e.confidence[f])
      .filter((c): c is number => typeof c === "number");
    return known.length ? Math.min(...known) : null;
  };
  const add = (key: string, value: string | null, confidence: number | null) => {
    if (value) out.push({ key, value, confidence });
  };

  add(
    "budget",
    e.budgetMin === null && e.budgetMax === null
      ? null
      // A range when both ends are known, one figure when only one is.
      // "2,500,000 – 3,000,000" is what the lead actually said; a
      // single midpoint would be a number nobody uttered.
      : [e.budgetMin, e.budgetMax]
          .filter((n): n is number => n !== null)
          .map(fmt)
          .join(" \u2013 "),
    conf(
      ...(e.budgetMin !== null ? (["budgetMin"] as const) : []),
      ...(e.budgetMax !== null ? (["budgetMax"] as const) : []),
    ),
  );
  add("timeline", e.timeframe, conf("timeframe"));
  add("financing", e.financing, conf("financing"));
  add("purpose", e.intent, conf("intent"));

  return out;
}
