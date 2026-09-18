import { describe, expect, it } from "vitest";
import { DEFAULT_RATE, RATES, priceFils } from "./pricing";

/**
 * The spend ceiling is only as good as this arithmetic.
 *
 * There was no test on it, and the file it lived in could not be
 * imported without a database, which is why. It is money, it is silent
 * when it is wrong — a wrong rate does not throw, it just lets a
 * brokerage run past a budget it set on purpose — and that is the exact
 * profile of everything else in this suite.
 *
 * Each of these was checked by breaking the thing it guards: changing a
 * rate, flipping the rounding, and removing the unknown-model fallback
 * each turn one of these red.
 */
describe("what a model turn costs", () => {
  it("prices the current Sonnet tier from its published rate", () => {
    // $2 per million in, $10 out, at 367.25 fils to the dollar.
    expect(RATES["claude-sonnet-5"]).toEqual({ in: 735, out: 3673 });
  });

  it("keeps a correct price for the model it replaced", () => {
    // Still served, still reachable through ASSISTANT_MODEL. $3 / $15.
    expect(RATES["claude-sonnet-4-6"]).toEqual({ in: 1102, out: 5509 });
  });

  it("is cheaper per token than the model it replaced", () => {
    // The migration's own claim, asserted rather than stated in a
    // comment. If a future price change reverses this, the sentence in
    // run.ts is wrong and somebody should have to notice.
    const now = RATES["claude-sonnet-5"]!;
    const before = RATES["claude-sonnet-4-6"]!;
    expect(now.in).toBeLessThan(before.in);
    expect(now.out).toBeLessThan(before.out);
  });

  it("charges an unknown model at the dearest rate, not the cheapest", () => {
    // The rule was written down and the value contradicted it: the
    // fallback used to be the Sonnet rate, so pointing ASSISTANT_MODEL
    // at a dearer model under-priced every turn and the ceiling stopped
    // holding. A ceiling that only works for the expected model is not
    // a ceiling.
    for (const rate of Object.values(RATES)) {
      expect(DEFAULT_RATE.in).toBeGreaterThanOrEqual(rate.in);
      expect(DEFAULT_RATE.out).toBeGreaterThanOrEqual(rate.out);
    }
    expect(priceFils("something-nobody-has-priced", 1_000_000, 1_000_000))
      .toBe(BigInt(DEFAULT_RATE.in + DEFAULT_RATE.out));
  });

  it("charges a whole million of each at the sum of the two rates", () => {
    expect(priceFils("claude-sonnet-5", 1_000_000, 1_000_000)).toBe(735n + 3673n);
  });

  it("bills a fraction of a fil as one fil, never as nothing", () => {
    // A busy WhatsApp inbox is a great many small turns. Rounding down
    // lets real spend accumulate against a ceiling that never moves.
    expect(priceFils("claude-sonnet-5", 1, 0)).toBe(1n);
    expect(priceFils("claude-sonnet-5", 0, 1)).toBe(1n);
  });

  it("costs nothing when nothing was spent", () => {
    expect(priceFils("claude-sonnet-5", 0, 0)).toBe(0n);
  });

  it("returns fils as BigInt, because all money in this codebase is", () => {
    expect(typeof priceFils("claude-sonnet-5", 500, 500)).toBe("bigint");
  });

  it("scales linearly with tokens", () => {
    const one = priceFils("claude-sonnet-5", 1_000_000, 1_000_000);
    const ten = priceFils("claude-sonnet-5", 10_000_000, 10_000_000);
    expect(ten).toBe(one * 10n);
  });

  it("charges output more than input, as every published rate does", () => {
    for (const [model, rate] of Object.entries(RATES)) {
      expect(rate.out, model).toBeGreaterThan(rate.in);
    }
  });
});
