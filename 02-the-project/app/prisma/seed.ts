import { PrismaClient, type LeadSource, type LeadStatus, type Role } from "@prisma/client";
import { seedStages, DEFAULT_STAGES } from "../src/server/lib/pipeline/defaults";
import { seedHours } from "../src/server/lib/hours/defaults";
import { seedQualification } from "../src/server/lib/assistant/qualification";
import { seedRoutingRule } from "../src/server/lib/routing/apply";
import { openKycFile } from "../src/server/lib/aml/open";

/**
 * A development brokerage, from nothing — or the one already there.
 *
 * ## Why this exists
 *
 * It did not, and that was the gap. Every check script created its own
 * fixtures as a side effect of the thing it was testing, so a database
 * that looked populated was really an accumulation of whatever had been
 * run against it that week. Nothing described the result and nothing
 * could rebuild it. When this container was recreated the pipeline
 * stages were gone, `/pipeline` had nothing to draw, and there was no
 * command to put them back.
 *
 * That is the shape CLAUDE.md keeps naming, pointed at the development
 * environment rather than at the product: **what writes the first row?**
 * For every screen in this app, until now, the answer was "run the
 * browser checks and hope".
 *
 * ## Adopt, do not duplicate — and this was learned the hard way
 *
 * The first version keyed the organisation on an id of its own
 * invention. The database already had a brokerage under a different id,
 * which was invisible at the time because a plain `PrismaClient` uses
 * the RLS-scoped role and `SELECT count(*)` with no `app.current_org`
 * set honestly returns zero. Reading that as "the database is empty"
 * produced a **second Marina Bay Properties**: the users were upserted
 * by email, found, and handed a second membership, and their sessions
 * were repointed at the new org — so the screens showed fixture data
 * while the real rows sat behind a tenant boundary.
 *
 * So: keyed on `slug`, which is unique, and every write below either
 * matches what is there or adds what is missing.
 *
 * ## What it is authoritative for, and what it leaves alone
 *
 * **Structure** — the org, the four role-holders, their session tokens,
 * the pipeline stages, one channel. Upserted every run, because the
 * browser checks depend on these existing and a half-configured
 * brokerage is the thing this file exists to prevent.
 *
 * **Content** — the leads. Created only when the org has none. Real dev
 * data accumulates against these screens and a seed that overwrites it
 * every run is a seed people stop running.
 *
 * Nothing here is random. The browser checks assert against real
 * numbers, and a seed whose output changes between runs cannot be
 * asserted against — which is how you end up with checks that only
 * confirm a page returned 200.
 *
 *     npm run db:seed
 */

/**
 * The unscoped connection, and this is the one place it is unarguable.
 *
 * `potato_app` may only touch rows belonging to `app.current_org`, and
 * there is no current org because the row that would define one is the
 * row being written. Seeding is pre-tenant by definition — the same
 * category as `crossTenant("pre-tenant")` in `db/client.ts`, which
 * resolves a membership before any org is known.
 *
 * Falling back to `DATABASE_URL` is deliberate: a developer who has not
 * split the roles gets a working seed, and `db/client.ts` already warns
 * at startup that RLS is enforcing nothing in that configuration.
 */
const url = process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL;
const db = new PrismaClient({ datasources: { db: { url } } });

/** Unique, and the reason this script adopts rather than duplicates. */
const SLUG = "seed-marina";

/**
 * The session tokens the browser checks send as a cookie.
 *
 * They live in the check scripts as string literals and had no rows
 * behind them — `scripts/roles.mjs` has been sending
 * `dev-session-viewer` and `dev-session-compliance_officer` at a
 * database where neither user existed, so two thirds of the permission
 * sweep was exercising the signed-out path. Named here so both ends of
 * that contract sit in one file.
 */
const PEOPLE: { token: string; email: string; name: string; role: Role }[] = [
  { token: "dev-session-token-ask-history",    email: "omar@marinabay.ae",   name: "Omar Haddad",   role: "OWNER" },
  { token: "dev-session-manager",              email: "lena@marinabay.ae",   name: "Lena Popescu",  role: "AGENT" },
  { token: "dev-session-viewer",               email: "viewer@marinabay.ae", name: "Aisha Rahman",  role: "VIEWER" },
  { token: "dev-session-compliance_officer",   email: "mco@marinabay.ae",    name: "Daniel Okafor", role: "COMPLIANCE_OFFICER" },
];

/** A second token for the same manager, used by the agent-view check. */
const EXTRA_TOKENS: { token: string; email: string }[] = [
  { token: "dev-session-token-agent-view", email: "lena@marinabay.ae" },
];

