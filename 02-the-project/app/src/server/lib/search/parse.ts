import { placesIn } from "@/server/lib/places";

/**
 * "Who was that Emirati investor looking in Downtown around 4 million?"
 *
 * The last thing on the list, and the one an agent uses most once it
 * exists. Today the only search in this product is `contains` on a name
 * and a phone number — which means the question above returns nothing,
 * and the agent goes back to scrolling.
 *
 * **Rules, not embeddings, and that is a decision rather than a
 * shortcut.** The obvious build is pgvector plus an embeddings provider,
 * and it would be worse here for four reasons:
 *
 *   1. Half of what an agent asks is arithmetic. "Around 4 million"
 *      means a band around a number, and cosine similarity has no idea
 *      what a number is. Nor does it know that 3.8 is inside "under 4"
 *      and 4.2 is not.
 *   2. An agent has to be able to see *why* somebody came back, because
 *      they are about to ring them. A similarity score cannot say why.
 *   3. Embeddings go stale silently. Every edit needs re-embedding, the
 *      backfill job fails quietly, and the search slowly starts missing
 *      the newest people — which is precisely the failure mode this
 *      codebase keeps writing modules to catch.
 *   4. It needs a Postgres extension a managed database may not offer
 *      and an inference bill per keystroke.
 *
 * What is left after the structured parts are taken out is matched as
 * text against notes and remembered facts, which is where "Emirati" and
 * "relocating" actually live. That half is fuzzy; the numeric half is
 * exact; and the screen shows which is which.
 *
 * The upgrade path stays open: `terms` is the input an embedding search
 * would take, so ranking can be added later without moving the filters.
 */

export type Money = { minAed: number | null; maxAed: number | null };

export type Query = {
  /** Words left after the structured parts were consumed. */
  terms: string[];
  budget: Money | null;
  bedrooms: number | null;
  communities: string[];
  intent: "BUY_TO_LIVE" | "BUY_TO_INVEST" | "RENT" | "SELL" | null;
  purpose: "SALE" | "RENT" | null;
  /** Only records touched since this. From "last week", "this month". */
  since: Date | null;
  /** Restrict to one kind of thing, when they said so. */
  only: "people" | "properties" | null;
  /**
   * What it understood, in the agent's own vocabulary, to be shown back
   * above the results. A search that silently reinterprets the question
   * is a search nobody trusts twice.
   */
  reading: string[];
};

/**
 * A Dubai property is between fifty thousand and five hundred million.
 *
 * The same guard as the extractor, for the same reason: the failure that
 * actually happens is not a subtly wrong number, it is a factor of a
 * thousand from a misheard or mistyped word.
 */
const AED_MIN = 50_000;
const AED_MAX = 500_000_000;

/** Words that carry no meaning in a search and match everything. */
const STOP = new Set([
  "the", "a", "an", "and", "or", "of", "in", "at", "on", "for", "to", "with",
  "who", "what", "which", "that", "was", "is", "are", "were", "be", "been",
  "me", "my", "i", "we", "our", "us", "you", "show", "find", "search", "get",
  "list", "give", "looking", "look", "wants", "want", "wanted", "need",
  "needs", "about", "around", "circa", "approximately", "roughly", "somewhere",
  "anyone", "anybody", "someone", "somebody", "people", "person", "client",
  "clients", "lead", "leads", "buyer", "buyers", "contact", "contacts",
  "there", "their", "his", "her", "them", "it", "its", "one", "any", "all",
  "please", "can", "could", "would", "do", "did", "does", "have", "has",
  "had", "up", "over", "under", "between", "from", "than", "more", "less",
  // Verbs of remembering. "Who did I meet" is a question about
  // everybody, and left in, "meet" matches every note containing the
  // word — which is most of them.
  "meet", "met", "saw", "seen", "spoke", "spoken", "talk", "talked",
  "remember", "remembered", "know", "knew", "said", "told", "call",
  "called", "rang", "sent", "added", "add",
]);

/**
 * "4 million", "4m", "4.5m", "aed 4,000,000", "800k", "4".
 *
 * A bare number in a Dubai property conversation is millions — an agent
 * saying "around 4" is not talking about four dirhams. But a bare number
 * is also how somebody says "4 bed", so bedrooms are taken out of the
 * sentence first and this only ever sees what is left.
 */
