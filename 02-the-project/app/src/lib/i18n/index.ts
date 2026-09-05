import { en, enPlurals, type MessageKey, type Messages, type PluralKey, type Plurals } from "./en";
import { ar, arPlurals } from "./ar";
import { DEFAULT_LOCALE, formattingLocale, type Locale } from "./locale";

export {
  en,
  enPlurals,
  type MessageKey,
  type Messages,
  type PluralCategory,
  type PluralForms,
  type PluralKey,
  type Plurals,
} from "./en";
export { ar, arPlurals } from "./ar";
export * from "./locale";

const CATALOGUES: Record<Locale, Messages> = { en, ar };
const PLURALS: Record<Locale, Plurals> = { en: enPlurals, ar: arPlurals };

export function getMessages(locale: Locale): Messages {
  return CATALOGUES[locale] ?? CATALOGUES[DEFAULT_LOCALE];
}

export function getPlurals(locale: Locale): Plurals {
  return PLURALS[locale] ?? PLURALS[DEFAULT_LOCALE];
}

/**
 * Format a number the way the current language writes numbers.
 *
 * Goes through `formattingLocale`, not `bcp47`, so Arabic gets Western
 * digits with Arabic grouping. See the note on that function — it is a
 * product decision, not a technical one.
 */
export function formatNumber(locale: Locale, n: number): string {
  return new Intl.NumberFormat(formattingLocale(locale)).format(n);
}

/**
 * A counted string, in the right grammatical form.
 *
 * `Intl.PluralRules` picks the category and the catalogue supplies the
 * wording. The fallback to `other` exists because a category a language
 * does not use is legitimately absent — English has no `two` — and it
 * is the only branch here that can be silently wrong, which is why
 * `04-audit-scripts/i18n.py` asserts Arabic supplies all six rather than
 * letting them fall through.
 */
export function plural(locale: Locale, key: PluralKey, n: number): string {
  const forms = getPlurals(locale)[key];
  const category = new Intl.PluralRules(formattingLocale(locale)).select(n);
  return interpolate(forms[category] ?? forms.other, { n: formatNumber(locale, n) });
}

/**
 * Substitute `{name}` placeholders.
 *
 * Deliberately the smallest thing that works, and deliberately *not* a
 * plural engine.
 *
 * **Arabic plurals are not a switch on `n === 1`.** The language has six
 * categories — zero, one, two, few, many, other — where English has two,
 * and "3 viewings" and "11 viewings" take different noun forms. Writing
 * `${n} ${n === 1 ? "viewing" : "viewings"}` and translating the two
 * halves produces Arabic that is wrong more often than it is right.
 *
 * Nothing in the current catalogue is a count, so nothing here handles
 * one. When the first counted string arrives it goes through
 * `Intl.PluralRules(bcp47(locale))` with all six keys in the catalogue,
 * and the audit script should refuse a counted key that does not have
 * them. That is a Stage 2 problem, written down here so it is a decision
 * rather than an omission somebody discovers in Arabic.
 */
export function interpolate(
  template: string,
  vars?: Record<string, string | number>,
): string {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (whole, name: string) =>
    name in vars ? String(vars[name]) : whole,
  );
}

/**
 * Look a key up in a catalogue.
 *
 * The fallback chain is Arabic → English → the key itself, and the last
 * step is the one worth explaining. Returning the key renders
 * `nav.today` on screen: ugly, obviously broken, and impossible to
 * mistake for finished work. Returning an empty string would render a
 * blank space, which looks like a design choice and survives review —
 * the same silent-failure shape this codebase has been bitten by ten
 * times. `tsc` should make this branch unreachable; it exists for the
 * case where it is not.
 */
export function translate(
  messages: Messages,
  key: MessageKey,
  vars?: Record<string, string | number>,
): string {
  const template = messages[key] ?? en[key] ?? key;
  return interpolate(template, vars);
}

export type Translator = (
  key: MessageKey,
  vars?: Record<string, string | number>,
) => string;

export function translatorFor(locale: Locale): Translator {
  const messages = getMessages(locale);
  return (key, vars) => translate(messages, key, vars);
}
