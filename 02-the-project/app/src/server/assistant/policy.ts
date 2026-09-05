/**
 * The assistant's hard rules.
 *
 * Kept in code rather than in a prompt, because a prompt is a request and
 * these are not requests. Everything here is checked before a message is
 * sent, whatever the model produced.
 */

export const POLICY_VERSION = "2026-07-28.1";

export const HARD_RULES = [
  /**
   * 1. Never claim to be human.
   *
   * Not a stylistic preference. A buyer who believes they agreed terms
   * with a person, and later finds it was software, has a complaint the
   * brokerage cannot answer. The assistant identifies itself on first
   * contact and any time it is asked.
   */
  "identify_as_assistant",

  /**
   * 2. Never state a fact about a property that is not in the brokerage's
   *    own listing record.
   *
   * Price, availability, service charge, handover date, permit number.
   * A confidently invented price to somebody holding two and a half
   * million dirhams is not an embarrassment, it is a misrepresentation
   * claim against the brokerage. If the data is absent, the answer is
   * that an agent will confirm.
   */
  "ground_all_property_facts",

  /**
   * 3. Never negotiate, discount, or commit the brokerage to anything.
   *
   * No offers, no price movement, no exclusivity, no promises about
   * timelines. Qualifying is the job; agreeing terms is not.
   */
  "no_commitments",

  /**
   * 4. Never filter, score, or route a lead using nationality, religion,
   *    ethnicity, gender, marital or family status.
   *
   * Buyers occasionally volunteer these, and portals have historically
   * carried this kind of preference. Automating it turns an individual's
   * bad judgement into a system that applies it to every enquiry, at
   * scale, with a log. This one is a refusal, not a caveat: the assistant
   * does not collect these attributes, does not act on them if offered,
   * and does not pass them to scoring.
   */
  "no_protected_attributes",

  /**
   * 5. Never give legal, tax, mortgage or immigration advice.
   *
   * Golden visa thresholds, tax residency, mortgage eligibility, freehold
   * eligibility. All of it moves, all of it is jurisdictional, and all of
   * it is a regulated activity. Hand to a human.
   */
  "no_regulated_advice",

  /** 6. Stop the moment a person is asked for, without argument. */
  "handover_on_request",
] as const;

/**
 * Attributes the assistant never stores, scores or forwards, even when a
 * lead volunteers them. Matched on the way in and dropped before the
 * message reaches extraction.
 */
/**
 * **Matched on word boundaries, not as substrings.** See
 * `mentionsProtectedTopic` — this list is what it is because of how it
 * is matched, and the two have to be read together.
 *
 * The substring version handed three ordinary enquiries to a human:
 *
 *   "anything in Arabian Ranches?"   -> matched "arab"
 *   "is it a single storey villa?"   -> matched "single"
 *   "can I see the terrace?"         -> matched "race"
 *
 * Arabian Ranches is one of the largest communities in Dubai and is a
 * canonical entry in this product's own `places.ts`. The assistant could
 * not discuss it, in either direction: an enquiry about it was refused
 * on the way in, and its own draft mentioning it was discarded on the
 * way out. The failure was invisible — the message went to a person, a
 * person answered it, and the brokerage concluded the assistant was
 * simply not very good.
 *
 * `single` is gone as a bare word. In property English it means a
 * storey or a bedroom far more often than a marital status, and the
 * discriminatory use always carries a qualifier — which is why the
 * phrases below carry it instead.
 *
 * `bachelor` stays, deliberately. In UAE housing it is not a synonym for
 * unmarried; "no bachelors" is the restriction itself.
 */
export const PROTECTED_TOPICS = [
  // Origin and belief
  "nationality", "citizenship", "passport", "religion", "religious",
  "muslim", "christian", "hindu", "jewish",
  "ethnicity", "race", "arab", "asian", "european", "african",
  // Family and marital status
  "married", "marital", "divorced", "pregnant", "family status",
  // Sex, and the restrictions written in listings
  "gender", "bachelor", "bachelors",
  "male only", "males only", "female only", "females only",
  "ladies only", "gents only", "children only", "no children",
  "singles only", "no singles", "single ladies", "single men",
] as const;

/** Conditions that end the assistant's turn and fetch a person. */
export const HANDOVER_TRIGGERS = {
  explicit_request: "The lead asked to speak to a person.",
  complaint: "The lead is unhappy or complaining.",
  negotiation: "The lead is discussing price or terms.",
  regulated: "The question needs legal, tax or mortgage advice.",
  high_value: "Budget is above the brokerage's handover threshold.",
  low_confidence: "The assistant is not confident it understood.",
  repeated_confusion: "The same question has come back three times.",
  protected_attribute: "The lead raised something the assistant will not act on.",
} as const;

export type HandoverReason = keyof typeof HANDOVER_TRIGGERS;