/**
 * Eleven leads, used only when the brokerage has none.
 *
 * The scores span all four bands plus unscored, because the leads
 * screen draws a distribution and a fixture where everything lands in
 * one band would make a broken chart look right. `score: null` is a
 * lead the nightly sweep has not reached — a real state, and the one
 * the strip reports separately rather than calling Cold.
 *
 * `talk` is what makes the four tabs on that screen mean anything. An
 * earlier draft gave nobody a conversation and three of the four went
 * degenerate: "Nobody's" and "Waiting on us" matched nothing, and
 * "Gone quiet" matched **all eleven**, because a lead with no
 * conversation at all is cold by definition. A tab that returns
 * everything looks exactly like a tab that is broken.
 */
const LEADS: {
  name: string; phone: string; score: number | null;
  status: LeadStatus; stage: string; source: LeadSource; budgetMax?: number;
  talk?: { unread?: number; daysAgo?: number };
  nobody?: boolean;
}[] = [
  { name: "Sarah Al Mansoori", phone: "+971501000001", score: 84, status: "NEGOTIATING",    stage: "Negotiating",    source: "REFERRAL",        budgetMax: 12_000_000, talk: { unread: 2, daysAgo: 0 } },
  { name: "James Whitfield",   phone: "+971501000002", score: 71, status: "VIEWING_BOOKED", stage: "Viewing booked", source: "PROPERTY_FINDER", budgetMax: 18_000_000, talk: { unread: 1, daysAgo: 1 } },
  { name: "Emma Lindqvist",    phone: "+971501000003", score: 65, status: "QUALIFYING",     stage: "Qualifying",     source: "REFERRAL",        budgetMax: 3_200_000,  talk: { unread: 3, daysAgo: 0 } },
  { name: "Michael Osei",      phone: "+971501000004", score: 63, status: "QUALIFYING",     stage: "Qualifying",     source: "BAYUT",           budgetMax: 2_500_000,  talk: { daysAgo: 2 } },
  { name: "Grace Oyelaran",    phone: "+971501000005", score: 52, status: "QUALIFYING",     stage: "Qualifying",     source: "WEBSITE",         budgetMax: 4_100_000,  talk: { daysAgo: 5 } },
  { name: "Peter Nkemelu",     phone: "+971501000006", score: 44, status: "QUALIFYING",     stage: "Qualifying",     source: "DUBIZZLE",        budgetMax: 1_900_000,  talk: { daysAgo: 21 } },
  { name: "Claudia Moreau",    phone: "+971501000007", score: 39, status: "QUALIFYING",     stage: "Qualifying",     source: "META_LEAD_ADS",   budgetMax: 2_800_000,  talk: { daysAgo: 30 }, nobody: true },
  { name: "Yusuf Demir",       phone: "+971501000008", score: 36, status: "QUALIFYING",     stage: "Qualifying",     source: "WHATSAPP_AD",     budgetMax: 5_600_000,  talk: { daysAgo: 9 } },
  { name: "Hannah Kruger",     phone: "+971501000009", score: 22, status: "QUALIFYING",     stage: "Qualifying",     source: "UNKNOWN",         budgetMax: 1_400_000,  talk: { daysAgo: 45 }, nobody: true },
  // UNRESPONSIVE, so "Waiting on us" must exclude it even though it has
  // unread inbound — the filter says `notIn` on purpose.
  { name: "David Chen",        phone: "+971501000010", score: 15, status: "UNRESPONSIVE",   stage: "Qualifying",     source: "WALK_IN",         budgetMax: 300_000,    talk: { unread: 1, daysAgo: 61 } },
  // No score: arrived after the last nightly run, and has never spoken.
  { name: "Rashid Al Falasi",  phone: "+971501000011", score: null, status: "NEW",          stage: "New",            source: "REFERRAL",        budgetMax: 11_600_000 },
];

