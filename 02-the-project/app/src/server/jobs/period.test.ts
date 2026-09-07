import { describe, it, expect } from "vitest";
import { addOneMonth } from "./index";

/**
 * Billing periods roll forward by a month, and the obvious way to do
 * that is wrong.
 *
 * `setUTCMonth(getUTCMonth() + 1)` overflows for any day after the 28th:
 * asked for 31 February it returns 3 March. A brokerage that signed up
 * on the 31st was billed on the 3rd from the following month onward, and
 * never got its anniversary back.
 *
 * It never overcharged — `generateInvoice` divides the monthly price by
 * the actual period length, so a longer period bills a lower daily rate
 * and the total self-corrects. That is exactly why it survived: the
 * money was right, so nothing that checked money could see it.
 */
const day = (iso: string) => addOneMonth(new Date(`${iso}T00:00:00.000Z`))
  .toISOString()
  .slice(0, 10);

describe("addOneMonth", () => {
  it("clamps 31 January to the end of February", () => {
    // The original returned 2026-03-03.
    expect(day("2026-01-31")).toBe("2026-02-28");
  });

  it("clamps in a leap year to the 29th", () => {
    expect(day("2024-01-31")).toBe("2024-02-29");
  });

  it("clamps a 31-day month onto a 30-day one", () => {
    expect(day("2026-03-31")).toBe("2026-04-30");
    expect(day("2026-08-31")).toBe("2026-09-30");
  });

  it("leaves a day that exists in the target month alone", () => {
    expect(day("2026-01-15")).toBe("2026-02-15");
    expect(day("2026-02-28")).toBe("2026-03-28");
  });

  it("rolls the year over in December", () => {
    expect(day("2026-12-31")).toBe("2027-01-31");
  });

  it("never returns a date in the wrong month", () => {
    // The overflow bug's signature: asked for February, given March.
    for (const d of ["2026-01-29", "2026-01-30", "2026-01-31"]) {
      expect(day(d).slice(0, 7)).toBe("2026-02");
    }
  });

  it("always moves forward, never backward or nowhere", () => {
    for (const d of ["2026-01-31", "2026-02-28", "2026-05-31", "2024-02-29"]) {
      const from = new Date(`${d}T00:00:00.000Z`);
      expect(addOneMonth(from).getTime()).toBeGreaterThan(from.getTime());
    }
  });
});
