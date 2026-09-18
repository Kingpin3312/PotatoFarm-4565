/**
 * XML feed generation.
 *
 * Portals take listings as an XML document fetched on a schedule, not as
 * a push. That has two consequences worth designing around:
 *
 * 1. **The feed is the contract.** A listing missing from the document is
 *    a listing withdrawn, silently. Generating a partial feed because one
 *    row threw is how a brokerage loses forty listings overnight — so
 *    generation either produces the whole document or fails loudly.
 * 2. **You find out about rejections late**, on the portal's schedule.
 *    Which is why validation happens before a listing enters the feed at
 *    all, and why the publication state per portal is a real column.
 */

export function escapeXml(s: string) {
  return s.replace(/[<>&'"]/g, (c) =>
    ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]!)
  );
}

/** CDATA for free text, so a description with an ampersand cannot break the feed. */
export function cdata(s: string) {
  // A stray "]]>" inside a description would close the section early.
  return `<![CDATA[${s.replace(/]]>/g, "]]]]><![CDATA[>")}]]>`;
}

export type FeedListing = {
  reference: string;
  title: string;
  descriptions: Record<string, string>;
  price: string;
  purpose: "SALE" | "RENT";
  community: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqft: number | null;
  permitNumber: string | null;
  reraBrokerCard: string | null;
  photos: string[];
  agent: { name: string; phone: string; email: string } | null;
};

/**
 * Reference shape only. The element names come from each portal's feed
 * specification, which is part of the partner agreement — see
 * `portals/README.md`. Do not treat this as the spec.
 */
export function buildFeed(listings: FeedListing[], generatedAt = new Date()) {
  if (!listings.length) {
    // An empty feed reads to a portal as "withdraw everything". Refuse to
    // generate one rather than let a bad query wipe a brokerage's
    // advertising.
    throw new Error("Refusing to generate an empty feed — a portal reads it as a full withdrawal.");
  }

  const items = listings.map((l) => `
    <property>
      <reference_number>${escapeXml(l.reference)}</reference_number>
      <permit_number>${escapeXml(l.permitNumber ?? "")}</permit_number>
      <offering_type>${l.purpose === "SALE" ? "SA" : "RE"}</offering_type>
      <price>${escapeXml(l.price)}</price>
      <community>${escapeXml(l.community ?? "")}</community>
      <bedroom>${l.bedrooms ?? ""}</bedroom>
      <bathroom>${l.bathrooms ?? ""}</bathroom>
      <size>${l.areaSqft ?? ""}</size>
      <title_en>${cdata(l.title)}</title_en>
      ${Object.entries(l.descriptions)
        .map(([lang, text]) => `<description_${lang}>${cdata(text)}</description_${lang}>`)
        .join("\n      ")}
      <photo>
        ${l.photos.map((url, i) => `<url last_updated="${generatedAt.toISOString()}" ${i === 0 ? 'isfloorplan="0"' : ""}>${escapeXml(url)}</url>`).join("\n        ")}
      </photo>
      ${l.agent ? `<agent>
        <name>${escapeXml(l.agent.name)}</name>
        <email>${escapeXml(l.agent.email)}</email>
        <phone>${escapeXml(l.agent.phone)}</phone>
        <brn>${escapeXml(l.reraBrokerCard ?? "")}</brn>
      </agent>` : ""}
    </property>`).join("");

  return `<?xml version="1.0" encoding="UTF-8"?>
<list last_update="${generatedAt.toISOString()}">${items}
</list>`;
}
