import { describe, expect, it } from "vitest";
import { isEmpty, parse } from "./parse";

/**
 * Natural language into a structured query.
 *
 * Rules rather than a model, and every case below is a sentence that
 * went wrong on a real screen. The value of pinning them is that the
 * failures here are *plausible* — a search that quietly reinterprets the
 * question still returns rows, and rows look like an answer.
 */

describe("bedrooms are read before anything else touches a number", () => {
  it("takes the bed count and not the budget", () => {
    const q = parse("3 bed in Dubai Marina");
    expect(q.bedrooms).toBe(3);
    expect(q.budget).toBeNull();
  });

  it.each(["3 bed", "3 beds", "3 bedroom", "3 bedrooms", "3br", "3 br", "3-bed"])(
    "understands %s", (phrase) => {
      expect(parse(`${phrase} in Marina`).bedrooms).toBe(3);
    },
  );

  /**
   * The bare number must not survive as a text term after it has been
   * understood, or it also matches every phone number and reference.
   */
  it("consumes the phrase rather than leaving it as a keyword", () => {
    expect(parse("3 bed in Dubai Marina").terms).not.toContain("bed");
  });
});

describe("budget", () => {
  it("reads a ceiling", () => {
    expect(parse("villa under 5m").budget).toEqual({ minAed: null, maxAed: 5_000_000 });
  });

  it("reads a floor", () => {
    expect(parse("anything over 2 million").budget).toEqual({ minAed: 2_000_000, maxAed: null });
  });

  it("reads a range in the order the person said it", () => {
    expect(parse("between 2m and 4m").budget).toEqual({ minAed: 2_000_000, maxAed: 4_000_000 });
  });

  it("puts a backwards range the right way round", () => {
    expect(parse("between 4m and 2m").budget).toEqual({ minAed: 2_000_000, maxAed: 4_000_000 });
  });

  /**
   * "Around four million" is a band, not a number — ±15%. Narrow enough
   * that it does not return the 6m villas, wide enough that a buyer
   * whose ceiling was recorded as 3.6 still appears, which is the reason
   * somebody phrases it this way instead of typing two numbers.
   */
  it("turns an approximate figure into a band", () => {
    expect(parse("around 4 million").budget).toEqual({ minAed: 3_400_000, maxAed: 4_600_000 });
  });

  /**
   * A bare number under a thousand means millions, deliberately.
   *
   * Nobody searching a Dubai property database means five dirhams, and
   * "under 5" is how an agent actually types it. Bedrooms are eaten out
   * of the sentence first, so this never sees the 3 in "3 bed".
   */
  it("reads a bare small number as millions", () => {
    expect(parse("under 5").budget).toEqual({ minAed: null, maxAed: 5_000_000 });
    expect(parse("under 750000").budget).toEqual({ minAed: null, maxAed: 750_000 });
  });

  /**
   * The failure that actually happens with money is not a subtly wrong
   * number, it is a factor of a thousand from a mistyped or misheard
   * word. The guard is a plausibility band, not a rounding rule.
   */
  it("ignores a figure outside any plausible property price", () => {
    expect(parse("under 900 million").budget).toBeNull();   // above the ceiling
    expect(parse("under 20000").budget).toBeNull();         // below the floor
  });
});

describe("intent survives the plural", () => {
  /**
   * The bug: `\b` sits between a word and a space, not between "seller"
   * and its own plural, so `/\bseller\b/` never matched "sellers" — the
   * commonest phrasing was the one that silently did nothing.
   */
  it.each([
    ["investor", "BUY_TO_INVEST"], ["investors", "BUY_TO_INVEST"], ["investing", "BUY_TO_INVEST"],
    ["seller", "SELL"], ["sellers", "SELL"], ["selling", "SELL"],
    ["owner", "SELL"], ["owners", "SELL"],
    ["tenant", "RENT"], ["tenants", "RENT"], ["renting", "RENT"],
  ])("%s reads as %s", (word, intent) => {
    expect(parse(`${word} in Dubai Marina`).intent).toBe(intent);
  });

  it("marks a rental search as a rental on the property side too", () => {
    expect(parse("tenants for Marina Gate").purpose).toBe("RENT");
    expect(parse("investors in Marina Gate").purpose).toBeNull();
  });
});

