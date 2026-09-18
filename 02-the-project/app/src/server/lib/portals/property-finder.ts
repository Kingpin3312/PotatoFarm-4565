import { createHmac, timingSafeEqual } from "node:crypto";
import type { Adapter, RawEnquiry } from "./types";

/**
 * Property Finder — reference adapter.
 *
 * **The field names below are a placeholder shape, not a specification.**
 * Official lead delivery is arranged through a partner agreement, and the
 * payload comes from that agreement. Do not treat this file as the wire
 * format; confirm it against the contract before going live, and update
 * `parse` only.
 *
 * The point of the adapter boundary is that this is the only file that
 * changes when the real spec arrives. Everything downstream — matching,
 * deduplication, normalisation, the first reply — is already correct.
 */
export const propertyFinder: Adapter = {
  key: "PROPERTY_FINDER",
  label: "Property Finder",
  delivery: "push",

  verify(rawBody, headers, secret) {
    const given = headers.get("x-pf-signature");
    if (!given) return false;
    const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("hex");
    if (given.length !== expected.length) return false;
    return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  },

  parse(payload): RawEnquiry[] {
    const body = payload as { leads?: any[] };
    return (body.leads ?? []).map((l) => ({
      externalId: String(l.id),
      // Portals send local time as often as UTC. Trusting an unqualified
      // timestamp shifts every enquiry by four hours, which quietly
      // breaks the response-time reporting the product is sold on.
      receivedAt: l.created_at ? new Date(l.created_at) : new Date(),
      name: l.client?.name,
      phone: l.client?.phone,
      email: l.client?.email,
      message: l.message,
      listingRef: l.property?.reference,
      language: l.client?.language,
      raw: l,
    }));
  },
};
