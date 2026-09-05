import { describe, expect, it } from "vitest";
import { sentence } from "./sentence";

/**
 * The formatter that decides how a database enum reads on screen.
 *
 * Worth testing because both of its failure directions are silent. Too
 * eager and a brand name is mangled — the leads list rendered
 * "Whatsapp ad" for a generation in a product that is WhatsApp-first,
 * and nobody reading the source would see it because the source says
 * `sentence(l.source)`. Too timid and the raw enum reaches the screen
 * shouting, which is the bug this function was written for.
 */
describe("sentence", () => {
  it("turns an enum into a sentence, not title case", () => {
    expect(sentence("CONFIRMED_MATCH")).toBe("Confirmed match");
    expect(sentence("REFERRAL")).toBe("Referral");
    expect(sentence("VIEWING_BOOKED")).toBe("Viewing booked");
  });

  it("spells names the way the rest of the product spells them", () => {
    expect(sentence("WHATSAPP_AD")).toBe("WhatsApp ad");
    expect(sentence("PROPERTY_FINDER")).toBe("Property Finder");
  });

  it("leaves nothing shouting", () => {
    // The whole point: no output is a bare all-caps token.
    for (const v of ["REFERRAL", "UNKNOWN", "WALK_IN", "META_LEAD_ADS",
                     "BAYUT", "DUBIZZLE", "WEBSITE", "WHATSAPP_AD",
                     "PROPERTY_FINDER"]) {
      expect(sentence(v)).not.toMatch(/^[A-Z][A-Z0-9_]{2,}$/);
      expect(sentence(v)).not.toContain("_");
    }
  });

  it("is safe on the empty cases the callers actually pass", () => {
    // Every call site reads a nullable column.
    expect(sentence(null)).toBe("");
    expect(sentence(undefined)).toBe("");
    expect(sentence("")).toBe("");
  });

  it("matches a name however the caller spaced or cased it", () => {
    expect(sentence("whatsapp_ad")).toBe("WhatsApp ad");
    expect(sentence("WhatsApp Ad")).toBe("WhatsApp ad");
  });
});
