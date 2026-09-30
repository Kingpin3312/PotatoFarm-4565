import { describe, expect, it } from "vitest";
import { nextDealReference } from "./reference";

describe("nextDealReference", () => {
  it("is the listing's reference for its first deal", () => {
    expect(nextDealReference("MG-202", [])).toBe("MG-202");
  });

  it("adds a suffix when the property has had a deal before", () => {
    expect(nextDealReference("MG-202", ["MG-202"])).toBe("MG-202-2");
    expect(nextDealReference("MG-202", ["MG-202", "MG-202-2"])).toBe("MG-202-3");
  });

  it("fills the first free suffix rather than counting deals", () => {
    // A counted suffix collides as soon as one in the middle is missing.
    expect(nextDealReference("MG-202", ["MG-202", "MG-202-3"])).toBe("MG-202-2");
  });

  it("is not confused by another property whose reference starts the same", () => {
    expect(nextDealReference("MG-20", ["MG-202", "MG-202-2"])).toBe("MG-20");
  });
});
