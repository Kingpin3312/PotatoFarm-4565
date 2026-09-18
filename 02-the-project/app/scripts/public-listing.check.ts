/**
 * The public property page shows one property and nothing else.
 *
 * This route is reached with **no session at all** — a stranger
 * following a link out of a WhatsApp message is the entire point — and
 * it resolves through `crossTenant`, so row-level security is not the
 * backstop it is everywhere else in the product. Everything that keeps
 * one brokerage's inventory out of another's URL is the `where` clause
 * in `publicListing`, which makes it worth asserting rather than
 * arguing about.
 *
 * The withholding cases matter as much as the showing case, and for a
 * legal reason rather than a tidiness one: a Dubai property advertised
 * without a valid Trakheesi permit is a fineable offence for the
 * brokerage, and a public page is advertising in exactly the sense the
 * law means.
 *
 * Every miss must look identical from outside. A page that 404s for an
 * unknown reference but renders differently for one that is sold lets
 * anybody enumerate what a brokerage has taken off the market.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { publicListing, enquiryText } from "../src/server/lib/listings/public";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failures++;
}

const tag = randomUUID().slice(0, 8);

async function org(name: string) {
  return db.organisation.create({
    data: { name, slug: `pubcheck-${randomUUID().slice(0, 8)}` },
    select: { id: true, slug: true, name: true },
  });
}

async function listing(orgId: string, ref: string, over: Record<string, unknown> = {}) {
  return db.listing.create({
    data: {
      orgId,
      reference: ref,
      title: `${ref} — two bed in Marina Gate`,
      community: "Dubai Marina",
      bedrooms: 2, bathrooms: 2, areaSqft: 1200,
      priceFils: 2_500_000_00n,
      purpose: "SALE",
      status: "AVAILABLE",
      permitNumber: "7654321",
      permitExpiresAt: new Date(Date.now() + 90 * 86_400_000),
      reraBrokerCard: "12345",
      descriptions: { en: "A description long enough to pass.", photos: ["a.jpg"] },
      ...over,
    },
    select: { id: true, reference: true },
  });
}

async function main() {
  console.log("\nPublic property page\n");

  const alpha = await org(`Alpha Public ${tag}`);
  const beta = await org(`Beta Public ${tag}`);

  const live = await listing(alpha.id, `PA-${tag}`);
  const sold = await listing(alpha.id, `PS-${tag}`, { status: "SOLD" });
  const noPermit = await listing(alpha.id, `PN-${tag}`, { permitNumber: null, permitExpiresAt: null });
  const expired = await listing(alpha.id, `PX-${tag}`, {
    permitExpiresAt: new Date(Date.now() - 3 * 86_400_000),
  });
  const removed = await listing(alpha.id, `PD-${tag}`, { deletedAt: new Date() });
  const betaLive = await listing(beta.id, `PB-${tag}`);

  const shown = await publicListing(alpha.slug, live.reference);
  ok("a live, permitted property is shown", shown !== null);
  ok("it carries the brokerage's name", shown?.brokerage === alpha.name);
  ok("it carries the permit, which the advert must display", shown?.permitNumber === "7654321");
  ok("it carries the agent's RERA card", shown?.reraBrokerCard === "12345");
  ok(
    "the enquiry names the reference, so the assistant knows the property",
    enquiryText({ reference: live.reference, title: "x" }).includes(live.reference),
  );

  // ---- everything that must be withheld, all identically ----
  ok("a sold property is withheld", (await publicListing(alpha.slug, sold.reference)) === null);
  ok("a property with no permit is withheld",
     (await publicListing(alpha.slug, noPermit.reference)) === null);
  ok("a property whose permit has expired is withheld",
     (await publicListing(alpha.slug, expired.reference)) === null);
  ok("a deleted property is withheld",
     (await publicListing(alpha.slug, removed.reference)) === null);
  ok("an unknown reference is withheld",
     (await publicListing(alpha.slug, `NOPE-${tag}`)) === null);
  ok("an unknown brokerage is withheld",
     (await publicListing(`no-such-brokerage-${tag}`, live.reference)) === null);

  // ---- the one that would be a breach ----
  ok(
    "another brokerage's property is NOT reachable through this slug",
    (await publicListing(alpha.slug, betaLive.reference)) === null,
    betaLive.reference,
  );
  ok(
    "and this brokerage's property is not reachable through theirs",
    (await publicListing(beta.slug, live.reference)) === null,
  );

  await db.listing.deleteMany({ where: { orgId: { in: [alpha.id, beta.id] } } });
  await db.organisation.deleteMany({ where: { id: { in: [alpha.id, beta.id] } } });
  await db.$disconnect();

  console.log(
    failures === 0
      ? "\n  one property, the right one, and nothing that must not be advertised.\n"
      : `\n  ${failures} failure(s)\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
