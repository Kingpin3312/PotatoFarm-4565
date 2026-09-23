import { describe, it, expect } from "vitest";
import { answersFrom } from "./extract";

describe("answersFrom — the qualification answers a subject access request discloses", () => {
  const fmt = (aed: number) => `AED ${aed.toLocaleString("en-GB")}`;
  const base = {
    budgetMin: null, budgetMax: null, intent: null,
    timeframe: null, financing: null, confidence: {},
  } as const;

  it("writes nothing when the extractor found nothing", () => {
    // An empty conversation must not produce an empty-string answer —
    // "" in a disclosure document reads as "we asked and they refused".
    expect(answersFrom({ ...base }, fmt)).toEqual([]);
  });

  it("renders a budget range as both ends, not a midpoint", () => {
    const [a] = answersFrom({ ...base, budgetMin: 2_500_000, budgetMax: 3_000_000 }, fmt);
    // A midpoint would be a figure the lead never said.
    expect(a).toMatchObject({ key: "budget", value: "AED 2,500,000 – AED 3,000,000" });
  });

  it("renders one figure when only one end is known", () => {
    const [a] = answersFrom({ ...base, budgetMax: 3_000_000 }, fmt);
    expect(a?.value).toBe("AED 3,000,000");
  });

  it("carries the model's per-field confidence, keyed as the model keys it", () => {
    // The extractor keys confidence by *its* field names — `timeframe`,
    // `intent`, `budgetMax` — not by the answer's key. This test was
    // first written as `{ timeline: 0.42 }`, which matched the bug it
    // was meant to catch: every answer but `financing` stored with no
    // confidence, because the model never writes a key called
    // "timeline".
    const out = answersFrom(
      { ...base, timeframe: "3 months", intent: "BUY_TO_INVEST",
        confidence: { timeframe: 0.42, intent: 0.9 } }, fmt,
    );
    expect(out).toEqual([
      { key: "timeline", value: "3 months", confidence: 0.42 },
      { key: "purpose", value: "BUY_TO_INVEST", confidence: 0.9 },
    ]);
  });

  it("takes the less certain end of a budget range", () => {
    const [a] = answersFrom(
      { ...base, budgetMin: 2_500_000, budgetMax: 3_000_000,
        confidence: { budgetMin: 0.95, budgetMax: 0.5 } }, fmt,
    );
    // A range is only as sure as its least sure end, and 0.5 is under
    // the floor that asks an agent to confirm it.
    expect(a?.confidence).toBe(0.5);
  });

  it("ignores the confidence of an end the extractor then discarded", () => {
    // `sane()` nulls an implausible figure but leaves its confidence in
    // the record. A confident guess at a discarded number must not lend
    // its certainty to the end that survived.
    // The discarded end is the *less* certain one on purpose: with it
    // the other way round, taking the minimum of both gives the same
    // answer and this test could not fail.
    const [a] = answersFrom(
      { ...base, budgetMax: 3_000_000, confidence: { budgetMin: 0.2, budgetMax: 0.9 } }, fmt,
    );
    expect(a?.confidence).toBe(0.9);
  });

  it("never invents an answer to a question the extractor cannot answer", () => {
    const keys = answersFrom(
      { budgetMin: 1_000_000, budgetMax: 2_000_000, intent: "BUY_TO_LIVE",
        timeframe: "soon", financing: "CASH", confidence: {} }, fmt,
    ).map((a) => a.key);
    // The profile asks five questions; the extractor has fields for
    // four. Fabricating the fifth would put an invented statement in a
    // disclosure document.
    expect(keys).not.toContain("viewing");
    expect(keys.sort()).toEqual(["budget", "financing", "purpose", "timeline"]);
  });
});