describe("people or properties", () => {
  /**
   * The bug this pins: "buyers for a villa" was classified as a property
   * search, because it contains a property word. But a villa there is
   * what the people *want*, not what kind of row they are — so the
   * search returned listings and not one buyer.
   */
  it("asks about people when the record named is a person", () => {
    expect(parse("buyers for a villa in Arabian Ranches").only).toBe("people");
    expect(parse("who wants a 3 bed in Marina").only).toBe("people");
    expect(parse("sellers in Dubai Hills").only).toBe("people");
  });

  it("asks about properties only when the record named is a property", () => {
    expect(parse("properties in Dubai Marina").only).toBe("properties");
    expect(parse("listings under 3m").only).toBe("properties");
  });

  it("leaves it open when they said neither", () => {
    expect(parse("Dubai Marina under 3m").only).toBeNull();
  });
});

describe("places", () => {
  /**
   * The canonical form is the one agents say, not the one on the title
   * deed. Nobody in Dubai says "Jumeirah Beach Residence" — they say
   * JBR — so JBR is canonical and the long form is the alias, which is
   * the opposite of what a database designer reaches for first.
   */
  it("resolves an alias to the canonical name", () => {
    expect(parse("villa in the Ranches").communities).toContain("Arabian Ranches");
    expect(parse("flat in JBR").communities).toContain("JBR");
    expect(parse("flat in Jumeirah Beach Residence").communities).toContain("JBR");
  });

  /**
   * A matched place must not also survive as a loose keyword, or the
   * text search runs against half the database as well as the filter.
   */
  it("consumes the place rather than leaving it as a term", () => {
    const q = parse("3 bed in Dubai Marina");
    expect(q.communities).toContain("Dubai Marina");
    expect(q.terms).not.toContain("marina");
    expect(q.terms).not.toContain("dubai");
  });
});

describe("the loose words are kept, not discarded", () => {
  /**
   * "Emirati", "relocating", "school", "cash" are not columns and never
   * will be, and they are exactly what an agent remembers about somebody
   * a year later.
   */
  it("keeps what it could not structure", () => {
    const q = parse("Emirati family relocating, needs a school nearby");
    expect(q.terms).toContain("emirati");
    expect(q.terms).toContain("relocating");
    expect(q.terms).toContain("school");
  });

  it("drops stop words and bare numbers", () => {
    const q = parse("the buyer with the and a 12345");
    expect(q.terms).not.toContain("the");
    expect(q.terms).not.toContain("12345");
  });

  it("caps the terms so one rambling sentence is not forty ILIKEs", () => {
    const q = parse("alpha bravo charlie delta echo foxtrot golf hotel india juliet");
    expect(q.terms.length).toBeLessThanOrEqual(6);
  });
});

describe("what it says it understood", () => {
  /**
   * The reading is shown above the results. A search that silently
   * reinterprets the question is one nobody trusts twice — and the loose
   * words belong in it, because watching a real screen the word doing
   * the most work was the one the reading did not mention.
   */
  it("names the structured parts and the loose words", () => {
    const r = parse("Emirati buying in Dubai Hills around 11 million").reading.join(" · ");
    expect(r).toContain("Dubai Hills");
    expect(r).toContain("AED");
    expect(r).toMatch(/words: .*emirati/);
  });
});

describe("isEmpty", () => {
  it("is true for a sentence with nothing to query", () => {
    expect(isEmpty(parse("   "))).toBe(true);
    expect(isEmpty(parse("the and a of"))).toBe(true);
  });

  it("is false as soon as one thing was understood", () => {
    expect(isEmpty(parse("Marina"))).toBe(false);
    expect(isEmpty(parse("under 3m"))).toBe(false);
    expect(isEmpty(parse("investors"))).toBe(false);
  });
});
