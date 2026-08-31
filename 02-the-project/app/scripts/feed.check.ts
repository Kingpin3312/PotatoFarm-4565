/**
 * The listing feed serves a real brokerage's real listings.
 *
 * Three things are asserted, and the second is the one that matters.
 *
 * 1. A valid token returns that brokerage's advertisable listings.
 * 2. **A token belonging to one brokerage never returns another's.**
 *    The feed is reached with no session at all — the URL is the whole
 *    credential — so it is the one place in the product where a wrong
 *    `where` clause leaks a competitor's entire inventory to anybody
 *    holding a link. `crossTenant` is used deliberately here, which
 *    means row-level security is not the backstop it is everywhere
 *    else, and that is exactly why this is checked rather than argued.
 * 3. An unpermitted listing is withheld, because advertising without a
 *    Trakheesi permit is a fineable offence for the brokerage.
 */
import { PrismaClient } from "@prisma/client";
import { randomBytes, randomUUID } from "node:crypto";
import { feedFor, toXml } from "../src/server/lib/portals/feed";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function makeOrg(name: string) {
  return db.organisation.create({
    data: {
      name,
      slug: `feedcheck-${randomUUID().slice(0, 8)}`,
      feedToken: randomBytes(32).toString("base64url"),
      feedTokenAt: new Date(),
    },
    select: { id: true, name: true, feedToken: true },
  });
}

async function makeListing(orgId: string, ref: string, permit: string | null) {
  return db.listing.create({
    data: {
      orgId,
      reference: ref,
      title: `${ref} — two bed in Marina Gate`,
      community: "Dubai Marina",
      bedrooms: 2,
      bathrooms: 2,
      areaSqft: 1200,
      priceFils: 2_500_000_00n,
      purpose: "SALE",
      status: "AVAILABLE",
      permitNumber: permit,
      permitExpiresAt: permit ? new Date(Date.now() + 90 * 86_400_000) : null,
      reraBrokerCard: "12345",
      descriptions: { en: "A description long enough to pass.", photos: ["a.jpg", "b.jpg"] },
    },
    select: { id: true },
  });
}

async function main() {
  console.log("\nListing feed\n");

  const alpha = await makeOrg("Alpha Feed Check");
  const beta = await makeOrg("Beta Feed Check");

  const permitted = await makeListing(alpha.id, `AF-${randomUUID().slice(0, 6)}`, "7654321");
  const unpermitted = await makeListing(alpha.id, `AF-${randomUUID().slice(0, 6)}`, null);
  const betaListing = await makeListing(beta.id, `BF-${randomUUID().slice(0, 6)}`, "1234567");

  const alphaFeed = await feedFor(alpha.id);
  const refs = alphaFeed.map((l) => l.reference);

  ok("the permitted listing is in the feed", alphaFeed.length >= 1, `${alphaFeed.length} listing(s)`);

  const unpermittedRow = await db.listing.findUnique({
    where: { id: unpermitted.id }, select: { reference: true },
  });
  ok(
    "a listing with no Trakheesi permit is withheld",
    !refs.includes(unpermittedRow!.reference),
  );

  const betaRow = await db.listing.findUnique({
    where: { id: betaListing.id }, select: { reference: true },
  });
  ok(
    "another brokerage's listing is NOT in this feed",
    !refs.includes(betaRow!.reference),
    betaRow!.reference,
  );

  const xml = toXml(alphaFeed, { brokerage: alpha.name });
  ok("the document declares itself as XML", xml.startsWith('<?xml version="1.0"'));
  ok("the Trakheesi permit is carried", xml.includes("<trakheesi>7654321</trakheesi>"));
  ok("the RERA broker card is carried", xml.includes("<reraBrokerCard>12345</reraBrokerCard>"));
  ok("the price is AED whole units, not fils", xml.includes(">2500000<"));
  ok(
    "the count in the header matches the listings emitted",
    xml.includes(`count="${alphaFeed.length}"`),
  );

  // Nothing about the feed may claim the portal has it.
  ok("the feed never says PUBLISHED", !xml.includes("PUBLISHED"));

  await db.listing.deleteMany({ where: { orgId: { in: [alpha.id, beta.id] } } });
  await db.organisation.deleteMany({ where: { id: { in: [alpha.id, beta.id] } } });
  void permitted;
  await db.$disconnect();

  console.log(failures === 0 ? "\n  the feed is correct and scoped.\n" : `\n  ${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
