"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n/provider";
import {
  LOCALE_COOKIE,
  LOCALE_COOKIE_MAX_AGE,
  LOCALES,
  type Locale,
} from "@/lib/i18n/locale";

const LABEL_KEY = {
  en: "settings.language.en",
  ar: "settings.language.ar",
} as const;

/**
 * Choosing the interface language.
 *
 * ## Why this writes a cookie and not a database column
 *
 * The obvious design is `User.locale`, and it was written and then taken
 * out again. The column is easy; **reading it is not**, and a column
 * nothing reads is the exact shape this codebase has now found ten
 * times — eleven routers that were never mounted, a rate-limit rule
 * nothing invoked, an alerting system that ended in `log.warn`.
 *
 * The reason it is hard to read: `dir` and `lang` have to be decided in
 * the root layout, before any markup is produced, and that layout also
 * renders the signed-out pages. Resolving from the database there means
 * a query on every request including the ones with nobody signed in.
 * The place that *can* both read a session and write a cookie is
 * middleware, and that is a larger change than a language switcher
 * should drag behind it.
 *
 * So the preference is per browser. That is a real limitation and worth
 * stating plainly: an agent who signs in on a new laptop gets English
 * and has to choose again. It is not an unreasonable model on its own —
 * a shared desk machine in a brokerage and a personal phone can
 * legitimately want different interface languages — but it is a
 * compromise, not the design. Syncing it to the user record is Stage 2,
 * and it needs middleware.
 *
 * ## Why `router.refresh()` rather than setting `dir` on the client
 *
 * Flipping `document.documentElement.dir` here would turn the layout
 * around immediately and leave the server's idea of the language stale,
 * so the next server-rendered navigation would flip it back. `refresh()`
 * re-runs the root layout, which reads the cookie that was just written
 * — one source of truth, and the attribute and the words always agree.
 */
export function LanguageChoice() {
  const { t, locale } = useI18n();
  const router = useRouter();
  const [saved, setSaved] = useState(false);

  function choose(next: Locale) {
    if (next === locale) return;
    // `SameSite=Lax` so it survives a normal navigation; not `Secure`,
    // because development is served over http and a cookie that never
    // sets there is a preference that silently does nothing.
    document.cookie =
      `${LOCALE_COOKIE}=${next}; path=/; max-age=${LOCALE_COOKIE_MAX_AGE}; samesite=lax`;
    setSaved(true);
    router.refresh();
  }

  return (
    <section className="mt-12">
      <h2 className="font-sans font-semibold text-section text-ink mb-1">
        {t("settings.language.title")}
      </h2>
      <p className="text-sm text-ink-3 max-w-[60ch]">
        {t("settings.language.help")}
      </p>

      <div
        className="flex gap-2 mt-5"
        role="radiogroup"
        aria-label={t("settings.language.title")}
      >
        {LOCALES.map((code) => (
          <button
            key={code}
            type="button"
            role="radio"
            aria-checked={code === locale}
            onClick={() => choose(code)}
            /**
             * `lang` on the button itself, so a screen reader announces
             * "العربية" in Arabic rather than attempting it in English.
             * This is the one place in the product where a word is
             * deliberately in a different language from the page around
             * it, and without the attribute it is read as gibberish.
             */
            lang={code === "ar" ? "ar" : "en"}
            className={cn(
              "min-h-11 px-4 rounded-lg border text-control cursor-pointer",
              code === locale
                ? "bg-accent-soft border-accent-edge text-ink font-semibold"
                : "bg-sunk border-rule text-ink-2 hover:text-ink",
            )}
          >
            {t(LABEL_KEY[code])}
          </button>
        ))}

        {saved && (
          <span role="status" className="self-center t-label text-ink-3">
            {t("settings.language.saved")}
          </span>
        )}
      </div>
    </section>
  );
}
