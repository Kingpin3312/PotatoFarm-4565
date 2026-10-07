import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

/**
 * Every screen in the app as a URL a browser can open, with each dynamic
 * segment filled from a real row of the demo brokerage.
 *
 * Lifted out of `screens.mjs` so `narrow.mjs` walks exactly the same
 * screens rather than a copy of the list that drifts from it.
 */
/** Every `page.tsx`, as the URL Next serves it. */
function routes() {
  const out = [];
  const walk = (dir, url) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      // Route groups `(app)` do not appear in the URL.
      const seg = e.name.startsWith("(") && e.name.endsWith(")") ? "" : `/${e.name}`;
      const next = path.join(dir, e.name);
      if (fs.existsSync(path.join(next, "page.tsx"))) out.push((url + seg) || "/");
      walk(next, url + seg);
    }
  };
  if (fs.existsSync("src/app/page.tsx")) out.push("/");
  walk("src/app", "");
  return [...new Set(out)].sort();
}

const db = new PrismaClient({ datasources:{db:{url:process.env.DATABASE_URL_UNSCOPED}} });
const org = await db.organisation.findFirst({ where:{slug: "seed-marina", deletedAt:null}, select:{id:true} });

/** Real ids, so a dynamic route is exercised rather than skipped. */
const [lead, kyc, listing, convo, orgSlug, publicListing, vendor, invoice] = await Promise.all([
  db.lead.findFirst({ where: { orgId: org.id, deletedAt: null }, select: { id: true } }),
  db.kycRecord.findFirst({ where: { orgId: org.id }, select: { id: true } }),
  db.listing.findFirst({ where: { orgId: org.id, deletedAt: null }, select: { id: true } }),
  db.conversation.findFirst({ where: { orgId: org.id }, select: { id: true } }),
  db.organisation.findFirst({ where: { id: org.id }, select: { slug: true } }),
  /**
   * The public property page needs a listing `publicListing()` will
   * actually return — available, and carrying a permit. Any listing
   * would render the 404 this sweep is meant to distinguish from a
   * broken screen.
   */
  db.listing.findFirst({
    where: { orgId: org.id, deletedAt: null, status: "AVAILABLE", permitNumber: { not: null } },
    select: { reference: true },
  }),
  db.vendor.findFirst({ where: { orgId: org.id }, select: { id: true } }),
  db.invoice.findFirst({ where: { orgId: org.id }, orderBy: { issuedAt: "desc" }, select: { number: true } }),
]);
// A live agent microsite, which the seed publishes for Lena.
const site = await db.agentMicrosite.findFirst({
  where: { orgId: org.id, publishedAt: { not: null }, disabledAt: null }, orderBy: { slug: "asc" }, select: { slug: true },
});

/**
 * Keyed by the token the folder uses, which is why the folders are
 * named after what they hold.
 *
 * `offers/[id]` took a *listing* id, and this map filled it with an
 * offer id — so the screen 404'd and the sweep reported a broken page
 * that was only being handed the wrong thing. Renaming the segment to
 * `[listingId]` made both the route and this map say the same word.
 *
 * A token with no entry is reported, never quietly skipped: an
 * unfillable dynamic route is exactly the kind of screen that rots.
 */
const SUBST = {
  "[leadId]": lead?.id,
  "[kycId]": kyc?.id,
  "[listingId]": listing?.id,
  "[conversationId]": convo?.id,
  // The public property page, which is outside the app shell and
  // reached with no session at all.
  "[slug]": orgSlug?.slug,
  "[reference]": publicListing?.reference,
  // The owner's page. Reported as "not opened" from the day it was
  // mounted, because nothing here knew how to fill the token — honest,
  // and it meant the one screen an owner is shown was never walked.
  "[vendorId]": vendor?.id,
  // An agent's microsite: `/p/<brokerage>/agents/<agent>`.
  "[agent]": site?.slug,
  // The invoice document. The seed issues one through the real
  // invoicing code, so this is a real number from the real series.
  "[number]": invoice?.number,
};

const all = routes();
const targets = [];
const skipped = [];
for (const r of all) {
  if (!r.includes("[")) { targets.push(r); continue; }
  let filled = r;
  let missing = null;
  for (const [token, value] of Object.entries(SUBST)) {
    if (filled.includes(token)) {
      if (!value) { missing = token; break; }
      filled = filled.replace(token, value);
    }
  }
  // Named, never silently dropped: a dynamic route nobody could build a
  // URL for is exactly the kind of screen that rots unnoticed.
  if (missing) {
    // In the map, but the database has no row for it today.
    skipped.push(`${r} (no row to fill ${missing})`);
    continue;
  }
  /**
   * A token the map has never heard of, which is a different fault and
   * used to be silent. `filled` still held `[slug]` and `[reference]`
   * verbatim, so the sweep requested a literal `/p/[slug]/[reference]`,
   * got a 404, and reported the new public property page as a broken
   * screen. It has to come *after* the `missing` branch: checked first
   * it relabels every legitimately unfillable route as an unknown
   * token, which is how it first mislabelled `/compliance/[kycId]`.
   */
  const unknown = filled.match(/\[[^\]]+\]/);
  if (unknown) {
    skipped.push(`${r} (no substitution for ${unknown[0]} — add it to SUBST)`);
    continue;
  }
  targets.push(filled);
}

export { targets, skipped, db };
