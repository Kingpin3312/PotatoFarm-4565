/**
 * What happens on a real brokerage's data, not fourteen fixtures.
 *
 * Every green tick in this repository has been measured against seed
 * data — a dozen leads, three listings. That proves the logic and says
 * nothing at all about whether the product is usable, and "we never
 * measured it at scale" was the honest gap in the last audit.
 *
 * So: build a brokerage the size of a real one and time the queries an
 * agent actually waits on.
 *
 *     npm run check:load
 *
 * The budgets below are what a person perceives, not what a database is
 * capable of. 100ms feels instant, 300ms feels responsive, past a second
 * an agent has looked at their phone instead.
 */
import { crossTenant, forOrg } from "../src/server/db/client";
import { parse } from "../src/server/lib/search/parse";
import { search } from "../src/server/lib/search/run";
import { buyersFor } from "../src/server/lib/matching/buyers";
import { dayWindow } from "../src/server/api/routers/today";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "load-check-";
const fails: string[] = [];

/** Milliseconds before an agent notices. */
const BUDGET = { instant: 150, quick: 400, tolerable: 1200 };

/**
 * Cold and warm, separately — because they need opposite fixes.
 *
 * The first run of this reported the pipeline at 415ms and everything
 * else in single digits, which looks like one slow query and is not.
 * The first database call in a process pays for connection setup and
 * statement preparation; measuring only that blames the query for the
 * connection.
 *
 * Both numbers matter and they mean different things. **Warm** is the
 * query, and it is what an agent feels all day. **Cold** is what the
 * first visitor after a quiet spell feels, and on serverless that is
 * every scaled-to-zero invocation — the reason `ARCHITECTURE.md` insists
 * on a pooler in front of Postgres.
 *
 * The budget applies to warm. Cold is reported and watched.
 */
let coldest = { label: "", ms: 0 };
let FIRST_MEASURED = "";

async function timed<T>(label: string, budget: number, fn: () => Promise<T>) {
  const c0 = performance.now();
  const out = await fn();
  const cold = Math.round(performance.now() - c0);

  // Three warm runs, best of — one warm run can still catch a checkpoint.
  let warm = Infinity;
  for (let i = 0; i < 3; i++) {
    const t = performance.now();
    await fn();
    warm = Math.min(warm, Math.round(performance.now() - t));
  }

  if (!FIRST_MEASURED) FIRST_MEASURED = label;
  if (cold > coldest.ms) coldest = { label, ms: cold };
  const ok = warm <= budget;
  console.log(`  ${ok ? "✓" : "✗"} ${label.padEnd(42)} warm ${String(warm).padStart(4)}ms ` +
              `· first ${String(cold).padStart(4)}ms   (budget ${budget}ms)`);
  if (!ok) fails.push(`${label} took ${warm}ms warm, budget ${budget}ms`);
  return out;
}

const M = (aed: number) => BigInt(aed) * 100n;
const ago = (d: number) => new Date(Date.now() - d * 86_400_000);

/**
 * A brokerage that has been trading for three years.
 *
 * `SCALE=4 npm run check:load` multiplies it, which is how the ceiling
 * gets found rather than assumed. The default is the size of a real
 * customer; the multiples are what happens if one grows or if several
 * are migrated onto one database.
 */
const SCALE = Math.max(1, Number(process.env.SCALE ?? 1));
const LEADS = 5_000 * SCALE;
const LISTINGS = 1_200 * SCALE;
const REQUIREMENTS = 6_500 * SCALE;
const FACTS = 9_000 * SCALE;
const MESSAGES = 40_000 * SCALE;

const AREAS = ["Dubai Hills", "Dubai Marina", "Downtown", "JVC", "Arabian Ranches",
               "Palm Jumeirah", "Business Bay", "JLT", "Emirates Hills", "Meydan"];
const FIRST = ["Aisha","Omar","Grace","Tomasz","Priya","Khalid","Lena","Yusuf","Chen","Ivan",
               "Fatima","Daniel","Noor","Marco","Sofia","Rashid","Hannah","Peter","Zara","Luca"];
const LAST  = ["Al Suwaidi","Rahman","Adeyemi","Nowak","Nair","Haddad","Popescu","Demir","Wei",
               "Petrov","Okonjo","Kruger","Moreau","Santos","Lindqvist","Whitfield","Chen"];
const NOTE  = ["Relocating from Moscow in the spring","Cash buyer, no mortgage",
               "Walked away over service charges","Only answers WhatsApp",
               "Emirati, buying through a family office","Wants to be near a good school",
               "Visa renews in March","Second property, first was off-plan"];