async function main() {
  const org = await db.organisation.upsert({
    where: { slug: SLUG },
    update: {},
    create: { name: "Marina Bay Properties", slug: SLUG, timezone: "Asia/Dubai" },
  });

  const byEmail = new Map<string, string>();
  for (const p of PEOPLE) {
    const user = await db.user.upsert({
      where: { email: p.email },
      update: { name: p.name },
      create: { email: p.email, name: p.name, emailVerified: new Date() },
    });
    byEmail.set(p.email, user.id);
    await db.membership.upsert({
      where: { orgId_userId: { orgId: org.id, userId: user.id } },
      // Role left alone if the membership exists: a developer may have
      // changed it to test a permission, and this script is not the
      // authority on that.
      update: {},
      create: { orgId: org.id, userId: user.id, role: p.role },
    });
    await session(p.token, user.id, org.id);
  }
  for (const t of EXTRA_TOKENS) {
    const id = byEmail.get(t.email);
    if (id) await session(t.token, id, org.id);
  }

  /**
   * The four things signup does, done by signup's own code.
   *
   * This file first hand-rolled the six stages, and they were wrong in
   * a way nothing would have reported: `position: 0..5` where the real
   * defaults use `1000..6000` (leaving no room to drop a stage between
   * two others, which is the whole point of the gap), and
   * `staleAfterDays` unset, so the board's "untouched for N days" flag
   * had no threshold to fire against on any stage.
   *
   * A fixture that differs from what the product creates is worse than
   * no fixture: every screen looks right and the checks pass against a
   * brokerage no signup could produce. So the seed calls the same
   * functions `billing/signup.ts` calls, and they own the content.
   *
   * All four are idempotent by their own keys — `seedStages` uses
   * `skipDuplicates`, `seedQualification` returns early on an active
   * profile, `seedRoutingRule` returns early when any rule exists —
   * which is what lets this run against a brokerage that is already
   * half configured, and fill only the half that is missing.
   *
   * **`seedRoutingRule` was the one that got left out**, and it cost
   * exactly what this comment predicts. Signup calls four; this file
   * called three; so the development brokerage was the one brokerage in
   * existence with no assignment rule. `assignmentFor` did the right
   * thing with that — "no routing rule matched", straight to the shared
   * pool — and the result was that every WhatsApp lead in the demo
   * arrived belonging to nobody, with no `LeadOwnership` row to explain
   * why. `check:routing` says so in five assertions.
   */
  await db.$transaction(async (tx) => {
    await seedStages(tx, org.id);
    await seedHours(tx, org.id);
    await seedRoutingRule(tx, org.id);
    await seedQualification(tx, org.id);
  });

  const rows = await db.pipelineStage.findMany({
    where: { orgId: org.id }, select: { id: true, name: true },
  });
  const stages = new Map(rows.map((r) => [r.name, r.id]));

  // Not a real connection — `secretRef` is null, so nothing here can
  // send. It exists so conversations have a channel to hang off.
  const channel = await db.channel.upsert({
    where: { orgId_type_identifier: { orgId: org.id, type: "WHATSAPP", identifier: "+971500000000" } },
    update: {},
    create: {
      orgId: org.id, type: "WHATSAPP", label: "Main sales number",
      identifier: "+971500000000", active: true,
    },
  });

  const owner = byEmail.get("omar@marinabay.ae")!;
  const agent = byEmail.get("lena@marinabay.ae")!;

  /**
   * Leads only when there are none.
   *
   * The org may already hold real dev data — it did, and overwriting it
   * is how a seed becomes something people stop running.
   */
  const existing = await db.lead.count({ where: { orgId: org.id, deletedAt: null } });
  if (existing === 0) {
    for (const [i, l] of LEADS.entries()) {
      const lead = await db.lead.create({
        data: {
          orgId: org.id, name: l.name, phone: l.phone, score: l.score,
          status: l.status, stageId: stages.get(l.stage), source: l.source,
          // Fils, never AED — the one unit in this schema, and the
          // reason `lib/money.ts` is a single function.
          budgetMaxFils: l.budgetMax ? BigInt(l.budgetMax) * 100n : null,
          // Two left deliberately unowned so "Nobody's" is not empty.
          assignedToId: l.nobody ? null : i % 3 === 0 ? agent : owner,
          position: i,
        },
      });
      if (l.talk) {
        await db.conversation.create({
          data: {
            orgId: org.id, leadId: lead.id, channelId: channel.id,
            unreadCount: l.talk.unread ?? 0, lastInboundAt: daysAgo(l.talk.daysAgo ?? 0),
          },
        });
      }
    }
  } else {
    /**
     * Attach whatever is there to a stage.
     *
     * The container came back with eleven leads and no pipeline stages,
     * so every one had `stageId: null` and the board drew empty columns
     * over a full database. Matching on `maps` puts each lead in the
     * stage its status already says it is in.
     */
    for (const st of DEFAULT_STAGES) {
      await db.lead.updateMany({
        where: { orgId: org.id, status: st.maps, stageId: null },
        data: { stageId: stages.get(st.name) },
      });
    }
  }

  /**
   * Re-anchor the demo clock, on every run rather than only the first.
   *
   * ## The fixture was decaying on its own
   *
   * `lastInboundAt` is written once, as an absolute date, and then real
   * time keeps moving. The leads screen calls anything with no inbound
   * message for fourteen days "gone quiet", so a brokerage seeded three
   * weeks ago reads as **eleven of eleven gone quiet** — every lead
   * dead, on the first screen anybody is shown. Nothing had changed and
   * nothing was broken; the fixture simply aged past its own threshold.
   *
   * The `existing === 0` guard above is right — overwriting real
   * development data is how a seed becomes something people stop
   * running — but it also meant the one part of the fixture that *must*
   * move with the calendar never did. So the times are re-stated every
   * run while the rows themselves are left alone.
   *
   * The two deliberately unowned leads are restored here for the same
   * reason: the checks assign leads as a side effect of testing routing,
   * and a "Nobody's" tab that has quietly filled in cannot demonstrate
   * the thing it exists to show.
   */
  const spread = await db.lead.findMany({
    where: { orgId: org.id, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, conversation: { select: { id: true } } },
  });
  for (const [i, l] of spread.entries()) {
    if (!l.conversation) continue;
    // A working brokerage is a spread, not a cohort: a couple of live
    // conversations, most within the fortnight, and two genuinely stale
    // so "gone quiet" has something true to find.
    const age = [0, 1, 2, 3, 5, 8, 11, 13, 21, 34, 61][i % 11] ?? 7;
    await db.conversation.update({
      where: { id: l.conversation.id },
      data: { lastInboundAt: daysAgo(age) },
    });
  }
  /**
   * And the "Nobody's" tab, restored by shape rather than by row.
   *
   * `LEADS` marks two entries `nobody: true`, and matching on their
   * phone numbers found nothing — because **the leads in the development
   * database are not the leads this file describes.** They carry
   * `+971500000202`, `+97155500101` and so on; `LEADS` carries
   * `+9715010000NN`. They are survivors of an older seed, kept alive by
   * the `existing === 0` guard above, which is the same "least reliable
   * form of fixture there is" the listings comment below records.
   *
   * That is worth knowing on its own: anybody reading this file to learn
   * what the demo contains is reading a description of eleven leads that
   * are not there. Replacing them is a bigger decision than a seed run
   * should take on its own — they may be somebody's working data — so
   * this restores the *shape* the fixture is supposed to have and says
   * so, rather than quietly deleting rows.
   *
   * Two unowned, and only when none are: the check suites assign leads
   * as a side effect of testing routing, so this fills back in what they
   * consume without overruling a developer who has deliberately left
   * some unassigned.
   */
  /**
   * A funnel, rather than a heap in one column.
   *
   * Nine of eleven leads sat in "Qualifying" with "New", "Won" and
   * "Lost" empty. On a desktop that is a board with one tall column; on
   * a phone it is worse, because `board.tsx` is a snap carousel at 86vw
   * per stage and the first stage is the one it opens on — so the
   * pipeline's first impression was **a blank screen you have to swipe
   * past**.
   *
   * Status and stage are moved together. They are two expressions of the
   * same fact — `DEFAULT_STAGES` maps one onto the other, and the adopt
   * branch above relies on that mapping — so setting a stage without its
   * status leaves a lead the board draws in one place and every status
   * filter counts in another.
   *
   * A won and a lost deal are worth having for their own reason: they are
   * the two columns nobody builds fixtures for, and they are where the
   * "closed" states of the board and the reports are proved.
   */
  const funnel: [LeadStatus, string][] = [
    ["NEW", "New"], ["NEW", "New"],
    ["QUALIFYING", "Qualifying"], ["QUALIFYING", "Qualifying"], ["QUALIFYING", "Qualifying"],
    ["VIEWING_BOOKED", "Viewing booked"], ["VIEWING_BOOKED", "Viewing booked"],
    ["NEGOTIATING", "Negotiating"], ["NEGOTIATING", "Negotiating"],
    ["WON", "Won"],
    ["LOST", "Lost"],
  ];
  /**
   * Leads with something unread go to the front, and that is not
   * cosmetic.
   *
   * The funnel ends in WON and LOST, and "waiting on us" counts a lead
   * only while its status is none of WON, LOST or UNRESPONSIVE. The
   * first version of this assigned in `createdAt` order, dropped the one
   * lead carrying unread messages into Lost, and took that tab from 1 to
   * 0 — trading one degenerate tab for another, which the seed's own
   * report caught on the next run.
   *
   * Sorting by unread first puts every live conversation in an active
   * stage and leaves the closed states for leads with nothing waiting,
   * which is also what a real board looks like.
   */
  const inOrder = (await db.lead.findMany({
    where: { orgId: org.id, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { id: true, conversation: { select: { unreadCount: true } } },
  })).sort((a, b) => (b.conversation?.unreadCount ?? 0) - (a.conversation?.unreadCount ?? 0));
  for (const [i, l] of inOrder.entries()) {
    const f = funnel[i % funnel.length];
    if (!f) continue;
    const [status, stageName] = f;
    const stageId = stages.get(stageName);
    if (!stageId) continue;
    await db.lead.update({ where: { id: l.id }, data: { status, stageId } });
  }

  const nobodyWanted = LEADS.filter((l) => l.nobody).length;
  const nobodyNow = await db.lead.count({
    where: { orgId: org.id, deletedAt: null, assignedToId: null },
  });
  if (nobodyNow === 0 && nobodyWanted > 0) {
    const pick = await db.lead.findMany({
      where: { orgId: org.id, deletedAt: null },
      orderBy: { createdAt: "desc" },
      take: nobodyWanted,
      select: { id: true },
    });
    await db.lead.updateMany({
      where: { id: { in: pick.map((l) => l.id) } },
      data: { assignedToId: null },
    });
  }

  await listings(org.id);

  await compliance(org.id);
  await commissions(org.id);
  await blackbook(org.id, owner, agent);
  await register(org.id, owner, agent);

  await report(org.id, org.name, existing === 0);
}

/**
 * Properties to advertise.
 *
 * **The seed created none**, and it took the listing feed to notice: a
 * freshly seeded brokerage had eleven leads, six stages, seven people
 * and nothing to sell. `/listings` drew an empty screen and the feed
 * served a document with `count="0"`, which is indistinguishable from a
 * broken feed at exactly the moment somebody is being shown one.
 *
 * The three that used to be in the development database came from an
 * older seed that no longer exists — a bundle left behind in `.tmp`.
 * They survived because nothing had reset that database in a while,
 * which is the least reliable form of fixture there is.
 *
 * ## Every one carries a permit, and that is the point
 *
 * A listing with no Trakheesi number is withheld from the feed and
 * refused by the publish queue, because advertising without one is a
 * fineable offence rather than a portal preference. Seeding unpermitted
 * listings would therefore seed a demo where nothing can be advertised
 * and the reason is three files away. One is deliberately left expiring
 * inside the warning window so `listings.permit-expiry` has something
 * true to find.
 */
async function listings(orgId: string) {
  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);
  const rows = [
    {
      reference: "DH-101", title: "Four-bedroom villa, Dubai Hills Grove",
      community: "Dubai Hills Estate", building: "Grove",
      bedrooms: 4, bathrooms: 5, areaSqft: 4100,
      priceFils: 11_500_000n * 100n, purpose: "SALE" as const,
      permitNumber: "7112843", permitExpiresAt: inDays(210),
      en: "A four-bedroom villa on Grove, backing onto the park run. Twin " +
          "living areas, a maid's room off the kitchen and covered parking for two.",
    },
    {
      reference: "MG-202", title: "Two-bedroom apartment, Marina Gate 1",
      community: "Dubai Marina", building: "Marina Gate 1",
      bedrooms: 2, bathrooms: 3, areaSqft: 1320,
      priceFils: 3_150_000n * 100n, purpose: "SALE" as const,
      permitNumber: "7238190", permitExpiresAt: inDays(96),
      en: "A two-bedroom on a high floor of Marina Gate 1, facing the marina. " +
          "Fitted kitchen, floor-to-ceiling glass, one allocated bay.",
    },
    {
      reference: "AR-303", title: "Three-bedroom townhouse, Arabian Ranches III",
      community: "Arabian Ranches III", building: "Joy",
      bedrooms: 3, bathrooms: 4, areaSqft: 2100,
      priceFils: 2_950_000n * 100n, purpose: "SALE" as const,
      // Inside the renewal warning window on purpose, so the nightly
      // permit sweep has a real row to find rather than reporting
      // success for finding nothing — the exact failure documented
      // against `documents/` in CLAUDE.md.
      permitNumber: "7301556", permitExpiresAt: inDays(19),
      en: "A three-bedroom in Joy, mid-terrace, opposite the pool. Landscaped " +
          "rear garden and a converted study on the ground floor.",
    },
    {
      reference: "JVC-404", title: "One-bedroom apartment, Jumeirah Village Circle",
      community: "Jumeirah Village Circle", building: "Bloom Towers",
      bedrooms: 1, bathrooms: 2, areaSqft: 780,
      priceFils: 95_000n * 100n, purpose: "RENT" as const,
      permitNumber: "7419002", permitExpiresAt: inDays(150),
      en: "A one-bedroom in Bloom Towers, unfurnished, available now. " +
          "Chiller free, one parking space, gym and pool in the building.",
    },
  ];

  for (const r of rows) {
    const { en, ...listing } = r;
    await db.listing.upsert({
      where: { orgId_reference: { orgId, reference: r.reference } },
      update: {
        // Idempotent, and it repairs rather than skips: a database
        // carrying the old permit-less rows gets them completed rather
        // than left broken because the reference already existed.
        permitNumber: r.permitNumber,
        permitExpiresAt: r.permitExpiresAt,
        reraBrokerCard: "26542",
        descriptions: { en, photos: PHOTOS },
      },
      create: {
        orgId, ...listing, status: "AVAILABLE",
        reraBrokerCard: "26542",
        descriptions: { en, photos: PHOTOS },
      },
    });
  }
}

