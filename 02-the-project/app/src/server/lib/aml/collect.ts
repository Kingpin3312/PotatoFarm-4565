/**
 * Collecting due diligence documents over WhatsApp.
 *
 * The strongest idea in the competitive analysis, and the one that needs
 * the most care — because "an AI asked me for my passport on WhatsApp" is
 * a sentence that ends badly if any of this is done casually.
 *
 * Five rules, and each exists for a reason worth stating.
 */

/**
 * 1. **Never during qualification.**
 *
 * Asking an enquirer for a passport because they asked about a three-bed
 * in Marina is excessive collection, and it is creepy. The obligation
 * attaches to a transaction, not to a conversation. Documents are
 * requested only once a deal is agreed, and the code refuses earlier.
 */
export const COLLECT_FROM_STAGE = ["MOU_SIGNED", "DEPOSIT_PAID", "AGREED"] as const;

/**
 * 2. **Always say why, in plain words.**
 *
 * People are right to be suspicious of being asked for identity documents
 * over a messaging app. The request names the legal obligation, names the
 * brokerage, and says what happens to the file. A request that sounds
 * like a phishing message will be treated as one, and rightly.
 */
export function requestMessage(brokerage: string, docType: "PASSPORT" | "EMIRATES_ID" | "TRADE_LICENCE") {
  const what = {
    PASSPORT: "a photo of your passport photo page",
    EMIRATES_ID: "a photo of both sides of your Emirates ID",
    TRADE_LICENCE: "a copy of the company's trade licence",
  }[docType];

  return (
    `Before we can proceed, ${brokerage} has to complete an identity check — ` +
    `every property brokerage in the UAE is required to do this by law before a sale.\n\n` +
    `Could you send ${what}?\n\n` +
    `It's stored securely, only ${brokerage} can see it, and it's used for this ` +
    `transaction and the record we're required to keep. If you'd rather hand it over ` +
    `in person, that's completely fine — just say and we'll arrange it.`
  );
}

/**
 * 3. **The assistant collects. It never verifies.**
 *
 * An automated decision that somebody's identity document is genuine has
 * legal weight, and getting it wrong in either direction is serious —
 * rejecting a real buyer, or accepting a forgery into a compliance file
 * that a regulator will later read. So a document arrives, is stored, and
 * is queued for a human. The assistant says "thank you, we'll confirm
 * shortly", not "verified".
 */
export const ASSISTANT_MAY_VERIFY = false;

/**
 * 4. **The image never lives in the message thread.**
 *
 * WhatsApp media URLs expire, and a passport sitting in a conversation
 * log is a passport in every backup and export of that conversation. It
 * goes to object storage with restricted access, and the message body
 * records only that a document was received.
 *
 * ## How a document gets in today
 *
 * The agent adds it to the file from the identity panel
 * (`aml.documentUpload` → `aml.documentConfirm`, rules in
 * `aml/documents.ts`). Taking it straight from the WhatsApp message is
 * not built: it needs the inbound media downloaded from Meta with the
 * channel's token, which nothing here does yet.
 *
 * `receiveDocument` used to stand where that would go. Nothing called it,
 * and it stored nothing — its "secure storage" returned a random key and
 * wrote no bytes, under a comment describing the fetch and the write.
 * Wired up, it would have filled compliance files with pointers to
 * passports that were never kept. It was removed rather than left as the
 * obvious thing to call.
 */

/**
 * 5. **A blurry passport is worse than none.**
 *
 * It looks collected, the file looks complete, and it fails at the
 * moment somebody actually needs to read it. Basic quality checks happen
 * on receipt so the assistant can ask again while the person is still in
 * the conversation, rather than an agent discovering it a fortnight later.
 *
 * ## Not reachable yet, and saying so here rather than only in a list
 *
 * **Nothing produces a `QualityIssue` and nothing calls
 * `qualityMessage`.** There is no image inspection in this codebase —
 * `CLAUDE.md` lists "image quality checks" as unbuilt — so the four
 * codes below are a vocabulary waiting for a detector, and the sentence
 * above describes an intention rather than behaviour.
 *
 * It is written down at the definition because the list of unbuilt
 * things lives three files away, and the paragraph above reads exactly
 * like a description of something that runs. That gap — a confident
 * comment over unreachable code — is how this codebase has repeatedly
 * convinced a reviewer that a control exists.
 *
 * Deliberately **not** replaced with a stub returning no issues. That
 * would make every document silently pass a check nobody performed,
 * which is the same mistake as a fabricated sanctions `CLEAR` — see
 * `aml/screen.ts` for the argument in full.
 */
export type QualityIssue = "too_small" | "too_dark" | "cropped" | "glare";

export function qualityMessage(issues: QualityIssue[]) {
  const say: Record<QualityIssue, string> = {
    too_small: "it's come through quite small",
    too_dark: "it's a bit dark to read",
    cropped: "part of it looks cut off",
    glare: "there's some glare across it",
  };
  // `issues[0]` is optional under noUncheckedIndexedAccess, and an
  // unrecognised code would index to undefined anyway. Falls back to a
  // sentence that still makes sense rather than "Thanks — undefined".
  const first = issues[0];
  const why = (first && say[first]) ?? "it hasn't come through clearly";
  return (
    `Thanks — ${why}. Could you send it once more, flat on a surface ` +
    `with the whole page in frame? Sorry to ask twice.`
  );
}
