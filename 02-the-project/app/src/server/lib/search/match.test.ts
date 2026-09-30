import { describe, it, expect } from "vitest";
import { hasWord, compactRef, refVariants } from "./match";

describe("hasWord — a word, not a fragment of another one", () => {
  it("villa is not Village", () => {
    expect(hasWord("Jumeirah Village Circle", "villa")).toBe(false);
    expect(hasWord("5-bed villa, Emirates Hills", "villa")).toBe(true);
    expect(hasWord("Two villas on the Palm", "villa")).toBe(true);
  });
  it("allows the usual endings", () => {
    expect(hasWord("Relocating from Moscow", "relocate")).toBe(true);
    expect(hasWord("relocated last year", "relocate")).toBe(true);
    expect(hasWord("Stephen Clarke", "stephen")).toBe(true);
    expect(hasWord("Al-Suwaidi", "suwaidi")).toBe(true);
  });
  it("does not match inside a word", () => {
    expect(hasWord("Catherine", "cat")).toBe(false);
    expect(hasWord(null, "cat")).toBe(false);
  });
});

describe("references", () => {
  it("compacts every way of writing one", () => {
    for (const r of ["AR-508", "ar508", "AR 508"]) expect(compactRef(r)).toBe("ar508");
  });
  it("gives back the stored spellings to look for", () => {
    expect(refVariants("ar508")).toEqual(["ar-508", "ar508", "ar 508"]);
  });
});
