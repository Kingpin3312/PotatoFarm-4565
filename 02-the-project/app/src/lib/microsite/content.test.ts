import { describe, it, expect } from "vitest";
import {
  checkContent, completeness, emptyContent, micrositeInText, parseBio, readContent, readSocial,
  slugify, slugProblem, whatsappText, type EditableContent,
} from "./content";
import { ACCENTS, ACCENT_KEYS, MONOGRAM_INK, accentFor, allowedAccents, contrast } from "./palette";

const base = (): EditableContent => {
  const { photo: _p, cover: _c, ...rest } = emptyContent({ name: "Sara Ahmed", phone: "050 123 4567", email: "sara@example.com" });
  return rest;
};

describe("what an agent writes", () => {
  it("starts from what the CRM knows", () => {
    const c = emptyContent({ name: "Sara Ahmed", phone: "050 123 4567", email: "sara@example.com" });
    expect(c.name).toBe("Sara Ahmed");
    expect(c.phone).toBe("+971501234567");
    expect(c.whatsapp).toBe("COMPANY");
  });
  it("normalises a phone and refuses a bad one", () => {
    expect(checkContent({ ...base(), phone: "04 555 1234" })).toMatchObject({ ok: true, content: { phone: "+97145551234" } });
    expect(checkContent({ ...base(), phone: "12" })).toMatchObject({ ok: false, field: "phone" });
  });
  it("needs a number when WhatsApp goes to the agent's own phone", () => {
    expect(checkContent({ ...base(), whatsapp: "OWN", whatsappNumber: null })).toMatchObject({ ok: false, field: "whatsappNumber" });
    expect(checkContent({ ...base(), whatsapp: "OWN", whatsappNumber: "0559876543" })).toMatchObject({ ok: true, content: { whatsappNumber: "+971559876543" } });
    expect(checkContent({ ...base(), whatsapp: "COMPANY", whatsappNumber: "0559876543" })).toMatchObject({ ok: true, content: { whatsappNumber: null } });
  });
  it("needs a name", () => {
    expect(checkContent({ ...base(), name: "  " })).toMatchObject({ ok: false, field: "name" });
  });
  it("refuses links in the text", () => {
    expect(checkContent({ ...base(), bio: "See www.example.com" })).toMatchObject({ ok: false, field: "bio" });
  });
  it("refuses an over-long headline in words an agent can act on", () => {
    const r = checkContent({ ...base(), headline: "x".repeat(200) });
    expect(r).toMatchObject({ ok: false, field: "headline", problem: "The headline is too long." });
  });
  it("refuses a language or specialism not on the list", () => {
    expect(checkContent({ ...base(), languages: ["Klingon" as never] }).ok).toBe(false);
    expect(checkContent({ ...base(), specialisms: ["Crypto" as never] }).ok).toBe(false);
  });
  it("reads stored content defensively, field by field", () => {
    const fallback = emptyContent({ name: "Sara", phone: null, email: null });
    const c = readContent({ headline: "Marina specialist", accent: "neon", languages: "English" }, fallback);
    expect(c.headline).toBe("Marina specialist");
    expect(c.accent).toBe("brand");
    expect(c.languages).toEqual(["English"]);
  });
});

describe("social links", () => {
  it("are made whole and must point at their network", () => {
    expect(readSocial("instagram", "instagram.com/sara.dxb")).toEqual({ ok: true, url: "https://instagram.com/sara.dxb" });
    expect(readSocial("linkedin", "https://www.linkedin.com/in/sara")).toMatchObject({ ok: true });
    expect(readSocial("instagram", "https://evil.example/instagram.com")).toMatchObject({ ok: false });
    expect(readSocial("instagram", "https://instagram.com.evil.example/x")).toMatchObject({ ok: false });
    expect(readSocial("x", "https://user:pw@x.com/sara")).toMatchObject({ ok: false });
    expect(readSocial("youtube", "https://youtube.com/")).toMatchObject({ ok: false });
  });
  it("are checked on save", () => {
    const r = checkContent({ ...base(), social: { ...base().social, tiktok: "https://bit.ly/abc" } });
    expect(r).toMatchObject({ ok: false, field: "social.tiktok" });
  });
});

