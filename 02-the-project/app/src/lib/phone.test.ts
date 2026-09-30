import { describe, it, expect } from "vitest";
import { normalisePhone, looksLikePhone, phoneSearchKey } from "./phone";

describe("normalisePhone — every way a UAE number is written", () => {
  it.each([
    ["+971501000041", "+971501000041"],
    ["+971 50 100 0041", "+971501000041"],
    ["971501000041", "+971501000041"],
    ["00971501000041", "+971501000041"],
    ["0501000041", "+971501000041"],
    ["050-100-0041", "+971501000041"],
    ["(050) 100 0041", "+971501000041"],
    ["501000041", "+971501000041"],
    ["+44 7700 900123", "+447700900123"],
  ])("%s → %s", (raw, e164) => {
    expect(normalisePhone(raw)).toBe(e164);
  });
  it("refuses what it cannot read rather than guessing", () => {
    for (const bad of ["", "12345", "abc", "+0501000041", "1234567890123456789"]) {
      expect(normalisePhone(bad)).toBeNull();
    }
  });
});

describe("looksLikePhone — a number, not a budget or a reference", () => {
  it("recognises the forms agents type", () => {
    for (const q of ["+971501000041", "0501000041", "050 100 0041", "971501000041", "1000041", "00971501000041"]) {
      expect(looksLikePhone(q)).toBe(true);
    }
  });
  it("leaves budgets, words and references alone", () => {
    for (const q of ["3000000", "2500000", "3m", "villa", "AR-508", "2 bed", "12345"]) {
      expect(looksLikePhone(q)).toBe(false);
    }
  });
});

describe("phoneSearchKey — the national number, whatever was typed", () => {
  it("gives the same key for every full form", () => {
    for (const q of ["+971501000041", "0501000041", "050 100 0041", "971501000041"]) {
      expect(phoneSearchKey(q)).toBe("501000041");
    }
  });
  it("keeps a fragment as typed, to match the end of a number", () => {
    expect(phoneSearchKey("1000041")).toBe("1000041");
  });
});