/**
 * Four, because Property Finder and Bayut both refuse a listing with
 * fewer. They are references rather than files — nothing here uploads —
 * so the count is what is being seeded, not the images.
 */
const PHOTOS = ["01.jpg", "02.jpg", "03.jpg", "04.jpg"];

async function session(token: string, userId: string, orgId: string) {
  // Thirty days, not a year: the browser checks run against whatever
  // this seed last produced, and a session that quietly expires turns
  // every screen assertion into a redirect to /sign-in with no clue why.
  const expires = new Date(Date.now() + 30 * 86_400_000);
  await db.session.upsert({
    where: { sessionToken: token },
    update: { userId, activeOrgId: orgId, expires },
    create: { sessionToken: token, userId, activeOrgId: orgId, expires },
  });
}

/**
 * Print what the four tabs on the leads screen will show.
 *
 * Not decoration. Half this file's purpose is making each filter
 * distinct, and the only way to know it still does after an edit is to
 * count them — a tab quietly collapsing to "everything" is exactly the
 * failure the first draft shipped with.
 */
async function report(orgId: string, name: string, fresh: boolean) {
  const where = { orgId, deletedAt: null };
  const leads = await db.lead.count({ where });
  const counts = {
    stages: await db.pipelineStage.count({ where: { orgId } }),
    people: await db.membership.count({ where: { orgId } }),
    unstaged: await db.lead.count({ where: { ...where, stageId: null } }),
    nobody: await db.lead.count({ where: { ...where, assignedToId: null } }),
    waiting: await db.lead.count({
      where: {
        ...where, status: { notIn: ["WON", "LOST", "UNRESPONSIVE"] },
        conversation: { is: { unreadCount: { gt: 0 } } },
      },
    }),
    quiet: await db.lead.count({
      where: {
        ...where, status: { notIn: ["WON", "LOST"] },
        OR: [
          { conversation: { is: { lastInboundAt: { lt: daysAgo(14) } } } },
          { conversation: { is: null } },
        ],
      },
    }),
  };

  console.log(
    `${fresh ? "Seeded" : "Adopted"} ${name}: ${leads} leads, ` +
    `${counts.stages} stages, ${counts.people} people.\n` +
    `  tabs — nobody's ${counts.nobody}, waiting on us ${counts.waiting}, ` +
    `gone quiet ${counts.quiet}`
  );
  if (counts.unstaged > 0) {
    console.warn(`  ! ${counts.unstaged} lead(s) still have no pipeline stage — the board will under-report.`);
  }
  for (const [tab, n] of [["nobody's", counts.nobody], ["waiting on us", counts.waiting],
                          ["gone quiet", counts.quiet]] as const) {
    if (n === 0 || n === leads) {
      console.warn(`  ! "${tab}" matches ${n} of ${leads} — that tab cannot catch a regression.`);
    }
  }
}