describe("the address", () => {
  it("comes from the name", () => {
    expect(slugify("Sára  Ahmed-Khan ")).toBe("sara-ahmed-khan");
    expect(slugify("محمد")).toBe("agent");
  });
  it("has rules", () => {
    expect(slugProblem("sara-ahmed")).toBeNull();
    expect(slugProblem("Sara")).not.toBeNull();
    expect(slugProblem("a--b")).not.toBeNull();
    expect(slugProblem("agents")).not.toBeNull();
  });
  it("is found in a WhatsApp message, path only", () => {
    expect(micrositeInText("Hi Sara, I found your page\nhttps://app.potatofarm.io/p/seed-marina/agents/sara-ahmed"))
      .toEqual({ orgSlug: "seed-marina", agentSlug: "sara-ahmed" });
    expect(micrositeInText("looking at /p/seed-marina/agents/sara-ahmed.")).toEqual({ orgSlug: "seed-marina", agentSlug: "sara-ahmed" });
    expect(micrositeInText("Is the 2 bed still available?")).toBeNull();
  });
  it("is what the button writes", () => {
    const t = whatsappText({ firstName: "Sara", pageUrl: "https://x.test/p/o/agents/sara", property: { title: "Marina Gate 2 bed", reference: "MG-202" } });
    expect(t).toBe("Hi Sara, I found your page and I'm interested in Marina Gate 2 bed (MG-202).\nhttps://x.test/p/o/agents/sara");
    expect(micrositeInText(t)).toEqual({ orgSlug: "o", agentSlug: "sara" });
  });
});

describe("the biography", () => {
  it("is headings, paragraphs, lists and bold — never markup", () => {
    const b = parseBio("## About me\nTen years in **Dubai Marina**.\nStill here.\n\n- Resale\n- Off-plan\n\n<script>alert(1)</script>");
    expect(b[0]).toEqual({ kind: "heading", text: "About me" });
    expect(b[1]).toEqual({ kind: "para", parts: [{ text: "Ten years in ", bold: false }, { text: "Dubai Marina", bold: true }, { text: ". Still here.", bold: false }] });
    expect(b[2]).toEqual({ kind: "list", items: [[{ text: "Resale", bold: false }], [{ text: "Off-plan", bold: false }]] });
    expect(b[3]).toEqual({ kind: "para", parts: [{ text: "<script>alert(1)</script>", bold: false }] });
  });
});

describe("completeness", () => {
  it("counts what a good page has", () => {
    const c = emptyContent({ name: "Sara", phone: "0501234567", email: null });
    expect(completeness(c, { featuredShown: 0 }).percent).toBe(14);
    const full = { ...c, photo: "k", headline: "Dubai Marina's resale specialist", bio: "x".repeat(250), areas: ["a"], social: { ...c.social, instagram: "https://instagram.com/s" } };
    expect(completeness(full, { featuredShown: 2 }).percent).toBe(100);
  });
});

describe("accent colours", () => {
  it("read on the page's grey and carry dark initials", () => {
    for (const k of ACCENT_KEYS) {
      expect(contrast(ACCENTS[k].hex, "#292C32"), k).toBeGreaterThanOrEqual(3);
      expect(contrast(ACCENTS[k].hex, MONOGRAM_INK), k).toBeGreaterThanOrEqual(4.5);
    }
  });
  it("are limited to what the brokerage allows", () => {
    expect(allowedAccents([])).toEqual(ACCENT_KEYS);
    expect(allowedAccents(["pearl", "neon"])).toEqual(["pearl"]);
    expect(accentFor("silver", ["pearl"])).toBe(ACCENTS.pearl.hex);
    expect(accentFor("silver", ["silver", "brand"])).toBe(ACCENTS.silver.hex);
  });
});
