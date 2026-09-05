import { cookies, headers } from "next/headers";
import { DEFAULT_LOCALE, isLocale, LOCALE_COOKIE, type Locale } from "./locale";

/**
 * Which language this request renders in.
 *
 * Called once, by the root layout, and the result is handed to
 * `<html lang dir>` and to the client provider. Nothing else should call
 * it — a second caller is a second answer, and a document whose `dir`
 * disagrees with the components inside it is the worst version of this
 * bug because it looks like a CSS problem.
 *
 * ## The order, and why the cookie wins
 *
 * 1. **The cookie.** Set by the language switcher and refreshed from
 *    `User.locale` at sign-in.
 * 2. **`Accept-Language`.** Only reached on a first visit, before any
 *    preference exists. An agent whose phone is in Arabic gets an Arabic
 *    sign-in screen without having asked.
 * 3. **English.**
 *
 * `User.locale` is deliberately *not* in this list, even though it is
 * the durable preference. Reading it means a database query in the root
 * layout on every request — including the public pages, where there is
 * no session and nothing to look up. See the note on `LOCALE_COOKIE`.
 */
export async function resolveLocale(): Promise<Locale> {
  const jar = await cookies();
  const fromCookie = jar.get(LOCALE_COOKIE)?.value;
  if (isLocale(fromCookie)) return fromCookie;

  const accept = (await headers()).get("accept-language");
  return localeFromAcceptLanguage(accept);
}

/**
 * The smallest correct read of an `Accept-Language` header.
 *
 * Not a full RFC 9110 parser, and it does not need to be: there are two
 * languages, so the only question is whether Arabic is preferred over
 * English. Quality values are honoured because `en;q=0.9, ar;q=1.0`
 * genuinely happens on a phone set to Arabic with an English keyboard,
 * and reading the header in written order would get that backwards.
 *
 * Exported for the unit test — a header parser with no test is a coin
 * toss, and this one decides which language a brokerage's first
 * impression is in.
 */
export function localeFromAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return DEFAULT_LOCALE;

  const ranked = header
    .split(",")
    .map((part) => {
      // `?? ""` because `noUncheckedIndexedAccess` is on: splitting can
      // yield nothing for a stray comma, and an empty tag falls through
      // to the default rather than throwing on a malformed header.
      const [tag = "", ...params] = part.trim().split(";");
      const q = params
        .map((p) => p.trim())
        .find((p) => p.startsWith("q="));
      const weight = q ? Number.parseFloat(q.slice(2)) : 1;
      return {
        // `ar-AE`, `ar_AE` and `AR` all mean Arabic here.
        base: tag.trim().toLowerCase().replace(/_/g, "-").split("-")[0],
        // A malformed q is not a reason to lose the entry; it is a
        // reason to rank it last.
        weight: Number.isFinite(weight) ? weight : 0,
      };
    })
    // `q=0` means "explicitly not this one", which is not the same as
    // absent and must not be treated as a preference.
    .filter((entry) => entry.weight > 0)
    .sort((a, b) => b.weight - a.weight);

  for (const entry of ranked) {
    if (entry.base === "ar") return "ar";
    if (entry.base === "en") return "en";
  }
  return DEFAULT_LOCALE;
}
