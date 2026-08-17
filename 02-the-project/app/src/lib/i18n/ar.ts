import type { Messages, Plurals } from "./en";

/**
 * The Arabic catalogue.
 *
 * ## Read this before shipping it to a brokerage
 *
 * **These strings have not been reviewed by a native speaker.** They are
 * written to be correct and idiomatic for a UAE brokerage rather than
 * literal, but the difference between "correct" and "what a Dubai agent
 * would actually say" is exactly the difference a customer notices, and
 * it is not a difference this file can settle on its own. Getting them
 * read by one Arabic-speaking agent for an hour is worth more than any
 * amount of further care here, and it belongs on the same list as the
 * four accounts: it is a business task, not an engineering one.
 *
 * `Messages` is `Record<MessageKey, string>`, so a key added to `en.ts`
 * and forgotten here fails `tsc` rather than rendering blank.
 *
 * ## Choices that are not the literal translation
 *
 * - **Diary → المواعيد** ("appointments"), not المفكرة. "Diary" is UK
 *   estate-agency usage for the viewings calendar; the literal word is
 *   a personal journal and would read as the wrong screen.
 * - **Blackbook → دفتر العملاء** ("the client book"). The English name
 *   is an idiom with no Arabic equivalent, and transliterating it would
 *   name the screen after nothing.
 * - **Pipeline → مسار الصفقات** ("the deal track"), because bare مسار
 *   is a path in general and the board is specifically about deals.
 * - **What it did / What it asks** are kept as sentences rather than
 *   compressed into nouns. They are deliberately plain in English —
 *   they describe the assistant in the words an agent would use — and
 *   نشاط المساعد ("assistant activity") would put back exactly the
 *   product-speak the English avoids.
 */
export const ar: Messages = {
  // ---- The top bar -------------------------------------------------
  "nav.today": "اليوم",
  "nav.inbox": "الوارد",
  "nav.diary": "المواعيد",
  "nav.pipeline": "مسار الصفقات",
  "nav.blackbook": "دفتر العملاء",
  "nav.offers": "العروض",
  "nav.settings": "الإعدادات",

  // ---- The second tier ---------------------------------------------
  "nav.deals": "الصفقات",
  "nav.activity": "ما قام به",
  "nav.reports": "التقارير",
  "nav.mine": "ما يخصني",
  "nav.leads": "العملاء المحتملون",
  "nav.listings": "العقارات",
  "nav.general": "عام",
  "nav.compliance": "الامتثال",
  "nav.documents": "المستندات",
  "nav.privacy": "الخصوصية",
  "nav.access": "الصلاحيات",
  "nav.assistantQuestions": "ما يسأل عنه",
  "nav.hours": "ساعات العمل",
  "nav.routing": "توزيع العملاء",
  "nav.channels": "القنوات",
  "nav.import": "الاستيراد",
  "nav.team": "الفريق",
  "nav.commissionPlans": "خطط العمولة",
  "nav.billing": "الفوترة",
  "nav.findAnyone": "ابحث عن أي شخص",
  "nav.ask": "اسأل",
  "nav.commission": "العمولة",
  "nav.more": "المزيد",

  // ---- The frame ---------------------------------------------------
  "shell.skipToContent": "تخطَّ إلى المحتوى",
  "shell.assistantStopped": "المساعد متوقف",
  "shell.close": "إغلاق",
  "shell.mainNav": "التنقل الرئيسي",

  // ---- The command palette -----------------------------------------
  "palette.search": "بحث",
  "palette.open": "ابحث وانتقل",
  "palette.placeholder": "انتقل إلى شاشة، أو ابحث عن أي شخص…",
  "palette.placeholderShort": "انتقل إلى شاشة، أو ابحث عن أي شخص",
  "palette.searching": "جارٍ البحث",
  "palette.results": "النتائج",
  "palette.keepTyping": "تابع الكتابة للبحث.",
  "palette.nothingMatched": "لا توجد نتائج مطابقة.",
  "palette.group.goTo": "انتقل إلى",
  "palette.group.people": "الأشخاص",
  "palette.group.properties": "العقارات",

  // ---- Choosing a language -----------------------------------------
  "settings.language.title": "اللغة",
  "settings.language.help":
    "يغيّر واجهة الاستخدام فقط. أما ما يكتبه المساعد إلى عملائك فيتبع لغة كل عميل في رسائله.",
  "settings.language.saved": "تم الحفظ",
  // Endonyms in both catalogues — see the note in `en.ts`.
  "settings.language.en": "English",
  "settings.language.ar": "العربية",
};

/**
 * All six categories, because Arabic uses all six.
 *
 * The noun changes form, not just the number in front of it:
 *
 *     0    لا نتائج            no results — Arabic has a zero form
 *     1    نتيجة واحدة         one result
 *     2    نتيجتان             two — the dual, a form English has no
 *                              equivalent of at all
 *     3–10 {n} نتائج           the plural of paucity
 *     11–99 {n} نتيجة          singular after 11, which looks wrong to
 *                              an English reader and is correct
 *     100+ {n} نتيجة
 *
 * A catalogue filling in only `one` and `other` would render "١٣ نتائج"
 * for thirteen, which is the kind of mistake that tells a customer the
 * Arabic was an afterthought.
 *
 * `zero` and `two` deliberately do not interpolate `{n}` — Arabic says
 * "no results" and "two results" without repeating the numeral, and
 * forcing the digit in reads as translated-from-English.
 */
export const arPlurals: Plurals = {
  "palette.resultCount": {
    zero: "لا نتائج",
    one: "نتيجة واحدة",
    two: "نتيجتان",
    few: "{n} نتائج",
    many: "{n} نتيجة",
    other: "{n} نتيجة",
  },
};
