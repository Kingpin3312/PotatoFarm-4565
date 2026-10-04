import { describe, it, expect } from "vitest";
import { areaInfo, areaPicture, heroPicture, portraitPicture, propertyPicture } from "./imagery";
import { assembleView, type ViewParts } from "./assemble";
import { emptyContent } from "./content";

/**
 * Where every picture on a microsite may come from. The rules that matter
 * are the honest ones: a real agent never gets a stranger's face, a real
 * property never gets a stock photograph, and a figure is never shown
 * that the CRM or the agent's own profile does not hold.
 */
describe("pictures", () => {
  it("use the real photograph first", () => {
    expect(portraitPicture({ photo: "/p/x/agents/a/photo?v=1", demo: false, seed: "s", name: "Sara" })).toMatchObject({ kind: "photo", src: "/p/x/agents/a/photo?v=1" });
    expect(propertyPicture({ cover: "/p/x/MG-1/photos/1", title: "Flat", community: "Dubai Marina", propertyType: "APARTMENT", demo: true, seed: "MG-1" }))
      .toMatchObject({ kind: "photo", src: "/p/x/MG-1/photos/1" });
  });
  it("never give a real agent somebody else's face", () => {
    expect(portraitPicture({ photo: null, demo: false, seed: "s", name: "Sara" })).toBeNull();
  });
  it("label a property's stand-in as its area, never as the property", () => {
    const p = propertyPicture({ cover: null, title: "Two bed", community: "Dubai Marina", propertyType: "APARTMENT", demo: false, seed: "MG-1" });
    expect(p.label).toBe("Dubai Marina · area");
    expect(p.alt).toBe("");
  });
  it("draw a scene that suits the place when there is no photograph", () => {
    expect(areaInfo("Palm Jumeirah").scene).toBe("palm");
    expect(areaInfo("Arabian Ranches III").scene).toBe("villas");
    expect(areaInfo("Somewhere New").blurb).toBeNull();
    expect(areaPicture("Downtown Dubai")).toMatchObject({ kind: "art", scene: "spire", label: "Downtown Dubai" });
  });
  it("put the agent's own cover behind their name, else their first area", () => {
    expect(heroPicture({ cover: "/c", areas: ["Dubai Marina"], demo: false, seed: "s" })).toMatchObject({ kind: "photo", src: "/c" });
    expect(heroPicture({ cover: null, areas: ["Dubai Marina"], demo: false, seed: "s" })).toMatchObject({ kind: "art", scene: "marina" });
  });
});

const parts = (over: Partial<ViewParts> = {}): ViewParts => ({
  brokerage: { name: "Creekside", home: "/p/c" }, slug: "sara", pageUrl: "https://x/p/c/agents/sara", endpoints: null,
  allowedAccents: [], ownWhatsappAllowed: false, companyWhatsapp: null, areaNames: { a1: "Dubai Marina" },
  cards: {}, own: [], sold: [], deals: 0, photo: null, cover: null, ...over,
});

describe("the figures", () => {
  it("show only what is held", () => {
    const c = { ...emptyContent({ name: "Sara Ahmed", phone: null, email: null }), languages: ["English" as const] };
    expect(assembleView(c, parts()).stats).toEqual([]);
  });
  it("count deals only from the CRM, and only when the agent shows them", () => {
    const c = { ...emptyContent({ name: "Sara", phone: null, email: null }), yearsExperience: 8, areas: ["a1"], showDeals: true };
    const v = assembleView(c, parts({ deals: 3, dealValueFils: "1250000000" }));
    expect(v.stats.map((s) => `${s.value} ${s.label}`)).toEqual(["8 Years in property", "3 Transactions completed", "AED 12.5M Transacted", "1 Area covered"]);
    expect(assembleView({ ...c, showDeals: false }, parts({ deals: 3, dealValueFils: "1250000000" })).stats.some((s) => s.label === "Transacted")).toBe(false);
  });
  it("describe the areas with what is known and nothing invented", () => {
    const c = { ...emptyContent({ name: "Sara", phone: null, email: null }), areas: ["a1"] };
    expect(assembleView(c, parts()).areaTiles[0]).toMatchObject({ name: "Dubai Marina", blurb: "Waterfront towers around the marina promenade.", count: 0 });
  });
  it("take the search title and description the agent wrote", () => {
    const c = { ...emptyContent({ name: "Sara", phone: null, email: null }), seoTitle: "Sara — Marina homes", seoDescription: "Marina specialist." };
    expect(assembleView(c, parts()).seo).toEqual({ title: "Sara — Marina homes", description: "Marina specialist." });
    expect(assembleView({ ...c, seoTitle: null, seoDescription: null, headline: "Homes on the water." }, parts()).seo)
      .toEqual({ title: "Sara | Creekside", description: "Homes on the water." });
  });
});
