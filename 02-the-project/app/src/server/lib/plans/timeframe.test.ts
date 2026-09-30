import { describe, it, expect } from "vitest";
import { monthsAway } from "./timeframe";

const SEPT = new Date("2026-09-25T08:00:00Z");
const m = (s: string | null) => monthsAway(s, SEPT);

describe("monthsAway — later, read conservatively", () => {
  it("reads what people actually say about later", () => {
    expect(m("in about six months")).toBe(6);
    expect(m("6 months")).toBe(6);
    expect(m("around 6 months from now")).toBe(6);
    expect(m("a year")).toBe(12);
    expect(m("18 months")).toBe(18);
    expect(m("a few months")).toBe(3);
  });

  it("reads a range at its near end", () => {
    expect(m("3-6 months")).toBe(3);
    expect(m("3 to 6 months")).toBe(3);
    expect(m("3–6 months")).toBe(3);
  });

  it("reads years against today", () => {
    // September: next year is four months off, 2028 sixteen.
    expect(m("next year")).toBe(4);
    expect(m("early 2028")).toBe(16);
  });

  it("does not mistake a deadline for a delay", () => {
    // The distinction the whole function exists for: somebody buying
    // "within six months" is buying now, and a nurture plan loses them.
    expect(m("within 6 months")).toBe(0);
    expect(m("in the next 3 months")).toBe(0);
    expect(m("before the end of the year")).toBe(0);
  });

  it("reads now as now", () => {
    expect(m("ASAP")).toBe(0);
    expect(m("this month")).toBe(0);
  });

  it("says nothing when it cannot tell", () => {
    expect(m("when the right one comes up")).toBeNull();
    expect(m("")).toBeNull();
    expect(m(null)).toBeNull();
    expect(m("بعد ستة أشهر")).toBeNull();
  });
});
