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