/**
 * Money the brokerage is owed, against the deals that already exist.
 *
 * ## Why an empty screen here is worse than an empty screen elsewhere
 *
 * `/commission` rendered **AED 0.00 owed, AED 0.00 paid, AED 0.00
 * forecast** on a brokerage with three live deals worth eight figures.
 * The screen was right — no `Commission` row had ever been written — and
 * an agent seeing three zeros over a full pipeline concludes the feature
 * does not work, not that the fixture is thin. Commission is also the
 * thing a Dubai agent checks first and argues about most, so it is the
 * worst screen in the product to show empty.
 *
 * One commission per deal, at the 2% Dubai norm, in the three states
 * that actually differ: forecast on the deal that has not completed,
 * invoiced on the one waiting to be paid, received on the one that has.
 * A screen that shows three rows all in one state cannot demonstrate the
 * difference between what you are owed and what you have.
 *
 * Splits are the half brokerages disagree over, so each carries two: the
 * agent's share and what the brokerage keeps. `shareBp` sums to 10,000
 * on every row — a split that does not add up is the bug this shape
 * exists to make visible.
 */
async function commissions(orgId: string) {

  const deals = await db.deal.findMany({
    where: { orgId },
    orderBy: { reference: "asc" },
    select: { id: true, valueFils: true },
  });
  /**
   * Both people, and that is not padding.
   *
   * `commission.mine` filters on `userId: ctx.userId` — the page is
   * "what *you* are owed", not the brokerage's book. The first version
   * of this fixture gave every split to the first AGENT, so the screen
   * stayed at AED 0.00 for the owner the development session signs in
   * as, and looked exactly as broken as it had before any of this was
   * seeded.
   *
   * A manager override alongside the selling agent's share is also the
   * realistic arrangement in a small Dubai brokerage, where the owner
   * lists as well as runs the place.
   */
  const people = await db.membership.findMany({
    where: { orgId, role: { in: ["AGENT", "OWNER", "ADMIN"] } },
    select: { userId: true, role: true },
  });
  const seller = people.find((m) => m.role === "AGENT")?.userId ?? null;
  const manager = people.find((m) => m.role !== "AGENT")?.userId ?? null;

  /**
   * Three states, chosen so all three headline figures are non-zero.
   *
   * The first arrangement was received / invoiced / forecast, which is
   * the tidy list — and it rendered a page headed **"What you're owed"**
   * above **"Owed to you AED 0.00"**. `commission.mine` counts a split
   * as owed only when the commission is RECEIVED and the split has not
   * been paid out, so an INVOICED row contributes to nothing an agent
   * can see.
   *
   * Two received commissions fixes it, and the arrangement is the real
   * one: the brokerage has been paid on both, has run the payout on the
   * older, and has not on the newer. That is the state an agent actually
   * checks this page for. The rows still read three different words —
   * paid, received, forecast — so the list has not lost anything.
   */
  const states = [
    { status: "RECEIVED" as const, invoiced: 34, received: 12, payOut: true },
    { status: "RECEIVED" as const, invoiced: 9,  received: 3,  payOut: false },
    { status: "FORECAST" as const, invoiced: null, received: null, payOut: false },
  ];

  for (const [i, d] of deals.entries()) {
    // Per deal, not "does any commission exist". A whole-table guard
    // hands the fixture's fate to whatever ran last — `check:blocking`
    // clears the document register and leaves one row of its own, which
    // was enough to make the seed skip the register entirely and leave
    // a demo with a single document in it.
    if (await db.commission.count({ where: { orgId, dealId: d.id } })) continue;
    const st = states[i % states.length]!;
    const rateBp = 200;                                   // 2%, the Dubai norm
    const gross = (d.valueFils * BigInt(rateBp)) / 10_000n;
    const vat = gross / 20n;                              // 5% UAE VAT
    const net = gross;                                    // VAT is on top, not deducted

    const c = await db.commission.create({
      data: {
        orgId, dealId: d.id, rateBp,
        grossFils: gross, vatFils: vat, netFils: net,
        status: st.status,
        invoicedAt: st.invoiced === null ? null : daysAgo(st.invoiced),
        receivedAt: st.received === null ? null : daysAgo(st.received),
      },
      select: { id: true },
    });

    // 50 / 5 / 45, which sums to 10,000 basis points exactly. A split
    // that does not add up is the bug this shape exists to make visible,
    // so the numbers are chosen to be checkable rather than round.
    for (const sp of [
      { role: "SELLING_AGENT" as const, userId: seller, shareBp: 5000 },
      { role: "MANAGER" as const, userId: manager, shareBp: 500 },
      { role: "BROKERAGE" as const, userId: null, shareBp: 4500 },
    ]) {
      if (sp.role !== "BROKERAGE" && !sp.userId) continue;
      await db.commissionSplit.create({
        data: {
          orgId, commissionId: c.id, role: sp.role, userId: sp.userId,
          externalName: sp.userId ? null : "Marina Bay Properties",
          shareBp: sp.shareBp,
          amountFils: (net * BigInt(sp.shareBp)) / 10_000n,
          paidAt: st.payOut ? daysAgo(st.received ?? 0) : null,
        },
      });
    }
  }
}