async function main() {
  console.log("\nAt the size of a real brokerage\n");

  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });
  const org = await root.organisation.create({
    data: { name: "Load Check", slug: `${SLUG}a` },
  });
  const user = await root.user.upsert({
    where: { email: "load-check@example.com" },
    create: { email: "load-check@example.com", name: "Load Agent" },
    update: {},
  });
  await root.membership.create({ data: { orgId: org.id, userId: user.id, role: "OWNER" } });
  const channel = await root.channel.create({
    data: { orgId: org.id, type: "WHATSAPP", label: "Main", identifier: "+97140000009" },
  });

  /* ------------------------------ seeding ---------------------------- */

  console.log("Building it:");
  const t0 = performance.now();

  await root.listing.createMany({
    data: Array.from({ length: LISTINGS }, (_, i) => ({
      orgId: org.id,
      reference: `LC-${i}`,
      title: `${1 + (i % 5)}-bed ${i % 3 ? "apartment" : "villa"}, ${AREAS[i % AREAS.length]}`,
      community: AREAS[i % AREAS.length]!,
      bedrooms: 1 + (i % 5),
      priceFils: M(800_000 + (i % 120) * 250_000),
      purpose: i % 7 === 0 ? "RENT" : "SALE",
      status: "AVAILABLE",
      createdAt: ago(i % 900),
    })),
  });

  await root.lead.createMany({
    data: Array.from({ length: LEADS }, (_, i) => ({
      orgId: org.id,
      phone: `+9715${String(10_000_000 + i)}`,
      name: `${FIRST[i % FIRST.length]} ${LAST[(i * 7) % LAST.length]}`,
      status: (["NEW","QUALIFYING","QUALIFIED","VIEWING_BOOKED","NEGOTIATING","WON","LOST","UNRESPONSIVE"] as const)[i % 8],
      assignedToId: user.id,
      budgetMaxFils: M(700_000 + (i % 140) * 200_000),
      intent: (["BUY_TO_LIVE","BUY_TO_INVEST","RENT"] as const)[i % 3],
      notes: i % 4 === 0 ? NOTE[i % NOTE.length] : null,
      score: i % 101,
      createdAt: ago(i % 1000),
    })),
  });

  const leadIds = (await root.lead.findMany({
    where: { orgId: org.id }, select: { id: true }, take: LEADS,
  })).map((l) => l.id);

  await root.requirement.createMany({
    data: Array.from({ length: REQUIREMENTS }, (_, i) => ({
      orgId: org.id,
      leadId: leadIds[i % leadIds.length]!,
      purpose: i % 7 === 0 ? "RENT" : "SALE",
      intent: (["BUY_TO_LIVE","BUY_TO_INVEST","RENT"] as const)[i % 3],
      budgetMaxFils: M(700_000 + (i % 140) * 200_000),
      bedroomsMin: 1 + (i % 5),
      communities: [AREAS[i % AREAS.length]!],
      source: i % 5 === 0 ? "ASSISTANT" : "AGENT",
      confidence: i % 5 === 0 ? 0.4 : null,
    })),
  });

  await root.clientFact.createMany({
    data: Array.from({ length: FACTS }, (_, i) => ({
      orgId: org.id,
      leadId: leadIds[i % leadIds.length]!,
      kind: "CIRCUMSTANCE" as const,
      body: `${NOTE[i % NOTE.length]} (${i})`,
      source: "AGENT" as const,
    })),
  });

  // Conversations for a tenth of the book, with real message volume.
  const convLeads = leadIds.slice(0, Math.floor(LEADS / 10));
  await root.conversation.createMany({
    data: convLeads.map((leadId, i) => ({
      orgId: org.id, leadId, channelId: channel.id, lastInboundAt: ago(i % 200),
    })),
  });
  const convIds = (await root.conversation.findMany({
    where: { orgId: org.id }, select: { id: true },
  })).map((c) => c.id);

  for (let batch = 0; batch < MESSAGES / 10_000; batch++) {
    await root.message.createMany({
      data: Array.from({ length: 10_000 }, (_, i) => {
        const n = batch * 10_000 + i;
        return {
          orgId: org.id,
          conversationId: convIds[n % convIds.length]!,
          direction: (n % 2 ? "OUTBOUND" : "INBOUND") as "INBOUND" | "OUTBOUND",
          // Required, and it matters here: a real book is mostly the
          // assistant, which is what makes the message table the biggest
          // one in the database.
          author: (n % 2 ? (n % 5 ? "ASSISTANT" : "AGENT") : "LEAD") as "LEAD" | "ASSISTANT" | "AGENT",
          body: `Message ${n} about ${AREAS[n % AREAS.length]}`,
          sentAt: ago(n % 700),
        };
      }),
    });
  }

  /**
   * ANALYZE, and the reason is a finding in itself.
   *
   * Without this the first read of one person's message history took
   * **50 seconds** at four times scale — on an already-warm connection,
   * with the right index present. Postgres had just been handed 160,000
   * rows in bulk and had no statistics for the table, so it planned the
   * join to Conversation as though Message were empty and chose a nested
   * loop over the lot.
   *
   * Autovacuum gets there eventually. "Eventually" is minutes, and in
   * those minutes every screen that touches the table is unusable.
   *
   * It is not a live bug today — nothing in the product bulk-inserts
   * yet. It is a landmine under the import feature that is going to be
   * built, and it is recorded in `lib/migration/README.md` for whoever
   * builds it. Here it makes the measurement honest: these numbers
   * describe a running system, not one caught mid-import.
   */
  await root.$executeRawUnsafe(
    'ANALYZE "Lead", "Listing", "Requirement", "ClientFact", "Message", "Conversation"');

  const counts = {
    leads: await root.lead.count({ where: { orgId: org.id } }),
    listings: await root.listing.count({ where: { orgId: org.id } }),
    requirements: await root.requirement.count({ where: { orgId: org.id } }),
    facts: await root.clientFact.count({ where: { orgId: org.id } }),
    messages: await root.message.count({ where: { orgId: org.id } }),
  };
  console.log(`  ${Math.round((performance.now() - t0) / 1000)}s — ` +
    Object.entries(counts).map(([k, v]) => `${v.toLocaleString()} ${k}`).join(", "));

  /* ------------------------------ the waits -------------------------- */

  const db = forOrg(org.id);
  const scope = { canSeeAll: true, viewerId: user.id };

  console.log("\nWhat an agent waits for:");

  await timed("open the pipeline (first page)", BUDGET.quick, () =>
    db.lead.findMany({
      where: { deletedAt: null, status: "QUALIFYING" },
      orderBy: [{ stageEnteredAt: "desc" }], take: 25,
      select: { id: true, name: true, score: true, budgetMaxFils: true },
    }));

  await timed("open the listings screen", BUDGET.quick, () =>
    db.listing.findMany({
      where: { deletedAt: null }, take: 25,
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      include: { publications: true, _count: { select: { enquiries: true } } },
    }));

  await timed("search by name", BUDGET.quick, () =>
    search({ orgId: org.id, q: parse("Aisha"), scope }));

  await timed("search the full sentence", BUDGET.tolerable, () =>
    search({ orgId: org.id, q: parse("Emirati investor in Downtown around 4 million"), scope }));

  await timed("search a remembered fact", BUDGET.tolerable, () =>
    search({ orgId: org.id, q: parse("who is relocating"), scope }));

  const listing = await db.listing.findFirstOrThrow({ where: { community: "Dubai Hills" } });
  await timed("who wants this property", BUDGET.tolerable, () =>
    buyersFor({ orgId: org.id, listingId: listing.id, scope }));

  const win = dayWindow(new Date(), "Asia/Dubai");
  await timed("today's viewings", BUDGET.instant, () =>
    db.viewing.findMany({ where: { scheduledAt: { gte: win.start, lt: win.end } }, take: 50 }));

  await timed("open one person's whole history", BUDGET.quick, () =>
    db.message.findMany({
      where: { conversation: { leadId: convLeads[0]! } },
      orderBy: { sentAt: "desc" }, take: 60,
    }));

  await timed("count the book (a dashboard number)", BUDGET.quick, () =>
    db.lead.count({ where: { deletedAt: null } }));

  /* ----------------------------- clean up ---------------------------- */

  await root.organisation.deleteMany({ where: { slug: { startsWith: SLUG } } });

  /**
   * Say what this number is, and do not say what it is not.
   *
   * The first version printed "that is connection setup" under every
   * result. True for the *first* query in the process; false for the
   * one that showed 3,649ms at four times scale, ten queries in, on an
   * already-warm connection. That was a cold *buffer cache* — the first
   * full-sentence search reading three tables off disk — and calling it
   * connection setup would have sent the next person looking at the
   * pooler instead of the indexes.
   */
  const firstIsConnection = coldest.label === FIRST_MEASURED;
  console.log(`\n  Slowest first call: ${coldest.label} at ${coldest.ms}ms.`);
  console.log(firstIsConnection
    ? `  It is the first query in the process, so that is connection setup —\n` +
      `  which is what a cold serverless invocation pays, and why a pooler\n` +
      `  in front of Postgres is not optional.`
    : `  The connection was already warm, so this is the query itself reading\n` +
      `  cold buffers. If it grows, that is an index, not a pooler.`);

  console.log(
    fails.length
      ? `\n${fails.length} OVER BUDGET\n${fails.map((f) => `  · ${f}`).join("\n")}\n`
      : "\nEverything inside budget.\n"
  );
  process.exit(fails.length ? 1 : 0);
}

main().catch(fatal);
