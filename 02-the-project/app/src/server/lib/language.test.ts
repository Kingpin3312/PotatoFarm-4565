import { describe, expect, it } from "vitest";
import { detectLanguage, languageName } from "./language";

describe("detectLanguage", () => {
  it("reads Arabic as Arabic", () => {
    expect(detectLanguage("مرحبا، أبحث عن شقة غرفتين في دبي هيلز للشراء")).toBe("ar");
  });
  it("keeps Arabic when a Latin building name is inside it", () => {
    expect(detectLanguage("هل الشقة في Marina Gate متاحة؟")).toBe("ar");
  });
  it("reads English as English, even with an Arabic greeting in Latin letters", () => {
    expect(detectLanguage("Salam, I'm looking for an off-plan 1 bed in JVC")).toBe("en");
  });
  it("reads English with a short Arabic greeting as English", () => {
    expect(detectLanguage("السلام عليكم — is the 2 bed in Dubai Marina still available for next month?")).toBe("en");
  });
  it("says nothing about a message with no letters", () => {
    expect(detectLanguage("2,500,000?")).toBeNull();
    expect(detectLanguage("👍")).toBeNull();
    expect(detectLanguage("")).toBeNull();
    expect(detectLanguage(null)).toBeNull();
  });
});

describe("languageName", () => {
  it("names the language for the prompt", () => {
    expect(languageName("ar")).toBe("Arabic");
    expect(languageName("en")).toBe("English");
    expect(languageName(undefined)).toBe("English");
  });
});
