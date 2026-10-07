/**
 * The words of a viewing offer, and which time the buyer picked.
 *
 * Kept away from the database so both can be tested on their own. The
 * offer is written here, not by the model: times are facts, and a
 * language model asked to restate "Tuesday 11:00" will, one day in a
 * thousand, restate it as Wednesday. The assistant's guardrails check
 * prices and sizes against the listing; nothing would have checked a day.
 *
 * Reading the pick is deliberately timid. A number, an ordinal, or a
 * day and time that names exactly one of the offered slots is a pick.
 * Anything that could mean two slots, or none ("any of them", "none of
 * those work"), is not — the agent reads it, because a viewing held on a
 * guess is a buyer standing outside the wrong tower.
 */

export type Lang = "en" | "ar";

const TZ = "Asia/Dubai";

/** "Tuesday 7 Oct, 11:00 am" in English; Western digits in Arabic too. */
export function slotLabel(at: Date, lang: Lang, tz = TZ): string {
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-AE-u-nu-latn" : "en-GB", {
    timeZone: tz, weekday: "long", day: "numeric", month: "short",
    hour: "numeric", minute: "2-digit", hour12: true,
  }).format(at);
}

export function offerMessage(args: {
  lang: Lang; agentName: string | null; listingTitle: string | null; slots: Date[]; tz?: string;
}): string {
  const list = args.slots.map((s, i) => `${i + 1}. ${slotLabel(s, args.lang, args.tz)}`).join("\n");
  if (args.lang === "ar") {
    const who = args.agentName ?? "وكيلنا";
    const what = args.listingTitle ? ` لمعاينة ${args.listingTitle}` : " للمعاينة";
    return `هذه المواعيد المتاحة${what}:\n${list}\nأرسل رقم الموعد المناسب لك، وسيؤكده ${who}.`;
  }
  const who = args.agentName ?? "our agent";
  const what = args.listingTitle ? ` to show you ${args.listingTitle}` : " for a viewing";
  return `Here are a few times ${who} is free${what}:\n${list}\nReply with the number that suits you, and ${who} will confirm it.`;
}

const ARABIC_DIGITS: Record<string, string> = { "١": "1", "٢": "2", "٣": "3" };
const ORDINALS: [RegExp, number][] = [
  [/\b(first|1st)\b|الأول(ى)?/i, 0],
  [/\b(second|2nd)\b|الثاني(ة)?/i, 1],
  [/\b(third|3rd)\b|الثالث(ة)?/i, 2],
];
/**
 * A time, written as one: "11am", "3 pm", "10:30", "at 3". A bare number
 * is not a time — "I need 2 bedrooms" must not pick the 2pm slot.
 */
const TIME = /(?:\bat\s+|@\s*)?\b(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?(?=\W|$)/g;
const isTime = (m: RegExpMatchArray) => !!(m[2] || m[3] || /^(at\s|@)/.test(m[0]));
const NOT_A_PICK = /\b(none|neither|any|either|whichever|can'?t|cannot|don'?t|not)\b|لا\s|ولا|أي\s/i;

/** The index of the offered slot the message picks, or null. */
export function readPick(text: string, slots: Date[], tz = TZ): number | null {
  if (!slots.length) return null;
  const t = text.trim().replace(/[١٢٣]/g, (d) => ARABIC_DIGITS[d]!);
  if (!t || NOT_A_PICK.test(t)) return null;
  const inRange = (i: number) => (i >= 0 && i < slots.length ? i : null);

  // "2", "2.", "option 2", "#2", "number 2 please"
  const bare = /^(?:option|number|no\.?|#|رقم)?\s*([1-9])\s*[.!)]?\s*(?:please|pls|thanks|thank you|works|is good|suits me|فضلاً|لو سمحت)?\s*[.!]?$/i.exec(t);
  if (bare) return inRange(Number(bare[1]) - 1);

  // "the second one"
  const ordinals = ORDINALS.filter(([re]) => re.test(t)).map(([, i]) => i);
  if (ordinals.length === 1) return inRange(ordinals[0]!);
  if (ordinals.length > 1) return null;

  // A day and/or a time that names exactly one offered slot.
  const lower = t.toLowerCase();
  const parts = slots.map((s) => {
    const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-GB", { timeZone: tz, ...o }).format(s).toLowerCase();
    const h24 = Number(f({ hour: "numeric", hour12: false }));
    const min = Number(f({ minute: "numeric" }));
    return { day: f({ weekday: "long" }), short: f({ weekday: "short" }), h24, min };
  });
  const timeHit = (p: (typeof parts)[number]) => {
    for (const m of lower.matchAll(TIME)) {
      if (!isTime(m)) continue;
      let h = Number(m[1]);
      const mm = m[2] ? Number(m[2]) : 0;
      const ampm = m[3]?.replace(/\./g, "");
      if (ampm === "pm" && h < 12) h += 12;
      if (ampm === "am" && h === 12) h = 0;
      // "3" with no am/pm: viewings are daytime, so 1–7 means afternoon.
      if (!ampm && h >= 1 && h <= 7) h += 12;
      if (h === p.h24 && mm === p.min) return true;
    }
    return false;
  };
  const dayHit = (p: (typeof parts)[number]) => new RegExp(`\\b(${p.day}|${p.short})\\b`).test(lower);
  const mentionsTime = [...lower.matchAll(TIME)].some(isTime);
  const mentionsDay = parts.some(dayHit);
  if (!mentionsTime && !mentionsDay) return null;
  const hits = parts.map((p, i) => ({ i, ok: (!mentionsDay || dayHit(p)) && (!mentionsTime || timeHit(p)) })).filter((x) => x.ok);
  return hits.length === 1 ? hits[0]!.i : null;
}

/** What the buyer hears when the agent confirms: the time, the place, who. */
export function confirmMessage(args: { lang: Lang; at: Date; listingTitle: string | null; agentName: string | null; tz?: string }) {
  const when = slotLabel(args.at, args.lang, args.tz);
  if (args.lang === "ar") {
    const what = args.listingTitle ? ` لمعاينة ${args.listingTitle}` : "";
    return `تم التأكيد: ${when}${what}.${args.agentName ? ` سيقابلك ${args.agentName} هناك.` : ""} إذا تغيّر أي شيء، فقط أرسل لنا هنا.`;
  }
  const what = args.listingTitle ? ` for ${args.listingTitle}` : "";
  return `Confirmed: ${when}${what}.${args.agentName ? ` ${args.agentName} will meet you there.` : ""} If anything changes, just reply here.`;
}

/** What the buyer hears when the agent cannot make the time they picked. */
export function declineMessage(args: { lang: Lang; at: Date; agentName: string | null; tz?: string }) {
  const when = slotLabel(args.at, args.lang, args.tz);
  if (args.lang === "ar") {
    return `نعتذر، لا يمكننا الالتزام بموعد ${when}. سنرسل لك مواعيد أخرى قريباً.`;
  }
  return args.agentName
    ? `Sorry — ${args.agentName} can't make ${when} after all. ${args.agentName} will send you some other times shortly.`
    : `Sorry — we can't make ${when} after all. We'll send you some other times shortly.`;
}
