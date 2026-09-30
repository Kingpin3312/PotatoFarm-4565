import { describe, it, expect } from "vitest";
import { band, nextAlert, MANDATORY_FILS, VOLUNTARY_FILS, APPROACHING_FILS } from "./vat-threshold";

const AED = (n: number) => BigInt(Math.round(n * 100));

describe("band — when VAT registration stops being optional", () => {
  it("has nothing to watch once registered", () => {
    expect(band(true, AED(900_000), AED(900_000))).toBe("REGISTERED");
  });
  it("is below the line under AED 187,500", () => {
    expect(band(false, AED(187_499.99), 0n)).toBe("BELOW");
  });
  it("may register voluntarily from AED 187,500", () => {
    expect(VOLUNTARY_FILS).toBe(AED(187_500));
    expect(band(false, AED(187_500), 0n)).toBe("VOLUNTARY");
  });
  it("warns at AED 300,000, with time to register before it is late", () => {
    expect(APPROACHING_FILS).toBe(AED(300_000));
    expect(band(false, AED(299_999.99), 0n)).toBe("VOLUNTARY");
    expect(band(false, AED(300_000), 0n)).toBe("APPROACHING");
  });
  it("must register once twelve months exceed AED 375,000 — exceed, not reach", () => {
    expect(MANDATORY_FILS).toBe(AED(375_000));
    expect(band(false, AED(375_000), 0n)).toBe("APPROACHING");
    expect(band(false, AED(375_000.01), 0n)).toBe("MUST_REGISTER");
  });
  it("must register when the next thirty days alone exceed it, with no history", () => {
    expect(band(false, 0n, AED(375_000.01))).toBe("MUST_REGISTER");
    expect(band(false, 0n, AED(375_000))).toBe("BELOW");
  });
});

describe("nextAlert — once per rise, weekly while registration is overdue", () => {
  const now = new Date("2026-10-01T06:00:00Z");
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000).toISOString();

  it("says nothing below the line", () => {
    expect(nextAlert("BELOW", { alerted: "BELOW", alertedAt: null }, now).send).toBe(false);
  });
  it("emails on a rise, and remembers it", () => {
    const r = nextAlert("APPROACHING", { alerted: "VOLUNTARY", alertedAt: daysAgo(40) }, now);
    expect(r).toEqual({ send: true, state: { alerted: "APPROACHING", alertedAt: now.toISOString() } });
  });
  it("does not repeat a warning it already gave", () => {
    expect(nextAlert("APPROACHING", { alerted: "APPROACHING", alertedAt: daysAgo(30) }, now).send).toBe(false);
  });
  it("repeats the compulsory one weekly, because the thirty days are running", () => {
    expect(nextAlert("MUST_REGISTER", { alerted: "MUST_REGISTER", alertedAt: daysAgo(6) }, now).send).toBe(false);
    expect(nextAlert("MUST_REGISTER", { alerted: "MUST_REGISTER", alertedAt: daysAgo(7) }, now).send).toBe(true);
  });
  it("forgets a band turnover has fallen out of, so a return is announced again", () => {
    const fell = nextAlert("VOLUNTARY", { alerted: "APPROACHING", alertedAt: daysAgo(10) }, now);
    expect(fell.send).toBe(false);
    expect(fell.state.alerted).toBe("VOLUNTARY");
    expect(nextAlert("APPROACHING", fell.state, now).send).toBe(true);
  });
  it("goes quiet once registered", () => {
    expect(nextAlert("REGISTERED", { alerted: "MUST_REGISTER", alertedAt: daysAgo(30) }, now).send).toBe(false);
  });
});
