import { describe, it, expect } from "vitest";
import { confirmMessage, declineMessage, offerMessage, readPick, slotLabel } from "./pick";

/**
 * The times a buyer is offered, and which one they took.
 *
 * Wrong one way, a viewing is held on a guess and somebody turns up at
 * the wrong time. Wrong the other way, a clear "2" goes unnoticed and the
 * buyer waits. The first is worse, so anything unclear is not a pick.
 */
// Dubai is UTC+4: these are Tue 11:00, Wed 15:00 and Thu 10:30 local.
const slots = [
  new Date("2026-10-06T07:00:00Z"),
  new Date("2026-10-07T11:00:00Z"),
  new Date("2026-10-08T06:30:00Z"),
];

describe("the offer", () => {
  it("lists the real times, numbered, in Dubai time", () => {
    const m = offerMessage({ lang: "en", agentName: "Lena", listingTitle: "the Marina Gate flat", slots });
    expect(m).toContain("1. Tuesday 6 Oct");
    expect(m).toContain("11:00");
    expect(m).toContain("3. Thursday 8 Oct");
    expect(m).toContain("Lena will confirm");
  });
  it("is in Arabic for an Arabic speaker, with Western digits", () => {
    const m = offerMessage({ lang: "ar", agentName: "لينا", listingTitle: null, slots });
    expect(m).toContain("1. ");
    expect(m).toMatch(/11:00/);
    expect(m).toContain("سيؤكده لينا");
  });
  it("never invents an agent's name", () => {
    expect(offerMessage({ lang: "en", agentName: null, listingTitle: null, slots })).toContain("our agent will confirm");
  });
  it("labels a slot the way a person says it", () => {
    expect(slotLabel(slots[0]!, "en")).toMatch(/^Tuesday 6 Oct.*11:00/);
  });
});

describe("which time they picked", () => {
  it("reads a number, however it is written", () => {
    expect(readPick("2", slots)).toBe(1);
    expect(readPick("Option 3 please", slots)).toBe(2);
    expect(readPick("#1", slots)).toBe(0);
    expect(readPick("٢", slots)).toBe(1);
  });
  it("reads an ordinal", () => {
    expect(readPick("The first one works", slots)).toBe(0);
    expect(readPick("الثانية", slots)).toBe(1);
  });
  it("reads a day or a time that names exactly one slot", () => {
    expect(readPick("Wednesday is good", slots)).toBe(1);
    expect(readPick("3pm works", slots)).toBe(1);
    expect(readPick("Thu 10:30", slots)).toBe(2);
    expect(readPick("11am Tuesday", slots)).toBe(0);
  });
  it("does not guess", () => {
    expect(readPick("4", slots)).toBeNull();
    expect(readPick("Any of them", slots)).toBeNull();
    expect(readPick("None of those work, sorry", slots)).toBeNull();
    expect(readPick("Can't do 11", slots)).toBeNull();
    expect(readPick("Friday?", slots)).toBeNull();
    expect(readPick("The first or second", slots)).toBeNull();
    expect(readPick("Is parking included?", slots)).toBeNull();
    expect(readPick("2", [])).toBeNull();
  });
  it("does not take a budget or a bedroom count for a pick", () => {
    expect(readPick("I need 2 bedrooms", slots)).toBeNull();
    expect(readPick("budget 2.5 million", slots)).toBeNull();
    // Even when one of the slots is at 2pm.
    const twoPm = [new Date("2026-10-06T10:00:00Z")];
    expect(readPick("I need 2 bedrooms", twoPm)).toBeNull();
    expect(readPick("2pm", twoPm)).toBe(0);
    expect(readPick("at 2", twoPm)).toBe(0);
  });
});

describe("what the buyer hears from the agent's tap", () => {
  it("confirms the time, the place and who, in their language", () => {
    const en = confirmMessage({ lang: "en", at: slots[0]!, listingTitle: "Marina Gate 2 bed", agentName: "Lena" });
    expect(en).toMatch(/^Confirmed: Tuesday 6 Oct.*11:00.*Marina Gate 2 bed\. Lena will meet you there/);
    expect(confirmMessage({ lang: "ar", at: slots[0]!, listingTitle: null, agentName: null })).toMatch(/^تم التأكيد/);
  });
  it("declines without inventing a name", () => {
    expect(declineMessage({ lang: "en", at: slots[0]!, agentName: null })).toContain("we can't make");
    expect(declineMessage({ lang: "en", at: slots[0]!, agentName: "Lena" })).toContain("Lena can't make");
  });
});