/**
 * An agent's own contacts.
 *
 * `/blackbook` said "Nobody yet" under copy that is one of this
 * product's better arguments — the page no manager can see, that exports
 * with the agent if they leave, while the client records and the
 * compliance file stay with the brokerage. Making that argument over an
 * empty list is the weakest possible way to make it.
 *
 * **Two agents, deliberately.** The whole claim is that this page is
 * private, and a fixture with one agent's entries cannot show that the
 * other agent does not see them — which is exactly what
 * `check:visibility` asserts and what somebody will ask about in a
 * demonstration.
 *
 * Standalone people rather than links to leads: a mortgage broker and a
 * conveyancer are not in anybody's pipeline, and they are the reason an
 * agent keeps a book at all.
 */
async function blackbook(orgId: string, owner: string, agent: string) {

  const entries = [
    { agentId: agent, standaloneName: "Faisal Rahman", standalonePhone: "+971502223301",
      nickname: "Faisal — ENBD", tags: ["mortgage broker", "fast"], starred: true,
      privateNote: "Pre-approves in 48h. Ask for him by name, not the branch.", touched: 2 },
    { agentId: agent, standaloneName: "Marta Nowak", standalonePhone: "+971502223302",
      tags: ["conveyancer"], starred: false,
      privateNote: "Handles the DLD appointment herself. Slower in August.", touched: 9 },
    { agentId: agent, standaloneName: "Omar Sadiq", standalonePhone: "+971502223303",
      tags: ["photographer", "same day"], starred: false, touched: 21 },
    // The other agent's book, which is the point of the page.
    { agentId: owner, standaloneName: "Priya Menon", standalonePhone: "+971502223304",
      nickname: "Priya — Emaar", tags: ["developer", "off-plan"], starred: true,
      privateNote: "Holds back two units a launch. Worth a call before release.", touched: 4 },
  ];

  for (const e of entries) {
    const { touched, ...rest } = e;
    if (await db.blackbookEntry.count({
      where: { orgId, agentId: e.agentId, standalonePhone: e.standalonePhone },
    })) continue;
    await db.blackbookEntry.create({
      data: { orgId, ...rest, lastTouched: daysAgo(touched) },
    });
  }
}