function money(word: string, suffix: string | undefined): number | null {
  const n = Number(word.replace(/,/g, ""));
  if (!Number.isFinite(n)) return null;

  const s = (suffix ?? "").toLowerCase();
  const scaled =
    s.startsWith("m") ? n * 1_000_000
    : s.startsWith("k") ? n * 1_000
    // No unit given. Below a thousand it is millions ("around 4"),
    // above it is already dirhams ("4,000,000").
    : n < 1_000 ? n * 1_000_000
    : n;

  return scaled >= AED_MIN && scaled <= AED_MAX ? Math.round(scaled) : null;
}

const NUM = String.raw`(\d[\d,]*(?:\.\d+)?)\s*(million|mil|m|k|thousand)?`;

export function parse(raw: string): Query {
  const reading: string[] = [];
  // Normalised once. Everything below eats out of `rest`, so a phrase
  // that has been understood cannot also survive as a stray keyword and
  // match half the database.
  let rest = ` ${raw.toLowerCase().replace(/[^\p{L}\p{N}.,+\s-]/gu, " ").replace(/\s+/g, " ")} `;

  const eat = (re: RegExp) => { rest = rest.replace(re, " ").replace(/\s+/g, " "); };

  /* ---- bedrooms, before anything else reads a bare number ---- */
  let bedrooms: number | null = null;
  const bed = rest.match(/\s(\d{1,2})\s?-?\s?(?:bed|beds|bedroom|bedrooms|br)\b/);
  if (bed?.[1]) {
    bedrooms = Number(bed[1]);
    reading.push(`${bedrooms} bedrooms or more`);
    eat(new RegExp(escape_(bed[0]), "g"));
  }

  /* ---- budget ---- */
  let budget: Money | null = null;

  const between = rest.match(new RegExp(String.raw`\sbetween\s${NUM}\s(?:and|to|-)\s${NUM}`));
  const under = rest.match(new RegExp(String.raw`\s(?:under|below|less than|up to|max|maximum)\s${NUM}`));
  const over = rest.match(new RegExp(String.raw`\s(?:over|above|more than|at least|from|min|minimum)\s${NUM}`));
  const about = rest.match(new RegExp(String.raw`\s(?:around|about|circa|roughly|approximately|~)\s${NUM}`));
  const bare = rest.match(new RegExp(String.raw`\s${NUM}(?=\s)`));

  if (between?.[1]) {
    const lo = money(between[1], between[2]);
    const hi = money(between[3]!, between[4]);
    if (lo !== null && hi !== null) {
      budget = { minAed: Math.min(lo, hi), maxAed: Math.max(lo, hi) };
      eat(new RegExp(escape_(between[0]), "g"));
    }
  } else if (under?.[1]) {
    const hi = money(under[1], under[2]);
    if (hi !== null) { budget = { minAed: null, maxAed: hi }; eat(new RegExp(escape_(under[0]), "g")); }
  } else if (over?.[1]) {
    const lo = money(over[1], over[2]);
    if (lo !== null) { budget = { minAed: lo, maxAed: null }; eat(new RegExp(escape_(over[0]), "g")); }
  } else if (about?.[1] || bare?.[1]) {
    const m = (about ?? bare)!;
    const mid = money(m[1]!, m[2]);
    if (mid !== null) {
      /**
       * "Around four million" is a band, not a number.
       *
       * ±15% either side. Narrow enough that "around 4" does not return
       * the 6m villas, wide enough that a buyer whose ceiling an agent
       * recorded as 3.6 still appears — which is the whole reason
       * somebody searches this way instead of typing two numbers into a
       * filter.
       */
      budget = { minAed: Math.round(mid * 0.85), maxAed: Math.round(mid * 1.15) };
      eat(new RegExp(escape_(m[0]), "g"));
    }
  }

  if (budget) {
    const say = (n: number) => n >= 1_000_000
      ? `${+(n / 1_000_000).toFixed(2)}m`
      : `${Math.round(n / 1_000)}k`;
    reading.push(
      budget.minAed !== null && budget.maxAed !== null ? `AED ${say(budget.minAed)}–${say(budget.maxAed)}`
      : budget.maxAed !== null ? `up to AED ${say(budget.maxAed)}`
      : `from AED ${say(budget.minAed!)}`
    );
  }

  /* ---- where ---- */
  const { places, matched } = placesIn(rest);
  for (const v of matched) eat(new RegExp(`\\s${escape_(v)}\\s`, "g"));
  if (places.length) reading.push(places.join(" or "));

  /**
   * What they are here to do.
   *
   * `\w*` on every stem rather than a list of exact words. The first
   * version wrote `seller` and `investor` and matched neither "sellers"
   * nor "investors" — `\b` sits between a word and a space, not between
   * "seller" and its own plural, so the commonest phrasing of both was
   * the one that silently did nothing.
   */
  let intent: Query["intent"] = null;
  let purpose: Query["purpose"] = null;
  if (/\b(invest\w*|yield|roi)\b/.test(rest)) {
    intent = "BUY_TO_INVEST"; reading.push("investors");
    eat(/\s(invest\w*|yield|roi)\s/g);
  } else if (/\b(rent\w*|tenant\w*|leas\w+)\b/.test(rest)) {
    intent = "RENT"; purpose = "RENT"; reading.push("renting");
    eat(/\s(rent\w*|tenant\w*|leas\w+)\s/g);
  } else if (/\b(sell\w*|vendor\w*|owner\w*|landlord\w*|instruction\w*)\b/.test(rest)) {
    intent = "SELL"; reading.push("sellers and owners");
    eat(/\s(sell\w*|vendor\w*|owner\w*|landlord\w*)\s/g);
  } else if (/\b(live in|to live|end user|family home|move in)\b/.test(rest)) {
    intent = "BUY_TO_LIVE"; reading.push("buying to live in");
  }

  /* ---- when ---- */
  let since: Date | null = null;
  const now = new Date();
  const daysAgo = (d: number) => new Date(now.getTime() - d * 86_400_000);
  if (/\b(today)\b/.test(rest)) { since = daysAgo(1); reading.push("since yesterday"); eat(/\stoday\s/g); }
  else if (/\b(this week|last week|past week|recently|lately)\b/.test(rest)) {
    since = daysAgo(7); reading.push("in the last week");
    eat(/\s(this week|last week|past week|recently|lately)\s/g);
  } else if (/\b(this month|last month|past month)\b/.test(rest)) {
    since = daysAgo(31); reading.push("in the last month");
    eat(/\s(this month|last month|past month)\s/g);
  } else if (/\b(this year|last year|past year)\b/.test(rest)) {
    since = daysAgo(365); reading.push("in the last year");
    eat(/\s(this year|last year|past year)\s/g);
  }

  /**
   * One kind of thing, but only when they named the *record*.
   *
   * The first version treated any property word as "show me properties",
   * so "buyers for a villa in the Ranches" — a question about people,
   * with the property word describing what those people want — returned
   * listings and no buyers at all. A villa is what somebody is after,
   * not what kind of row they are.
   *
   * Read off the original sentence rather than what is left of it,
   * because "buyers" and "people" are stop words and have already been
   * eaten by the time anything else looks.
   */
  const said = ` ${raw.toLowerCase()} `;
  const only: Query["only"] =
    /\b(propert\w*|listing\w*|stock|inventory)\b/.test(said) ? "properties"
    : /\b(who|anyone|anybody|someone|somebody|buyer\w*|client\w*|people|person|lead\w*|contact\w*|seller\w*|owner\w*|tenant\w*|vendor\w*)\b/.test(said)
      ? "people"
      : null;
  if (only) reading.push(only === "people" ? "people only" : "properties only");

  /**
   * Everything not understood becomes a text term.
   *
   * Kept rather than discarded, and this is where the search earns its
   * name: "Emirati", "relocating", "school", "cash" are not columns and
   * never will be, and they are exactly what an agent remembers about
   * somebody a year later.
   */
  const terms = rest
    .split(" ")
    .map((w) => w.replace(/^[-.,]+|[-.,]+$/g, ""))
    .filter((w) => w.length > 2 && !STOP.has(w) && !/^\d+$/.test(w));

  const kept = [...new Set(terms)].slice(0, 6);

  /**
   * The loose words, said out loud with the exact ones.
   *
   * Watching this on a real screen, "Emirati buying in Dubai Hills
   * around 11 million" read back as *AED 9.35m–12.65m · Dubai Hills* —
   * and the word doing the most work was the one it did not mention.
   * An agent seeing a surprising result needs to know which part of
   * their sentence was treated as a filter and which as a guess.
   */
  if (kept.length) reading.push(`words: ${kept.join(", ")}`);

  return {
    terms: kept,
    budget, bedrooms, communities: places, intent, purpose, since, only, reading,
  };
}

function escape_(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Did the sentence say anything a query can be built from? */
export function isEmpty(q: Query): boolean {
  return q.terms.length === 0 && q.budget === null && q.bedrooms === null &&
         q.communities.length === 0 && q.intent === null && q.since === null;
}
