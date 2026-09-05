/**
 * The English catalogue, and the source of truth for what a key *is*.
 *
 * `MessageKey` is derived from this object, so every other catalogue is
 * checked against it by the compiler rather than by hope. Adding a key
 * here and forgetting Arabic is a type error in `ar.ts`, not a screen
 * that renders `undefined` to a customer.
 *
 * ## Why the keys are dotted strings and not nested objects
 *
 * A nested catalogue reads better and greps worse. `t("nav.today")` can
 * be found in one search across the whole codebase — which is what the
 * audit script does to prove no key is orphaned and no string was
 * missed. `t(m.nav.today)` cannot be, and the check that matters more
 * than the aesthetics is the one that can run.
 *
 * ## What is deliberately not in here
 *
 * Anything the *database* holds: a brokerage's own pipeline stage names,
 * a lead's name, an agent-written note. Those are the brokerage's words
 * in whichever language they typed them, and running them through a
 * catalogue would either fail to match or, worse, silently translate a
 * client's name.
 */
export const en = {
  // ---- The top bar -------------------------------------------------
  "nav.today": "Today",
  "nav.inbox": "Inbox",
  "nav.diary": "Diary",
  "nav.pipeline": "Pipeline",
  "nav.blackbook": "Blackbook",
  "nav.offers": "Offers",
  "nav.settings": "Settings",

  // ---- The second tier ---------------------------------------------
  "nav.deals": "Deals",
  "nav.activity": "What it did",
  "nav.reports": "Reports",
  "nav.mine": "Mine",
  "nav.leads": "Leads",
  "nav.listings": "Listings",
  "nav.general": "General",
  "nav.compliance": "Compliance",
  "nav.documents": "Documents",
  "nav.privacy": "Privacy",
  "nav.access": "Access",
  "nav.assistantQuestions": "What it asks",
  "nav.hours": "Working hours",
  "nav.routing": "Routing",
  "nav.channels": "Channels",
  "nav.import": "Import",
  "nav.team": "Team",
  "nav.commissionPlans": "Commission plans",
  "nav.billing": "Billing",
  "nav.findAnyone": "Find anyone",
  "nav.ask": "Ask",
  "nav.commission": "Commission",
  "nav.more": "More",

  // ---- The frame ---------------------------------------------------
  "shell.skipToContent": "Skip to content",
  "shell.assistantStopped": "Assistant stopped",
  "shell.close": "Close",
  "shell.mainNav": "Main",

  // ---- The command palette -----------------------------------------
  "palette.search": "Search",
  "palette.open": "Search and go to",
  "palette.placeholder": "Go to a screen, or find anyone…",
  "palette.placeholderShort": "Go to a screen, or find anyone",
  "palette.searching": "Searching",
  "palette.results": "Results",
  "palette.keepTyping": "Keep typing to search.",
  "palette.nothingMatched": "Nothing matched.",
  "palette.group.goTo": "Go to",
  "palette.group.people": "People",
  "palette.group.properties": "Properties",

  // ---- Choosing a language -----------------------------------------
  "settings.language.title": "Language",
  "settings.language.help":
    "Changes the interface only. What the assistant writes to your customers follows the language each customer messages you in.",
  "settings.language.saved": "Saved",
  /**
   * The two language names are the same string in both catalogues, and
   * that is not an oversight.
   *
   * A person who has landed in the wrong language needs to find their
   * way out, and the one word they can definitely read is the name of
   * their own language written in it. Translating "Arabic" to "عربي"
   * only when the interface is already Arabic is precisely backwards —
   * it is legible exactly when it is not needed.
   */
  "settings.language.en": "English",
  "settings.language.ar": "العربية",
} as const;

export type MessageKey = keyof typeof en;

/**
 * Counted strings, which cannot live in the table above.
 *
 * English has two forms and Arabic has six. `${n} result${n === 1 ? ""
 * : "s"}` — which is what the palette did — has the English answer
 * welded into the code, so there is no key for a translator to fill in
 * and no amount of catalogue work makes it right.
 *
 * The categories are CLDR's, selected by `Intl.PluralRules`. Arabic uses
 * all six: **zero** (٠), **one** (١), **two** (٢, a real grammatical
 * dual), **few** (٣–١٠), **many** (١١–٩٩) and **other** (١٠٠+). They are
 * not interchangeable — "3 results" and "13 results" take different noun
 * forms — so a catalogue that fills in only `one` and `other` is wrong
 * for most of the numbers a busy inbox produces.
 *
 * `other` is required by the type because it is the fallback. Everything
 * else is optional, because which categories exist is a property of the
 * language and English genuinely has no dual.
 */
export type PluralCategory = Intl.LDMLPluralRule;

export type PluralForms = Partial<Record<PluralCategory, string>> & {
  other: string;
};

export const enPlurals = {
  "palette.resultCount": {
    one: "{n} result",
    other: "{n} results",
  },
} as const satisfies Record<string, PluralForms>;

export type PluralKey = keyof typeof enPlurals;

export type Plurals = Record<PluralKey, PluralForms>;

/**
 * Every catalogue is this shape. `Record` rather than `typeof en` on
 * purpose: a translation must supply every key, but it must not be
 * pinned to English's *literal* values.
 */
export type Messages = Record<MessageKey, string>;
