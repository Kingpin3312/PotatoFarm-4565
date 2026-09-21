import { createHmac, timingSafeEqual } from "node:crypto";
import type { Adapter, RawEnquiry } from "./types";

/**
 * A brokerage's own website form.
 *
 * ## Why this is different from every other adapter here
 *
 * Property Finder, Bayut and Dubizzle each need a partner agreement
 * before a single lead can arrive, and `types.ts` says so at the top.
 * This one needs nobody's permission: it is the brokerage's own site
 * posting to a URL we give them, in a format **we** define. There was
 * therefore never anything blocking it, and it was missing anyway.
 *
 * What that cost: `channels.connect` accepted `WEBSITE_FORM`, issued a
 * `webhookToken`, and the settings screen handed the brokerage a
 * webhook URL — and `adapters` held only `PROPERTY_FINDER`, so every
 * enquiry posted to that URL came back **404 "Unknown portal."**, for
 * ever. A connected channel, a URL on screen, and nothing on the other
 * end. For a brokerage with no Facebook Page and no portal agreement
 * this is the only inbound channel there is, so the practical effect
 * was a CRM that could not receive a lead at all.
 *
 * ## The format
 *
 * Deliberately flat and forgiving, because the person wiring it up is a
 * web developer at the brokerage's agency, working from one page of
 * documentation, and they will not read a schema. Every field is
 * optional except one of phone or email — `ingestEnquiry` refuses an
 * enquiry with neither, since a lead nobody can reply to is noise.
 *
 *     POST /api/webhooks/portals/website_form?t=<token>
 *     {
 *       "id":        "contact-form-8831",     // optional, see below
 *       "name":      "Aisha Rahman",
 *       "phone":     "+971 50 123 4567",
 *       "email":     "aisha@example.com",
 *       "message":   "Interested in a 2-bed in Marina",
 *       "reference": "MG-202",                // your listing reference
 *       "language":  "ar",
 *       "source":    "Contact page",          // which form, for reporting
 *       "submittedAt": "2026-09-21T09:14:00Z"
 *     }
 *
 * Common spellings are accepted for each field — `full_name`, `fullName`
 * and `name` all work — because the alternative is a brokerage's agency
 * silently posting `full_name` and nobody finding out until somebody
 * asks why the website has sent no leads in a fortnight.
 */

/** The first of several spellings that carries a value. */
function pick(body: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = body[k];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return undefined;
}

export const websiteForm: Adapter = {
  key: "WEBSITE_FORM",
  label: "Website form",
  delivery: "push",

  /**
   * Signed only when the brokerage stored a secret.
   *
   * `verify` is checked for existence by the route, which then calls
   * `getChannelCredentials` — and that **throws** when a channel has no
   * stored credential. `WEBSITE_FORM` is in `NO_CREDENTIAL`, so
   * defining `verify` here unconditionally would make every delivery
   * throw before it reached the parser: the route would answer 500, and
   * 500 is the status that makes a sender retry for ever.
   *
   * So this adapter has no `verify` at all, and the secret in the URL
   * is the authentication. That is a deliberate, weaker choice than the
   * portals get, and it is the right one here: the brokerage's web
   * developer cannot compute an HMAC from a static site or a form
   * builder, and a scheme they cannot implement is a scheme that ends
   * with them not connecting the form.
   *
   * `webhookToken` is 32 random characters, unique, and scoped to one
   * channel — an attacker who does not have it cannot post, and one who
   * does can post leads into one brokerage's pipeline, which is the same
   * exposure every unsigned portal webhook carries.
   *
   * Left here as a comment rather than as code so nobody adds `verify`
   * back without reading the paragraph above.
   */

  parse(payload): RawEnquiry[] {
    const body = (payload ?? {}) as Record<string, unknown>;

    // One enquiry per post. A website form submits once; batching is a
    // portal concern and inventing it here would be a format nobody
    // sends.
    const phone = pick(body, ["phone", "mobile", "phoneNumber", "phone_number", "tel"]);
    const email = pick(body, ["email", "emailAddress", "email_address"]);

    /**
     * An id we can deduplicate on, invented when the sender has none.
     *
     * `Enquiry.externalId` is unique per brokerage and is what stops a
     * retried delivery becoming a second lead on the board. Most form
     * builders send no id, so one is derived from the contact and the
     * minute: a double-submitted form — the visitor clicking twice, or
     * the agency's own retry — collapses into one enquiry, while a
     * genuine second enquiry an hour later does not.
     *
     * Deliberately not a random id, which would deduplicate nothing,
     * and deliberately not the contact alone, which would silently
     * discard a buyer who came back next week about another property.
     */
    const submitted = pick(body, ["submittedAt", "submitted_at", "createdAt", "created_at", "date"]);
    const receivedAt = submitted && !Number.isNaN(Date.parse(submitted))
      ? new Date(submitted)
      : new Date();
    const minute = new Date(receivedAt).toISOString().slice(0, 16);
    const externalId = pick(body, ["id", "externalId", "external_id", "submissionId", "submission_id"])
      ?? `web:${(phone ?? email ?? "anonymous").toLowerCase()}:${minute}`;

    return [{
      externalId: String(externalId),
      receivedAt,
      name: pick(body, ["name", "fullName", "full_name", "firstName", "first_name"]),
      phone,
      email,
      message: pick(body, ["message", "enquiry", "comments", "comment", "notes", "question"]),
      listingRef: pick(body, ["reference", "listingRef", "listing_ref", "propertyRef", "property_ref", "ref"]),
      language: pick(body, ["language", "lang", "locale"]),
      /**
       * Which form on the site, carried through to reporting.
       *
       * `reports.byChannel` groups on `Enquiry.campaign` where there is
       * one, so a brokerage can see that the valuation form produces
       * four enquiries a week that all convert and the contact page
       * produces forty that do not.
       */
      source: pick(body, ["source", "form", "formName", "form_name", "page"]),
      raw: body,
    }];
  },
};