/**
 * The document register, which is really an expiry register.
 *
 * `/documents` said "Nothing recorded yet" under copy explaining that a
 * broker card takes sixty days to renew and warns you about none of it.
 * The nightly `documents.expiry` sweep therefore had nothing to find and
 * reported success every morning — the shape CLAUDE.md names, pointed at
 * the fixture rather than at the product.
 *
 * The dates are chosen so each branch of that sweep has a true case:
 * one card comfortably valid, one inside the sixty-day warning window,
 * one already lapsed, and the brokerage licence. The lapsed card is the
 * one `check:blocking` needs — a deal cannot be moved on while the
 * agent's card has expired, and that assertion needs a real expired row
 * rather than one the check writes for itself and then deletes.
 *
 * `storageRef` is null on every one, deliberately: the register is a
 * list of dates and numbers first and a filing cabinet second, and
 * requiring a scan to record an expiry is how the alarm stays silent
 * until somebody finds a photocopier.
 */
async function register(orgId: string, owner: string, agent: string) {

  const inDays = (n: number) => new Date(Date.now() + n * 86_400_000);
  const docs = [
    { ownerType: "USER" as const, ownerId: agent, type: "RERA_BROKER_CARD" as const,
      reference: "BRN-41552", issuedAt: daysAgo(500), expiresAt: inDays(240), verified: true },
    // Inside the sixty-day window, so the nightly sweep has something true to say.
    { ownerType: "USER" as const, ownerId: owner, type: "RERA_BROKER_CARD" as const,
      reference: "BRN-38104", issuedAt: daysAgo(700), expiresAt: inDays(41), verified: true },
    { ownerType: "ORGANISATION" as const, ownerId: orgId, type: "BROKERAGE_LICENCE" as const,
      reference: "CN-1188472", issuedAt: daysAgo(300), expiresAt: inDays(120), verified: true },
    { ownerType: "ORGANISATION" as const, ownerId: orgId, type: "TRAKHEESI_PERMIT" as const,
      reference: "7654321", issuedAt: daysAgo(80), expiresAt: inDays(15), verified: false },
  ];

  for (const d of docs) {
    const { verified, ...rest } = d;
    if (await db.document.count({ where: { orgId, reference: d.reference } })) continue;
    await db.document.create({
      data: {
        orgId, ...rest,
        verifiedAt: verified ? daysAgo(20) : null,
        verifiedById: verified ? owner : null,
      },
    });
  }
}

