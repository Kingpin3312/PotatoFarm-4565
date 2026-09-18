/**
 * What a model turn costs, in fils.
 *
 * ## Why this is its own file
 *
 * It was twenty lines inside `controls.ts`, which opens a database
 * client at module scope — so the one piece of arithmetic standing
 * between the assistant and a brokerage's spend ceiling could not be
 * unit tested without a Postgres. It was therefore not tested at all.
 * This is pure and imports nothing.
 *
 * ## The numbers used to be guesses, and said so
 *
 * `.env.example` carried the admission in writing: "the default in
 * controls.ts is a guess and the price table beside it is a guess too."
 * They are not guesses now — every rate below is derived from the
 * published per-million-token price and the dirham peg, and the
 * arithmetic is in the code rather than in somebody's head, so the next
 * price change is one number rather than two.
 *
 * The cost is written to the ledger at the time of the call, never
 * recomputed at billing time. Pricing changes; a historical invoice must
 * not move underneath a customer.
 */

/**
 * Fils per US dollar.
 *
 * The dirham is pegged at 3.6725 to the dollar, and there are 100 fils
 * in a dirham. The peg is a central-bank commitment rather than a market
 * rate, which is why a constant is honest here and would not be for a
 * floating currency.
 */
const FILS_PER_USD = 367.25;

/** Published price per million tokens, in dollars, as charged. */
const perMillion = (usdIn: number, usdOut: number): Rate => ({
  in: Math.round(usdIn * FILS_PER_USD),
  out: Math.round(usdOut * FILS_PER_USD),
});

export type Rate = { in: number; out: number };

/**
 * What an unrecognised model costs, and it is deliberately the dearest
 * one on the list rather than the one we happen to run.
 *
 * The rule was already written down — "the spend ceiling should stop
 * early against an unknown model rather than let it run because we
 * guessed cheap" — and the value contradicted it: the default was the
 * Sonnet rate, so pointing `ASSISTANT_MODEL` at an Opus-tier model
 * under-priced every turn by about two and a half times and let a
 * brokerage sail past a ceiling it had set on purpose. A ceiling that
 * only holds for the model you expected is not a ceiling.
 */
export const DEFAULT_RATE: Rate = perMillion(10, 50);

export const RATES: Record<string, Rate> = {
  // $2 / $10 per million. The current Sonnet tier, and both newer and
  // cheaper than the 4.6 it replaced.
  "claude-sonnet-5": perMillion(2, 10),
  // $3 / $15. Still served, and still reachable through
  // `ASSISTANT_MODEL`, so it keeps a correct price rather than falling
  // to the unknown-model rate.
  "claude-sonnet-4-6": perMillion(3, 15),
  // $1 / $5. Not what the assistant runs on, priced because it is the
  // obvious thing to reach for if a brokerage's volume outgrows its
  // budget before its quality needs do.
  "claude-haiku-4-5": perMillion(1, 5),
  // $5 / $25.
  "claude-opus-5": perMillion(5, 25),
};

/**
 * Rounded **up**, always.
 *
 * A turn that costs a fraction of a fil bills as one fil rather than as
 * nothing. Rounding down would let a high-volume, low-token workload —
 * which is exactly what a busy WhatsApp inbox is — accumulate real spend
 * against a ceiling that never moves.
 */
export function priceFils(model: string, inTok: number, outTok: number): bigint {
  // An index read on a `Record` is possibly undefined under
  // `noUncheckedIndexedAccess`, and the fallback is a named constant
  // rather than a `default` key so that it genuinely cannot be.
  const r = RATES[model] ?? DEFAULT_RATE;
  const cost = (inTok / 1_000_000) * r.in + (outTok / 1_000_000) * r.out;
  return BigInt(Math.ceil(cost));
}
