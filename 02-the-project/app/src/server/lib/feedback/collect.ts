/**
 * Asking a buyer what they thought.
 *
 * Currently this is reconstructed from an agent's memory a week later,
 * which is how a vendor ends up being told "it went well" about four
 * viewings that produced nothing.
 *
 * Three decisions, all about response rate rather than data quality —
 * because feedback nobody gives is not data at all.
 */

/**
 * 1. **One question, not a survey.**
 *
 * A four-question form gets about five percent back. One question with
 * four tappable answers gets most people, and the follow-up only happens
 * if they engage with the first.
 */
export const ASK_ONE_THING = true;

/**
 * 2. **Not immediately.**
 *
 * Asking as somebody walks out of a viewing gets a polite answer rather
 * than a true one. Two hours later they are in the car or at home and
 * have decided what they actually think.
 *
 * And never after 8pm — a survey at 9pm is the message that makes
 * somebody mute the thread.
 */
export const ASK_AFTER_HOURS = 2;

export function askAt(viewingEnded: Date, timezone = "Asia/Dubai") {
  const at = new Date(viewingEnded.getTime() + ASK_AFTER_HOURS * 3_600_000);
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: timezone, hour: "2-digit", hour12: false }).format(at)
  );

  if (hour >= 20 || hour < 9) {
    // Push to the next morning rather than dropping it.
    const next = new Date(at);
    next.setUTCHours(next.getUTCHours() + (hour >= 20 ? 13 : 9 - hour));
    return next;
  }
  return at;
}

/**
 * 3. **Ask like a person, not like a form.**
 *
 * "Please rate your viewing experience from 1 to 5" is a survey and reads
 * like one. "What did you think?" is a question, and the four options do
 * the structuring without the buyer noticing they have been structured.
 */
export function question(propertyTitle: string, firstName: string | null) {
  const opener = firstName ? `${firstName}, ` : "";
  return {
    body: `${opener}what did you think of ${propertyTitle}?`,
    options: [
      { id: "OFFERING", label: "I'd like to make an offer" },
      { id: "INTERESTED", label: "Interested — need to think" },
      { id: "NOT_FOR_ME", label: "Not for me" },
      { id: "WRONG_PROPERTY", label: "Not what I expected" },
    ],
  };
}

/**
 * The follow-up, and only for the two answers where the reason is worth
 * having. Somebody making an offer does not need to be asked why, and
 * asking them is a way of losing momentum at exactly the wrong moment.
 */
export function followUp(verdict: string) {
  if (verdict === "OFFERING") return null;

  const common = [
    { id: "PRICE_TOO_HIGH", label: "Price" },
    { id: "TOO_SMALL", label: "Size" },
    { id: "LAYOUT", label: "Layout" },
    { id: "CONDITION", label: "Condition" },
    { id: "LOCATION", label: "Location" },
    { id: "OTHER", label: "Something else" },
  ];

  return {
    body:
      verdict === "WRONG_PROPERTY"
        ? "Sorry about that — what was different from what you expected?"
        : "No problem at all. What was the main thing?",
    options: verdict === "WRONG_PROPERTY"
      ? [{ id: "NOT_AS_ADVERTISED", label: "Not as advertised" }, ...common]
      : common,
  };
}