/**
 * A compliance file, opened the way the product opens one.
 *
 * ## Why this was the last empty screen
 *
 * `/compliance` listed nothing and `/compliance/[kycId]` had **never
 * rendered once** — `browser:screens` skipped it every run with "no row
 * to fill [kycId]", so the detail view of the feature this product
 * competes on had never been looked at by anybody.
 *
 * The write path was never missing. `openKycFile` is called when an
 * offer is accepted and by the button on the inbox panel; the
 * development brokerage simply had no accepted offer. So this calls the
 * same function `negotiate.ts` calls rather than writing a `KycRecord`
 * by hand — the discipline the stages, hours and routing rule already
 * follow, for the reason stated up there: a fixture that differs from
 * what the product creates is worse than no fixture.
 *
 * ## Two files, in the two states that differ
 *
 * One left at `NOT_STARTED`, which is what `openKycFile` produces and
 * therefore what a real file looks like on day one. One carrying a
 * screening that came back `ERROR`.
 *
 * `ERROR` rather than a match, and deliberately: there is no screening
 * provider and there cannot be one until somebody signs with Dow Jones
 * or Refinitiv, so `ERROR` with `provider: "none"` is the honest state
 * of every file in this product today. It is also the state the desk
 * exists to surface — a file nobody has checked, sitting where a
 * compliance officer will see it, rather than an empty queue that reads
 * as a clean shop.
 */
async function compliance(orgId: string) {
  const leads = await db.lead.findMany({
    where: { orgId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    take: 2,
    select: { id: true, name: true },
  });
  if (leads.length < 2) return;

  for (const l of leads) {
    await openKycFile(db, { orgId, leadId: l.id });
  }

  const second = await db.kycRecord.findUnique({
    where: { leadId: leads[1]!.id },
    select: { id: true, legalName: true },
  });
  if (second && !(await db.screening.count({ where: { kycId: second.id } }))) {
    await db.screening.create({
      data: {
        orgId,
        kycId: second.id,
        nameChecked: second.legalName,
        // No provider is registered, so this is what the product records.
        // A stub returning "no hits" would write CLEAR and put a check
        // that never happened into the file an inspector reads.
        provider: "none",
        result: "ERROR",
        lists: [],
        screenedAt: daysAgo(2),
      },
    });
  }
}

function daysAgo(n: number) {
  return new Date(Date.now() - n * 86_400_000);
}

main()
  .then(() => db.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await db.$disconnect();
    process.exit(1);
  });
