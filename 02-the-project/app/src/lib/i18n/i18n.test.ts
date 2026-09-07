import { describe, expect, it } from "vitest";
import { ar } from "./ar";
import { en } from "./en";
import { formatNumber, interpolate, plural, translate } from "./index";
import { bcp47, dirOf, formattingLocale, isLocale, isRtl } from "./locale";
import { localeFromAcceptLanguage } from "./server";

/**
 * The interface's Arabic support, at the points where being wrong is
 * silent.
 *
 * Every case here is a decision that would look fine in English and be
 * wrong in Arabic — which is the whole difficulty of this feature. An
 * English-speaking reviewer reading these screens sees nothing.
 */

describe("direction", () => {
  it("follows the locale, and English is not right-to-left", () => {
    expect(dirOf("ar")).toBe("rtl");
    expect(dirOf("en")).toBe("ltr");
    expect(isRtl("ar")).toBe(true);
    expect(isRtl("en")).toBe(false);
  });

  it("tags the document as Gulf Arabic, not bare `ar`", () => {
    // `ar` alone leaves the calendar to the browser, and some of them
    // choose Hijri. A Dubai brokerage runs on Gregorian.
    expect(bcp47("ar")).toBe("ar-AE");
    expect(bcp47("en")).toBe("en-GB");
  });
});

describe("numerals", () => {
  it("gives Arabic Western digits", () => {
    expect(formattingLocale("ar")).toBe("ar-AE-u-nu-latn");
    const formatted = formatNumber("ar", 1_200_000);
    expect(formatted).toMatch(/[0-9]/);
    // No Eastern Arabic-Indic digits anywhere in the output.
    expect(formatted).not.toMatch(/[٠-٩]/);
  });

  /**
   * The assertion above is close to vacuous on its own, and this is the
   * proof of how close.
   *
   * `ar-AE` **already** resolves to `latn` on Node 22 — the first draft
   * of this file asserted the opposite and failed, which is the only
   * reason anybody checked. So the guard is not fixing a live bug; it
   * is pinning a default that CLDR chooses and could change.
   *
   * What makes it worth keeping is that the choice is genuinely
   * per-region: two Arabic locales one subtag apart disagree. This test
   * pins that fact, so if the regex above ever starts passing for the
   * wrong reason — an ICU build with no Arabic data, say, where
   * everything is Latin — this goes red and says so.
   */
  it("shows the numbering system really does vary by region", () => {
    expect(new Intl.NumberFormat("ar-AE").resolvedOptions().numberingSystem).toBe("latn");
    expect(new Intl.NumberFormat("ar-EG").resolvedOptions().numberingSystem).toBe("arab");
    expect(new Intl.NumberFormat("ar-EG").format(1_200_000)).toMatch(/[٠-٩]/);
  });

  it("pins the digits against a locale that would not", () => {
    // The same number through the unpinned Egyptian tag and through
    // ours: different scripts, so `-u-nu-latn` is doing something.
    expect(new Intl.NumberFormat("ar-EG-u-nu-latn").format(42)).toBe("42");
    expect(new Intl.NumberFormat("ar-EG").format(42)).not.toBe("42");
  });
});

describe("plurals", () => {
  it("uses all six Arabic categories, not one and other", () => {
    // 0, 1, 2, 3 and 11 are five distinct grammatical forms in Arabic
    // and two in English. A catalogue with `one`/`other` renders four of
    // them wrong.
    const forms = [0, 1, 2, 3, 11].map((n) => plural("ar", "palette.resultCount", n));
    expect(new Set(forms).size).toBe(5);
  });

  it("says 'no results' for zero rather than '0 results'", () => {
    expect(plural("ar", "palette.resultCount", 0)).toBe("لا نتائج");
    expect(plural("ar", "palette.resultCount", 0)).not.toMatch(/[0-9]/);
  });

  it("distinguishes 3 from 13, which English does not", () => {
    // few (3–10) vs many (11–99). Getting this wrong is the difference
    // between "١٣ نتيجة" and "١٣ نتائج".
    expect(plural("ar", "palette.resultCount", 3)).not.toBe(
      plural("ar", "palette.resultCount", 13).replace("13", "3"),
    );
  });

  it("still reads correctly in English", () => {
    expect(plural("en", "palette.resultCount", 1)).toBe("1 result");
    expect(plural("en", "palette.resultCount", 4)).toBe("4 results");
    expect(plural("en", "palette.resultCount", 0)).toBe("0 results");
  });
});

describe("the catalogues", () => {
  it("translates every key", () => {
    // `tsc` enforces this too. Kept because the type is one `as any`
    // away from silence, and because a missing key renders the key.
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      expect(ar[key], `ar is missing ${key}`).toBeTruthy();
    }
  });

  it("leaves nothing in English except the language names", () => {
    const endonyms = new Set(["settings.language.en", "settings.language.ar"]);
    for (const key of Object.keys(en) as (keyof typeof en)[]) {
      if (endonyms.has(key)) continue;
      expect(ar[key], `${key} is still English`).not.toBe(en[key]);
    }
  });

  it("renders the key, not a blank, when a lookup fails", () => {
    // Loud over tidy. A blank string looks like a design decision and
    // survives review; `nav.today` on screen does not.
    // @ts-expect-error deliberately asking for a key that does not exist
    expect(translate(en, "nav.nonexistent")).toBe("nav.nonexistent");
  });
});

describe("interpolation", () => {
  it("substitutes named placeholders", () => {
    expect(interpolate("{n} results", { n: 4 })).toBe("4 results");
  });

  it("leaves an unknown placeholder visible rather than blank", () => {
    expect(interpolate("{n} of {total}", { n: 1 })).toBe("1 of {total}");
  });
});

describe("Accept-Language", () => {
  it("reads quality values rather than written order", () => {
    // A phone set to Arabic with an English keyboard sends exactly this,
    // and reading left to right gets it backwards.
    expect(localeFromAcceptLanguage("en;q=0.9, ar;q=1.0")).toBe("ar");
    expect(localeFromAcceptLanguage("ar;q=0.5, en;q=0.8")).toBe("en");
  });

  it("matches a region-tagged Arabic", () => {
    expect(localeFromAcceptLanguage("ar-AE,ar;q=0.9,en;q=0.8")).toBe("ar");
    expect(localeFromAcceptLanguage("AR_ae")).toBe("ar");
  });

  it("treats q=0 as a refusal, not a preference", () => {
    expect(localeFromAcceptLanguage("ar;q=0, en;q=0.5")).toBe("en");
  });

  it("falls back to English on nothing, junk, or an unknown language", () => {
    expect(localeFromAcceptLanguage(null)).toBe("en");
    expect(localeFromAcceptLanguage("")).toBe("en");
    expect(localeFromAcceptLanguage("fr-FR,de;q=0.8")).toBe("en");
    expect(localeFromAcceptLanguage(";;;")).toBe("en");
  });
});

describe("isLocale", () => {
  it("accepts only the languages that exist", () => {
    expect(isLocale("ar")).toBe(true);
    expect(isLocale("en")).toBe(true);
    // A stale or hand-edited cookie must not select a catalogue that is
    // not there — `getMessages` would return undefined and every string
    // on every screen would render as its key.
    expect(isLocale("ar-AE")).toBe(false);
    expect(isLocale("fr")).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});
