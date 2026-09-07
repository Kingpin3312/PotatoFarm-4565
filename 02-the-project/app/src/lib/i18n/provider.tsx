"use client";

import { createContext, useContext, useMemo } from "react";
import {
  formatNumber,
  getMessages,
  plural,
  translate,
  type PluralKey,
  type Translator,
} from "./index";
import { DEFAULT_LOCALE, dirOf, isRtl, type Locale } from "./locale";

/**
 * How a client component reaches the catalogue.
 *
 * Almost every screen in this app is `"use client"` — they fetch through
 * tRPC hooks — so the server-only `getMessages(locale)` route reaches
 * about four files. This is the one that matters.
 *
 * ## Why the catalogue is not shipped as a prop through the tree
 *
 * It was going to be, and threading `messages` through `Shell` into
 * `MobileTabs` into `CommandPalette` is already three levels before any
 * screen is reached. A context read at the leaf is the same data with
 * none of the prop plumbing, and — the part that actually decides it —
 * the palette is mounted by the shell but opened by a window event from
 * the header, so there is no single parent that owns both ends.
 *
 * ## What it costs
 *
 * The whole catalogue crosses to the client, because the provider is
 * rendered on the server with `messages` as a serialisable prop. At the
 * current size that is a few kilobytes before compression, against a
 * bundle that already carries tRPC and React Query. If it ever stops
 * being negligible the split is per-route, not per-key — but measure it
 * before doing that, because a lazily-loaded catalogue means a screen
 * can render before its words arrive, and a flash of English is worse
 * than the kilobytes.
 */
type I18nValue = {
  locale: Locale;
  t: Translator;
  /** A counted string in the right grammatical form. See `plural`. */
  count: (key: PluralKey, n: number) => string;
  /** A bare number, in the locale's digits and grouping. */
  num: (n: number) => string;
  dir: "ltr" | "rtl";
  rtl: boolean;
};

/**
 * The default is a working English translator, not `null`.
 *
 * A `null` default forces every consumer to handle a case that only
 * happens if somebody forgets the provider, and the usual handling is
 * `?? key`, which renders `nav.today` on screen for a mistake the
 * developer would rather see as a loud crash in one place. This way an
 * unwrapped tree renders English — and `useI18n` is still where you
 * would add a development-time warning if that ever bites.
 */
const I18nContext = createContext<I18nValue>({
  locale: DEFAULT_LOCALE,
  t: (key, vars) => translate(getMessages(DEFAULT_LOCALE), key, vars),
  count: (key, n) => plural(DEFAULT_LOCALE, key, n),
  num: (n) => formatNumber(DEFAULT_LOCALE, n),
  dir: dirOf(DEFAULT_LOCALE),
  rtl: isRtl(DEFAULT_LOCALE),
});

export function I18nProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: React.ReactNode;
}) {
  /**
   * Keyed on `locale` alone, so the translator is stable between
   * renders. The palette filters its whole destination list through `t`
   * on every keystroke; a new function identity per render would rebuild
   * that list each time and defeat the `useMemo` that wraps it.
   */
  const value = useMemo<I18nValue>(() => {
    const messages = getMessages(locale);
    return {
      locale,
      t: (key, vars) => translate(messages, key, vars),
      count: (key, n) => plural(locale, key, n),
      num: (n) => formatNumber(locale, n),
      dir: dirOf(locale),
      rtl: isRtl(locale),
    };
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext);
}

/** The common case, short enough to use inline: `const t = useT()`. */
export function useT(): Translator {
  return useContext(I18nContext).t;
}

export function useLocale(): Locale {
  return useContext(I18nContext).locale;
}
