import { describe, expect, it } from "vitest";
import { aed, aedShort, aedToFils, aedWhole, filsToAed, usd, usdToFils, AED_PER_USD } from "./money";

/**
 * Money.
 *
 * The bug this file exists to prevent already happened: two of five
 * formatters assumed their argument was AED when everything else stored
 * fils, so a board could show a buyer a property at a hundred times its
 * price. It reads as a data problem, which is why it survived.
 *
 * So the first thing asserted is the unit, over and over, in every
 * function that takes a value.
 */
describe("the unit is fils, not dirhams", () => {
  it("treats the argument as fils in every formatter", () => {
    const twoAndAHalfMillion = 250_000_000n;   // AED 2,500,000.00 in fils
    expect(aed(twoAndAHalfMillion)).toBe("AED 2,500,000.00");
    expect(aedWhole(twoAndAHalfMillion)).toBe("AED 2,500,000");
    expect(aedShort(twoAndAHalfMillion)).toBe("AED 2.5M");
  });

  it("does not read a fils value as dirhams", () => {
    // The 100x bug in one assertion: if anything here divided by 1
    // instead of 100, this would read AED 250,000,000.
    expect(aed(250_000_000n)).not.toContain("250,000,000");
  });

  it("round-trips through the boundary converters", () => {
    expect(aedToFils(2_500_000)).toBe(250_000_000n);
    expect(filsToAed(250_000_000n)).toBe(2_500_000);
    expect(filsToAed(aedToFils(1234.56))).toBeCloseTo(1234.56, 2);
  });

  it("rounds at the boundary rather than truncating", () => {
    // A person typing 0.005 must not silently become 0.
    expect(aedToFils(0.005)).toBe(1n);
    expect(aedToFils(1.994)).toBe(199n);
    expect(aedToFils(1.995)).toBe(200n);
  });
});

describe("absent is not zero", () => {
  /**
   * A property with no price and a property priced at nothing are
   * different facts, and showing "AED 0" for the first is a lie an agent
   * would repeat to a client.
   */
  it("renders an em dash for null and undefined", () => {
    for (const f of [aed, aedWhole, aedShort, usd]) {
      expect(f(null)).toBe("—");
      expect(f(undefined)).toBe("—");
    }
  });

  it("still renders a real zero as zero", () => {
    expect(aed(0n)).toBe("AED 0.00");
    expect(aedShort(0n)).toBe("AED 0");
  });
});

describe("aedWhole drops the fils, aed keeps them", () => {
  /**
   * Two functions on purpose. `.00` on a seven-figure price reads as a
   * system nobody thought about; a commission statement needs the fils.
   */
  it("keeps two decimals where the money is being counted", () => {
    expect(aed(123_456n)).toBe("AED 1,234.56");
  });

  it("drops them where the money is being quoted", () => {
    expect(aedWhole(123_456n)).toBe("AED 1,235");
  });
});

describe("aedShort is compact without being wrong", () => {
  it("switches unit at a thousand and a million", () => {
    expect(aedShort(99_900n)).toBe("AED 999");         // 999.00
    expect(aedShort(100_000n)).toBe("AED 1k");         // 1,000
    expect(aedShort(99_999_900n)).toBe("AED 1000k");   // 999,999 -> k, not M
    expect(aedShort(100_000_000n)).toBe("AED 1.0M");
  });

  it("keeps one decimal on millions so 2.5M is not 2M", () => {
    expect(aedShort(250_000_000n)).toBe("AED 2.5M");
    expect(aedShort(199_000_000n)).toBe("AED 2.0M");
  });
});

describe("the dollar side", () => {
  /**
   * The peg is fixed at 3.6725 and has been since 1997. If this ever
   * needs to become a rate lookup, that is a product decision, not a
   * refactor — the invoice must stay in dirhams for UAE VAT.
   */
  it("converts at the peg", () => {
    expect(usdToFils(70)).toBe(BigInt(Math.round(70 * AED_PER_USD * 100)));
    expect(usd(usdToFils(70))).toBe("$70");
  });

  it("shows cents only when there are cents", () => {
    expect(usd(36_725n)).toBe("$100");        // AED 367.25 exactly
    expect(usd(50_000n)).toContain(".");      // AED 500 -> $136.15
  });

  /**
   * The regression this pair exists for.
   *
   * `usd()` decided whether to print cents with `dollars % 1 === 0` on
   * the raw quotient. Dividing by the peg almost never lands on a whole
   * number, so the product's own price — round-tripped through
   * `usdToFils(70)` — came back as 70.00136… and printed "$70.00" on a
   * page whose headline says $70. The test now asks the question the
   * function's comment claims it asks: is the figure *being shown* whole?
   */
  it("prints the round-tripped headline price without cents", () => {
    expect(usd(usdToFils(70))).toBe("$70");
  });

  it("does not round a real fraction away to look tidy", () => {
    // AED 500 is $136.15 and must keep saying so.
    expect(usd(50_000n)).toBe("$136.15");
  });
});
