import { describe, it, expect } from "vitest";
import { mentionedPortal, referenceCandidates } from "./mention";

/**
 * A buyer who pressed WhatsApp on a portal advert, read off the message.
 *
 * Wrong in one direction, a portal is credited with a lead it did not
 * send and routing rules fire on a guess. Wrong in the other, the lead
 * stays "WhatsApp" and the brokerage under-counts the portal it pays.
 */
describe("which portal a message names", () => {
  it("reads the portals' names and addresses", () => {
    expect(mentionedPortal("Hi, I saw your property on Bayut, ref MG-202")).toBe("BAYUT");
    expect(mentionedPortal("found this on bayut.com")).toBe("BAYUT");
    expect(mentionedPortal("Hello, saw it on dubizzle")).toBe("DUBIZZLE");
    expect(mentionedPortal("From PropertyFinder: is it available?")).toBe("PROPERTY_FINDER");
    expect(mentionedPortal("https://www.propertyfinder.ae/en/plp/buy/apartment-123.html")).toBe("PROPERTY_FINDER");
    expect(mentionedPortal("شفت الإعلان على دوبيزل")).toBe("DUBIZZLE");
  });

  it("takes the first portal named when there are two", () => {
    expect(mentionedPortal("Saw it on Dubizzle, also on Bayut")).toBe("DUBIZZLE");
  });

  it("does not read Bayut's Arabic name, which means houses", () => {
    expect(mentionedPortal("أبحث عن بيوت في جميرا")).toBeNull();
  });

  it("does not find a portal inside another word", () => {
    expect(mentionedPortal("the bayutopia tower")).toBeNull();
    expect(mentionedPortal("Is this available?")).toBeNull();
    expect(mentionedPortal(null)).toBeNull();
  });
});

describe("the references a message may be quoting", () => {
  it("puts the one after 'ref' first, compacted the way search compacts", () => {
    expect(referenceCandidates("Unit 12, ref: MG-202 please")[0]).toBe("mg202");
    expect(referenceCandidates("Reference no. AR 508")[0]).toBe("ar508");
    expect(referenceCandidates("رقم المرجع DH-101")[0]).toBe("dh101");
  });

  it("offers other reference-shaped words as candidates too", () => {
    expect(referenceCandidates("Is TH-514 still available?")).toContain("th514");
  });

  it("ignores the portal's own ids in links", () => {
    expect(referenceCandidates("https://www.bayut.com/property/details-9876543.html")).toEqual([]);
  });

  it("does not offer plain numbers or words", () => {
    expect(referenceCandidates("2 bed, budget 180000, call me")).toEqual([]);
  });
});
