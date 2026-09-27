/**
 * Which language a buyer wrote in.
 *
 * The website promises a reply "in the language the buyer wrote in.
 * Arabic or English, without being told which." Nothing did that: a
 * WhatsApp lead was created with the column default, `"en"`, and the
 * assistant's prompt read `Reply in en` for every buyer — so a buyer who
 * wrote in Arabic was answered in English. Found preparing the first
 * client demo, with an Arabic enquiry showing "· en" beside the name.
 *
 * Decided by script, not by a model: Arabic letters are unmistakable,
 * and this runs on every inbound message before any model is called. A
 * message that is mostly Latin letters with an Arabic greeting ("Salam,
 * is the flat available?") is English; one that is mostly Arabic with a
 * Latin building name ("هل الشقة في Marina Gate متاحة؟") is Arabic.
 * A message with no letters at all (a number, an emoji, a "?") says
 * nothing, and the caller keeps what it already had.
 */
export type Language = "en" | "ar";

const ARABIC = /[؀-ۿݐ-ݿࢠ-ࣿﭐ-﷿ﹰ-﻿]/gu;
const LATIN = /[A-Za-zÀ-ɏ]/gu;

export function detectLanguage(text: string | null | undefined): Language | null {
  if (!text) return null;
  const arabic = text.match(ARABIC)?.length ?? 0;
  const latin = text.match(LATIN)?.length ?? 0;
  if (arabic + latin === 0) return null;
  return arabic >= latin ? "ar" : "en";
}

/** What the prompt says: a model reads "Arabic" more reliably than "ar". */
export function languageName(code: string | null | undefined): string {
  return code === "ar" ? "Arabic" : "English";
}
