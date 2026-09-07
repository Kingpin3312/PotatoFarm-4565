/**
 * Which languages the interface speaks, and how direction follows from
 * that.
 *
 * Nothing here imports anything. Like `components/layout/nav.ts`, this is
 * a leaf of the graph on purpose: the root layout, the middleware-free
 * server helper, the client provider and the audit script all need these
 * constants, and a constant whose home is a component or a provider is
 * the shape that produced "Cannot access 'NAV' before initialization"
 * once already.
 *
 * ## Why the interface is not translated by a library
 *
 * The obvious reach is `next-intl`, and the obvious shape it wants is a
 * locale segment in the URL — `/ar/today`. That is the right design for
 * a site that search engines read in both languages. This app is
 * `robots: { index: false }`, every screen is behind sign-in, and the
 * language is a property of *the agent*, not of the address they are
 * looking at. Putting it in the path would mean every internal link,
 * every redirect and every `router.push` in the codebase has to carry a
 * locale it does not care about, and two agents in the same brokerage
 * would swap links that silently change each other's language.
 *
 * So the preference lives on the person, and the URL is unchanged.
 */

/**
 * English first because it is the fallback, and Arabic second because
 * this is a UAE product where the assistant already speaks both —
 * `Lead.language` and `QualificationProfile.languages` have carried
 * `"ar"` since they were written. The interface is the half that never
 * caught up.
 */
export const LOCALES = ["en", "ar"] as const;

/**
 * The locales a brokerage may actually choose, which is not the same
 * list.
 *
 * **Arabic is built and not offered.** The machinery is complete — the
 * catalogue, the plural rules, `dir` on the root layout, the logical
 * CSS properties and the audit that fails the build on a physical one.
 * What is not complete is the *words*: 51 strings across 26 of 97
 * components, with the pipeline, today and compliance screens carrying
 * none at all. Product direction is that Arabic is not required, so
 * nobody is going to finish them.
 *
 * That combination is worse than either half alone. An unfinished
 * translation nobody can reach is dead weight; an unfinished
 * translation behind a live switch is a control that turns a working
 * product into a right-to-left shell around English text. So the switch
 * comes off the settings screen and the machinery stays.
 *
 * **To offer Arabic again, add it back to this array.** That is the
 * whole change — `LanguageChoice` renders itself from this list and
 * hides when there is only one entry. Finish the catalogue first:
 * `i18n.py` and the type checker between them will tell you what is
 * missing, because `MessageKey` is derived from `en.ts` and `ar.ts` is
 * checked against it.
 */
export const OFFERED_LOCALES: readonly Locale[] = ["en"];

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "en";

/**
 * Read on every request by the root layout, so it is a cookie rather
 * than a database column *for rendering purposes*.
 *
 * The durable preference is `User.locale`. This cookie is the cache in
 * front of it, and the reason it exists is that the root layout wraps
 * the public pages too — sign-in, the invite screen, the error page —
 * where there is no session to read a preference from. Resolving the
 * language from the database in the layout would put a query on the path
 * of every single request, including the ones with nobody signed in and
 * nothing to look up.
 *
 * The two are kept in step at the only two moments they can diverge:
 * the settings screen writes both, and sign-in refreshes the cookie from
 * the column. See `syncLocaleCookie` in `./server`.
 *
 * Not `httpOnly`: the client provider has the value already (it is
 * rendered into the tree), but the switcher needs to write it before the
 * server has seen the change, so it is script-readable by design. There
 * is nothing in it that is not already visible on screen.
 */
export const LOCALE_COOKIE = "pf_locale";

/** A year. The preference is not a session-scoped thing. */
export const LOCALE_COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/**
 * The `dir` attribute for a locale.
 *
 * This is the whole of the direction logic, and it is deliberately not a
 * per-component decision. `dir` is set once on `<html>`; everything
 * below it uses CSS logical properties and inherits. The failure mode
 * this avoids is a component that sets `dir="rtl"` on itself, which
 * flips its children's *layout* while leaving the document's
 * bidirectional base direction alone — text and layout then disagree,
 * and mixed Arabic/Latin strings (every phone number and AED figure in
 * this product) reorder in ways that look like corruption.
 */
export function dirOf(locale: Locale): "ltr" | "rtl" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function isRtl(locale: Locale): boolean {
  return dirOf(locale) === "rtl";
}

/**
 * The BCP 47 tag for `<html lang>`, which is not the same string as the
 * locale key.
 *
 * `en-GB` rather than `en` is load-bearing and predates this file: it is
 * what makes a screen reader say "twenty-second of March" and a browser
 * format a date as 22/03. `ar-AE` is the matching choice — Gulf Arabic
 * conventions, AED, and a Gregorian calendar, which is what a Dubai
 * brokerage runs on. `ar` alone would leave the calendar and the numeral
 * system to the browser's own guess, and some of them guess Hijri.
 */
export function bcp47(locale: Locale): string {
  return locale === "ar" ? "ar-AE" : "en-GB";
}

/**
 * The tag used for formatting numbers and dates — not the same as
 * `bcp47`, and the difference is one subtag that pins which digits a
 * Dubai agent reads.
 *
 * **Measured before this was written, because the first version of this
 * comment was wrong.** It claimed `Intl.NumberFormat("ar-AE")` returns
 * Eastern Arabic-Indic digits and that this subtag corrects it. On
 * Node 22 with full ICU it does not — the numbering system for `ar-AE`
 * is already `latn`:
 *
 *     ar        1,200,000    latn
 *     ar-AE     1,200,000    latn
 *     ar-EG     ١٬٢٠٠٬٠٠٠    arab
 *     ar-SA     ١٬٢٠٠٬٠٠٠    arab
 *
 * So this is a **guarantee, not a correction**. It is still worth
 * making, for two reasons. The default is CLDR's and CLDR changes; and
 * the two neighbours above show the setting is genuinely per-region, so
 * a future `ar-EG` or a runtime built with different ICU data would
 * flip it silently. Pinning it means the digits are a decision this
 * file makes rather than one it inherits.
 *
 * The decision itself: UAE property is priced, permitted and advertised
 * in Western digits — the portals publish them that way and the DLD
 * writes them that way — and every screen here mixes Arabic text with a
 * Latin-script figure (`+971 50 …`, `AED 1,200,000`, a listing
 * reference). Two figures that mean the same thing should not look
 * different because one came from a formatter and one from a database.
 *
 * The language, the plural rules, the grouping separators and the date
 * field order all still come from Arabic; only the numerals are fixed.
 * If a brokerage ever asks for Eastern digits, this is the one place
 * that changes.
 */
export function formattingLocale(locale: Locale): string {
  return locale === "ar" ? "ar-AE-u-nu-latn" : "en-GB";
}
