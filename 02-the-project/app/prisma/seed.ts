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

  /**
   * The other thirty-one, and the reason they are here.
   *
   * Eleven leads is a demonstration of the schema. It is not a
   * brokerage, and every screen said so out loud: "1 on the table",
   * "1 person", "4 live", "3 at risk of 3". A brokerage owner being
   * shown the product reads that as a toy, and no amount of layout work
   * fixes a screen with three rows on it.
   *
   * Forty-two is roughly a month of enquiries for a five-agent Dubai
   * firm, and the shape matters as much as the number: most sit in
   * Qualifying, a handful are actually moving, a few are won, a few are
   * lost, and a long tail has gone quiet. A fixture where every lead is
   * warm and progressing is as unconvincing as one with three rows,
   * and it makes a broken filter look right.
   *
   * The eleven above are unchanged and stay first. Several checks name
   * them — David Chen is UNRESPONSIVE *with* unread inbound, which is
   * what proves "Waiting on us" uses `notIn` rather than just a count;
   * Rashid has no score at all; two are deliberately unassigned. Adding
   * to the end cannot disturb any of that.
   */
  { name: "Aditi Ramanathan", phone: "+971501000012", score: 79, status: "NEGOTIATING",    stage: "Negotiating",    source: "PROPERTY_FINDER", budgetMax: 6_400_000,  talk: { unread: 1, daysAgo: 0 } },
  { name: "Tom Bradley",      phone: "+971501000013", score: 74, status: "VIEWING_BOOKED", stage: "Viewing booked", source: "BAYUT",           budgetMax: 4_800_000,  talk: { daysAgo: 1 } },
  { name: "Noura Al Suwaidi", phone: "+971501000014", score: 81, status: "VIEWING_BOOKED", stage: "Viewing booked", source: "REFERRAL",        budgetMax: 15_000_000, talk: { daysAgo: 0 } },
  { name: "Marco Rossi",      phone: "+971501000015", score: 68, status: "QUALIFIED",      stage: "Qualifying",     source: "WEBSITE",         budgetMax: 2_300_000,  talk: { unread: 2, daysAgo: 1 } },
  { name: "Priya Menon",      phone: "+971501000016", score: 66, status: "QUALIFIED",      stage: "Qualifying",     source: "PROPERTY_FINDER", budgetMax: 3_900_000,  talk: { daysAgo: 2 } },
  { name: "Ahmed Al Blooshi", phone: "+971501000017", score: 62, status: "QUALIFYING",     stage: "Qualifying",     source: "WHATSAPP_AD",     budgetMax: 8_200_000,  talk: { daysAgo: 3 } },
  { name: "Sofia Petrova",    phone: "+971501000018", score: 58, status: "QUALIFYING",     stage: "Qualifying",     source: "META_LEAD_ADS",   budgetMax: 1_750_000,  talk: { daysAgo: 4 } },
  { name: "Daniel Mwangi",    phone: "+971501000019", score: 55, status: "QUALIFYING",     stage: "Qualifying",     source: "DUBIZZLE",        budgetMax: 2_100_000,  talk: { daysAgo: 6 } },
  { name: "Fatima Al Zaabi",  phone: "+971501000020", score: 73, status: "NEGOTIATING",    stage: "Negotiating",    source: "REFERRAL",        budgetMax: 9_500_000,  talk: { unread: 1, daysAgo: 1 } },
  { name: "Oliver Grant",     phone: "+971501000021", score: 49, status: "QUALIFYING",     stage: "Qualifying",     source: "BAYUT",           budgetMax: 5_200_000,  talk: { daysAgo: 7 } },
  { name: "Lucia Fernandez",  phone: "+971501000022", score: 47, status: "QUALIFYING",     stage: "Qualifying",     source: "WEBSITE",         budgetMax: 1_600_000,  talk: { daysAgo: 8 } },
  { name: "Karim Haddad",     phone: "+971501000023", score: 43, status: "QUALIFYING",     stage: "Qualifying",     source: "WALK_IN",         budgetMax: 7_300_000,  talk: { daysAgo: 10 } },
  { name: "Wei Zhang",        phone: "+971501000024", score: 41, status: "QUALIFYING",     stage: "Qualifying",     source: "PROPERTY_FINDER", budgetMax: 22_000_000, talk: { daysAgo: 11 } },
  { name: "Elena Novak",      phone: "+971501000025", score: 38, status: "QUALIFYING",     stage: "Qualifying",     source: "META_LEAD_ADS",   budgetMax: 950_000,    talk: { daysAgo: 12 }, nobody: true },
  { name: "Samuel Adeyemi",   phone: "+971501000026", score: 34, status: "QUALIFYING",     stage: "Qualifying",     source: "DUBIZZLE",        budgetMax: 1_200_000,  talk: { daysAgo: 15 } },
  { name: "Hind Al Marri",    phone: "+971501000027", score: 31, status: "QUALIFYING",     stage: "Qualifying",     source: "WHATSAPP_AD",     budgetMax: 4_400_000,  talk: { daysAgo: 17 } },
  { name: "Julien Perrot",    phone: "+971501000028", score: 28, status: "QUALIFYING",     stage: "Qualifying",     source: "UNKNOWN",         budgetMax: 2_650_000,  talk: { daysAgo: 19 } },
  { name: "Rania Khoury",     phone: "+971501000029", score: 26, status: "QUALIFYING",     stage: "Qualifying",     source: "WEBSITE",         budgetMax: 3_400_000,  talk: { daysAgo: 23 } },
  { name: "Victor Oyelowo",   phone: "+971501000030", score: 19, status: "QUALIFYING",     stage: "Qualifying",     source: "BAYUT",           budgetMax: 1_050_000,  talk: { daysAgo: 28 } },
  { name: "Mei Lin",          phone: "+971501000031", score: 17, status: "QUALIFYING",     stage: "Qualifying",     source: "META_LEAD_ADS",   budgetMax: 780_000,    talk: { daysAgo: 33 }, nobody: true },
  { name: "Abdullah Al Nuaimi", phone: "+971501000032", score: 12, status: "UNRESPONSIVE", stage: "Qualifying",     source: "DUBIZZLE",        budgetMax: 1_850_000,  talk: { daysAgo: 52 } },
  { name: "Greta Lindholm",   phone: "+971501000033", score: 9,  status: "UNRESPONSIVE",   stage: "Qualifying",     source: "UNKNOWN",         budgetMax: 2_200_000,  talk: { daysAgo: 71 } },
  // Won: the deals a manager points at, and what the commission screen
  // is drawing its figures from.
  { name: "Charlotte Dubois", phone: "+971501000034", score: 91, status: "WON",            stage: "Won",            source: "REFERRAL",        budgetMax: 18_000_000, talk: { daysAgo: 14 } },
  { name: "Ravi Shankar",     phone: "+971501000035", score: 88, status: "WON",            stage: "Won",            source: "PROPERTY_FINDER", budgetMax: 3_100_000,  talk: { daysAgo: 26 } },
  { name: "Mariam Al Hashmi", phone: "+971501000036", score: 86, status: "WON",            stage: "Won",            source: "REFERRAL",        budgetMax: 11_500_000, talk: { daysAgo: 38 } },
  // Lost, with a spread of reasons a real book has. A pipeline with no
  // Lost column is the one nobody believes.
  { name: "Ben Carter",       phone: "+971501000037", score: 24, status: "LOST",           stage: "Lost",           source: "WEBSITE",         budgetMax: 2_400_000,  talk: { daysAgo: 40 } },
  { name: "Anika Sharma",     phone: "+971501000038", score: 33, status: "LOST",           stage: "Lost",           source: "BAYUT",           budgetMax: 5_900_000,  talk: { daysAgo: 47 } },
  { name: "Jonas Weber",      phone: "+971501000039", score: 21, status: "LOST",           stage: "Lost",           source: "DUBIZZLE",        budgetMax: 1_300_000,  talk: { daysAgo: 55 } },
  // New today: no score yet, because the sweep runs overnight. Three of
  // them, so the New column is not a single card.
  { name: "Layla Al Ameri",   phone: "+971501000040", score: null, status: "NEW",          stage: "New",            source: "PROPERTY_FINDER", budgetMax: 7_800_000,  talk: { unread: 1, daysAgo: 0 } },
  { name: "Stefan Muller",    phone: "+971501000041", score: null, status: "NEW",          stage: "New",            source: "WHATSAPP_AD",     budgetMax: 2_900_000,  talk: { unread: 1, daysAgo: 0 } },
  { name: "Zeinab Farouk",    phone: "+971501000042", score: null, status: "NEW",          stage: "New",            source: "WALK_IN",         budgetMax: 4_600_000 },
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

  /**
   * The brokerage's own WhatsApp number.
   *
   * Still not a real connection — `secretRef` is null, so nothing here
   * can send. It exists so conversations have a channel to hang off,
   * and so every screen that shows "our number" shows a real one rather
   * than +971 50 000 0000, which is visibly a placeholder to anybody
   * being given a demo.
   *
   * This is the *brokerage's* number, which is a different thing from
   * the number a WhatsApp button on a viewing card opens. That one goes
   * to the buyer — an agent standing outside a building messages the
   * person meeting them, not themselves.
   */
  const BROKERAGE_WHATSAPP = "+971553168157";
  const channel = await db.channel.upsert({
    where: {
      orgId_type_identifier: {
        orgId: org.id, type: "WHATSAPP", identifier: BROKERAGE_WHATSAPP,
      },
    },
    update: { active: true, label: "Main sales number" },
    create: {
      orgId: org.id, type: "WHATSAPP", label: "Main sales number",
      identifier: BROKERAGE_WHATSAPP, active: true,
    },
  });

  const owner = byEmail.get("omar@marinabay.ae")!;
  const agent = byEmail.get("lena@marinabay.ae")!;

  /**
   * Create the leads this fixture is missing, and touch nothing else.
   *
   * ## Why this is no longer "only when there are none"
   *
   * It was `if (existing === 0)`, guarding against overwriting real dev
   * data — which is right, and had a consequence nobody noticed: **an
   * addition to the fixture could never reach a database that already
   * had one lead in it.** Growing the demo from eleven to forty-two
   * would have changed nothing anywhere the demo is actually run,
   * silently, with the seed reporting success.
   *
   * The guard was doing two jobs. "Do not modify rows that exist" is
   * the one worth keeping; "do not add rows that do not" was collateral.
   * So this creates only what is absent, matched on the fixture's own
   * phone numbers — which nothing else in the product issues, so it can
   * only ever create rows this file owns. An existing lead, however it
   * got there, is left exactly as it is.
   *
   * `existing` still decides whether the run is announced as seeded or
   * adopted, because that line is read by a person deciding whether to
   * trust what they are looking at.
   */
  const existing = await db.lead.count({ where: { orgId: org.id, deletedAt: null } });
  {
    /**
     * "Already here" means the phone **or** the name, and the second
     * half is not belt and braces.
     *
     * Matching on phone alone looked obviously right and produced
     * eleven duplicate people on the first run: this database's
     * original leads were written by an older version of this file
     * under different numbers (`+971500000201`, `+97155500101`), so
     * every one of the eleven named leads was created a second time
     * beside itself. A demo with two Sarah Al Mansooris in the list is
     * worse than a thin one.
     *
     * The name is what this fixture actually identifies a lead by — the
     * hand-written threads are keyed on it, and so is the budget
     * restore below. Matching on both means a fixture lead is created
     * once, however it first arrived.
     */
    const present = await db.lead.findMany({
      where: { orgId: org.id }, select: { phone: true, name: true },
    });
    const knownPhones = new Set(present.map((l) => l.phone));
    const knownNames = new Set(present.map((l) => l.name));
    for (const [i, l] of LEADS.entries()) {
      if (knownPhones.has(l.phone) || knownNames.has(l.name)) continue;
      const lead = await db.lead.create({
        data: {
          orgId: org.id, name: l.name, phone: l.phone, score: l.score,
          status: l.status, stageId: stages.get(l.stage), source: l.source,
          // Fils, never AED — the one unit in this schema, and the
          // reason `lib/money.ts` is a single function.
          budgetMaxFils: l.budgetMax ? BigInt(l.budgetMax) * 100n : null,
          // Spread across the two people who carry leads, except the
          // ones marked `nobody` so that tab is never empty.
          assignedToId: l.nobody ? null : i % 3 === 0 ? agent : owner,
          position: i,
          // Backdated across the month, so "created" is a spread rather
          // than forty-two rows stamped with the second the seed ran —
          // which is what a list sorted by age would otherwise show.
          createdAt: daysAgo(Math.min(60, (l.talk?.daysAgo ?? 0) + 1)),
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
  }
  if (existing > 0) {
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
  /**
   * The budgets, restated for the same reason the clock is.
   *
   * Adoption leaves whatever is in the database, and the checks write
   * to leads as a side effect of testing other things — so Hannah, who
   * the fixture says is looking at 1.4, was carrying 11.5, and Peter at
   * 1.9 was carrying the same 11.5 as her. Nothing was broken and
   * nothing looked broken until the transcripts went in: the inbox then
   * showed a buyer saying "what can I get for 1.4?" beside a chip
   * reading AED 11.5M, on the row above another one with the identical
   * figure.
   *
   * Matched on name, which is what the fixture actually identifies a
   * lead by, and only for names the fixture knows — a lead somebody
   * added by hand is left alone.
   */
  for (const l of LEADS) {
    if (!l.budgetMax) continue;
    await db.lead.updateMany({
      where: { orgId: org.id, name: l.name, deletedAt: null },
      data: { budgetMaxFils: BigInt(l.budgetMax) * 100n },
    });
  }

  const spread = await db.lead.findMany({
    where: { orgId: org.id, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: {
      id: true, name: true, status: true, phone: true, budgetMaxFils: true,
      conversation: { select: { id: true } },
    },
  });
  for (const [i, l] of spread.entries()) {
    if (!l.conversation) continue;
    // A working brokerage is a spread, not a cohort: a couple of live
    // conversations, most within the fortnight, and two genuinely stale
    // so "gone quiet" has something true to find.
    /**
     * The fixture's own age where it has one, the spread otherwise.
     *
     * This was `[0, 1, 2, 3, 5, 8, 11, 13, 21, 34, 61][i % 11]` — a
     * spread indexed by position, which was right for eleven leads and
     * wrong for forty-two: it cycles, so four different leads get the
     * same age and the deliberate distribution in `LEADS` — a couple
     * live today, most inside the fortnight, a tail out past two months
     * — is thrown away and replaced by the same eleven values repeated
     * four times.
     *
     * Matched on phone **or** name, for the reason the create block
     * above spells out: the leads that have been in this database
     * longest carry older numbers, so a phone-only lookup silently
     * skipped exactly the eleven whose ages the fixture is most
     * specific about. A lead somebody added by hand still gets the
     * spread.
     */
    const fixture = LEADS.find((f) => f.phone === l.phone || f.name === l.name);
    const declared = fixture?.talk?.daysAgo;
    const age = declared ?? [0, 1, 2, 3, 5, 8, 11, 13, 21, 34, 61][i % 11] ?? 7;

    /**
     * The transcript, rewritten against the same clock.
     *
     * Written here rather than beside the conversation's `create`, for
     * exactly the reason this whole block exists: a message stamped
     * once with an absolute date drifts away from a `lastInboundAt`
     * that is re-stated every run, and a thread whose last line is
     * three weeks older than the "18h" chip beside it is a fixture
     * arguing with itself.
     *
     * Cleared and rewritten rather than topped up, so running the seed
     * twice does not produce a conversation that says the same thing
     * twice.
     */
    /**
     * A written thread where there is one, a composed thread otherwise.
     *
     * The eleven original leads keep their hand-written conversations —
     * they carry the detail the demo is narrated from. The other
     * thirty-one are composed from their own budget and stage, which is
     * the only way forty-two threads avoid being four lines repeated
     * thirty-one times.
     *
     * The variant comes off the phone number rather than the loop
     * index, so it is stable: re-seeding must not reshuffle who said
     * what.
     */
    const variant = Number((l.phone ?? "0").slice(-3)) || 0;
    const turns =
      THREADS[l.name ?? ""] ??
      threadFor(
        l.name ?? "there",
        l.status,
        Number((l.budgetMaxFils ?? 2_000_000_00n) / 100n),
        variant
      );
    await db.message.deleteMany({ where: { conversationId: l.conversation.id } });
    const end = daysAgo(age).getTime();
    await db.message.createMany({
      data: turns.map(([who, body]: Turn, k: number) => {
        const inbound = who === "them";
        // Four minutes apart, ending on the conversation's own clock.
        const sentAt = new Date(end - (turns.length - 1 - k) * 4 * 60_000);
        return {
          orgId: org.id,
          conversationId: l.conversation!.id,
          direction: inbound ? ("INBOUND" as const) : ("OUTBOUND" as const),
          author: inbound ? ("LEAD" as const)
                : who === "bot" ? ("ASSISTANT" as const) : ("AGENT" as const),
          body,
          status: "READ" as const,
          sentAt,
          deliveredAt: sentAt,
          readAt: sentAt,
        };
      }),
    });

    /**
     * The badge, **derived** from the transcript rather than declared
     * beside it.
     *
     * Unread means one thing: how many times the buyer has spoken since
     * we last answered. Computing it from the messages makes the dot,
     * the count and the last line of the thread incapable of
     * disagreeing — which they were free to do while `unreadCount` was
     * a number in the fixture and the transcript did not exist.
     *
     * The first version of this only *preserved* the declared count
     * where the buyer spoke last, and the seed's own guard caught it
     * immediately: "waiting on us matches 0 of 11 — that tab cannot
     * catch a regression." On an adopted database the counts had
     * already been zeroed by check runs marking threads read, so
     * preserving them preserved nothing. Deriving restores the tab on
     * every run, which is the whole point of this block.
     */
    const outbound = [...turns].reverse().findIndex(([w]) => w !== "them");
    const unread = outbound === -1 ? turns.length : outbound;
    await db.conversation.update({
      where: { id: l.conversation.id },
      data: {
        lastInboundAt: daysAgo(age),
        lastOutboundAt: outbound === -1
          ? null
          : new Date(end - outbound * 4 * 60_000),
        unreadCount: unread,
      },
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
    select: { id: true, name: true, phone: true, conversation: { select: { unreadCount: true } } },
  })).sort((a, b) => (b.conversation?.unreadCount ?? 0) - (a.conversation?.unreadCount ?? 0));
  for (const [i, l] of inOrder.entries()) {
    const f = funnel[i % funnel.length];
    if (!f) continue;
    const [status, stageName] = f;
    const stageId = stages.get(stageName);
    if (!stageId) continue;
    await db.lead.update({ where: { id: l.id }, data: { status, stageId } });
  }

  /**
   * The front door, with something behind it.
   *
   * `/today` is the first screen of every demonstration and it read
   * **AED 0 with four zeros under it**, because the brief counts what is
   * hot, unanswered and booked *for the signed-in agent* — and the
   * development brokerage had one lead scoring over seventy in the whole
   * firm, owned by somebody else, and no viewing today.
   *
   * The screen was right. Every figure on it was a true statement about
   * an empty book, which is the least useful true thing a product can
   * say to somebody deciding whether to buy it.
   *
   * `LEADS` carries a considered spread of scores across all four bands
   * and, like the rest of that array, it never reached the database —
   * these leads predate it. So the spread is applied to whatever leads
   * are actually there, in the same place the pipeline funnel and the
   * conversation clock are re-stated, and for the same reason: a fixture
   * whose numbers do not move with the calendar or the schema is one
   * that quietly stops describing the product.
   *
   * ## The fixture wins now, and it did not before
   *
   * That paragraph was written when `LEADS` could not reach a database
   * that already had a lead in it. It can now, and this block was still
   * overwriting all forty-two with an eleven-value cycle — so a lead
   * the fixture deliberately leaves **unscored**, because it arrived
   * after the last nightly sweep and that is a real state the strip
   * reports separately, came back as "Warm 38". The demo contradicted
   * its own fixture on the first screen anybody opens.
   *
   * So: the fixture's score where the fixture knows the lead, and the
   * positional spread only for leads it does not — which is what keeps
   * a development database that has collected rows from the checks
   * looking like a book rather than a single band.
   */
  const SPREAD = [88, 84, 76, 72, 68, 61, 55, 47, 38, 22, null];
  for (const [i, l] of inOrder.entries()) {
    const known = LEADS.find((f) => f.phone === l.phone || f.name === l.name);
    await db.lead.update({
      where: { id: l.id },
      data: {
        score: known ? known.score : SPREAD[i % SPREAD.length] ?? null,
      },
    });
  }

  /**
   * Two viewings today, and one tomorrow.
   *
   * Relative to now on every run, never a stored date. A diary seeded
   * with absolute times is empty by the following week, which is the
   * decay the conversation clock above was fixed for — the same bug,
   * one screen along.
   */
  /**
   * The book, before the diary that books viewings against it.
   *
   * This used to run after the viewings block, which worked only
   * because a development database already held the listings from the
   * previous run. On a genuinely fresh database the diary was assigned
   * against whatever existed at that moment — nothing on the first run,
   * and the four original rows on every run after a listing was added.
   * Ordering it here is what makes "spread across the book" true rather
   * than true-on-the-second-run.
   */
  await listings(org.id);

  const owner2 = byEmail.get("omar@marinabay.ae");
  const allListings = await db.listing.findMany({
    where: { orgId: org.id }, orderBy: { reference: "asc" }, select: { id: true },
  });
  const listing = allListings[0];
  const mine = inOrder.filter((_, i) => i < 6);
  if (owner2 && listing && mine.length >= 2) {
    // The signed-in agent's, or the count on their own screen stays zero.
    await db.lead.updateMany({
      where: { id: { in: mine.map((l) => l.id) } },
      data: { assignedToId: owner2 },
    });
    const at = (hours: number) => {
      const d = new Date();
      d.setHours(hours, 0, 0, 0);
      return d;
    };
    /**
     * A week's diary, not an afternoon.
     *
     * Three viewings on one property was enough to prove the screen
     * renders. It is not enough to look like a working agent's week,
     * and the diary is one of the two screens an agent has open all
     * day — so it read as a product nobody uses.
     *
     * Spread across days and across the book: the times are relative to
     * now on every run, never stored dates, for the reason the
     * conversation clock above was fixed. A diary seeded with absolute
     * times is empty by the following week — the same decay, one screen
     * along.
     *
     * `day` is whole days from today, so the past ones are genuinely
     * past: an agent's diary that only ever runs forwards has no
     * outcome to record, and `viewings/outcome.tsx` exists to record
     * one.
     */
    const day = (n: number, hours: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      d.setHours(hours, 0, 0, 0);
      return d;
    };
    /**
     * Each slot names its own property, and that is not decoration.
     *
     * The address and the listing were chosen independently — a text
     * address from one list, a `listingId` cycling through another — so
     * the diary showed "Marina Gate 2, unit 1204" under the reference
     * `DH-101`, which is a villa in Dubai Hills. An agent reads the
     * address and drives there; the reference is what they quote on the
     * phone. Two different properties in one row is worse than either
     * on its own.
     */
    /**
     * `building` and the coordinates are columns of their own, and the
     * seed had never set either.
     *
     * `ViewingCard` opens with "Building first. It is the thing an agent
     * reads while driving" — and `Viewing.building` was null on every
     * row, so that line never rendered anywhere. `mine.tsx` showed a
     * dash in the property column for the same reason, which is the
     * sort of thing that survives in a component nothing mounts.
     *
     * The coordinates matter for a feature, not for decoration: the
     * card warns when two consecutive stops are too far apart for the
     * gap between them, and with no lat/lng that warning could never
     * fire. Tuesday's 10:00 in JVC followed by 13:00 in Business Bay is
     * a real Dubai drive and the pair is deliberately tight, so the
     * warning has something true to say.
     */
    const slots: {
      at: Date; ref: string; building: string; address: string;
      lat: number; lng: number;
    }[] = [
      { at: at(16), ref: "DM-507", building: "Marina Gate 2",
        address: "Marina Gate 2, unit 4104", lat: 25.0805, lng: 55.1403 },
      { at: at(18), ref: "AR-508", building: "Palmera 3",
        address: "Palmera 3, villa 22", lat: 25.0512, lng: 55.2668 },
      { at: day(1, 11), ref: "DH-101", building: "Dubai Hills Grove",
        address: "Grove, villa 8", lat: 25.1103, lng: 55.247 },
      { at: day(1, 14), ref: "DH-509", building: "Park Heights 2",
        address: "Park Heights 2, unit 907", lat: 25.1156, lng: 55.2519 },
      { at: day(1, 17), ref: "CT-515", building: "Creek Rise",
        address: "Creek Rise, unit 2204", lat: 25.202, lng: 55.345 },
      { at: day(2, 10), ref: "JVC-404", building: "Bloom Towers",
        address: "Bloom Towers, unit 1810", lat: 25.057, lng: 55.209 },
      { at: day(2, 13), ref: "BB-506", building: "The Sterling",
        address: "The Sterling, unit 604", lat: 25.1857, lng: 55.262 },
      { at: day(2, 16), ref: "AR-516", building: "Joy",
        address: "Joy, unit 42", lat: 25.049, lng: 55.2712 },
      { at: day(3, 11), ref: "MG-202", building: "Marina Gate 1",
        address: "Marina Gate 1, unit 3302", lat: 25.0798, lng: 55.1409 },
      { at: day(3, 15), ref: "PJ-505", building: "Garden Homes",
        address: "Garden Homes, Frond K villa 18", lat: 25.1121, lng: 55.138 },
      { at: day(4, 10), ref: "TH-514", building: "Zahra",
        address: "Zahra, unit 12", lat: 24.9985, lng: 55.3105 },
      { at: day(4, 12), ref: "JVC-510", building: "Belgravia Heights",
        address: "Belgravia Heights, unit 505", lat: 25.0584, lng: 55.2113 },
      { at: day(-1, 11), ref: "DS-511", building: "The Pulse",
        address: "The Pulse, unit 214", lat: 24.893, lng: 55.152 },
      { at: day(-2, 16), ref: "EH-512", building: "Sector W",
        address: "Sector W, villa 3", lat: 25.063, lng: 55.171 },
    ];
    const refToId = new Map(
      (await db.listing.findMany({
        where: { orgId: org.id }, select: { id: true, reference: true },
      })).map((l) => [l.reference, l.id])
    );

    /**
     * Idempotent on the slot, not on the lead.
     *
     * It matched `leadId` and `scheduledAt` together, which is only
     * idempotent while the lead for a slot never changes. Widening the
     * pool of leads the diary draws from moved slot 0 to a different
     * person, so the run created a *second* viewing at 16:00 beside the
     * first — and the screen showed three different buyers at the same
     * address at the same minute, which is not a thing that can happen.
     *
     * The slot is the identity: one property, one time. If the lead
     * changes, the row is updated rather than duplicated.
     */
    for (const [i, sl] of slots.entries()) {
      const lead = mine[i % mine.length]!;
      const listingId = refToId.get(sl.ref) ?? listing.id;
      /**
       * The slot's identity is its time, and nothing else.
       *
       * It matched on time *and* address, which self-heals only while
       * the address never changes. Correcting one — "Dubai Hills Grove,
       * villa 8" to "Grove, villa 8" — created a second row beside the
       * first instead of updating it, and the diary showed the same
       * buyer at 11:00 twice. Keying on the time alone means editing
       * any other field repairs the row rather than cloning it.
       *
       * One viewing per slot for this agent, then: a real development
       * viewing booked at exactly one of these times would be rewritten,
       * which is the trade a fixture makes to stay self-healing.
       */
      const already = await db.viewing.findFirst({
        where: { orgId: org.id, scheduledAt: sl.at, agentId: owner2 },
        select: { id: true },
      });
      const data = {
        leadId: lead.id, listingId, agentId: owner2,
        address: sl.address,
        building: sl.building, lat: sl.lat, lng: sl.lng,
        durationMins: 45,
        status: sl.at.getTime() < Date.now() ? ("COMPLETED" as const) : ("SCHEDULED" as const),
      };
      if (already) {
        await db.viewing.update({ where: { id: already.id }, data });
        continue;
      }
      await db.viewing.create({
        data: { orgId: org.id, scheduledAt: sl.at, ...data },
      });
    }
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


  await offers(org.id);
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

    /**
     * The rest of the book.
     *
     * Four listings is a schema demonstration. A five-agent Dubai firm
     * carries fifteen to twenty at any time, and the screens say so out
     * loud when it does not — "4 live" above a table with four rows in
     * it, and a "who wants this property" match that can only ever pull
     * from four.
     *
     * The spread is deliberate in three ways. **Communities**, because
     * a book that is all Marina is one office, not a brokerage.
     * **Permits**, because the nightly Trakheesi sweep is only proved
     * by rows at different distances from expiry — two inside the
     * warning window, one already lapsed, the rest comfortable.
     * **Purpose**, because rent and sale price on the same screen at a
     * hundred-fold difference is exactly where a single money unit
     * stops being pedantry.
     */
    {
      reference: "PJ-505", title: "Four-bedroom villa, Palm Jumeirah Frond K",
      community: "Palm Jumeirah", building: "Garden Homes",
      bedrooms: 4, bathrooms: 5, areaSqft: 5200,
      priceFils: 24_500_000n * 100n, purpose: "SALE" as const,
      permitNumber: "7503311", permitExpiresAt: inDays(178),
      en: "A Garden Home on Frond K with private beach access, a rebuilt " +
          "kitchen and a pool that was re-tiled last year. Vacant on transfer.",
    },
    {
      reference: "BB-506", title: "One-bedroom apartment, Business Bay",
      community: "Business Bay", building: "The Sterling",
      bedrooms: 1, bathrooms: 2, areaSqft: 860,
      priceFils: 1_650_000n * 100n, purpose: "SALE" as const,
      permitNumber: "7511420", permitExpiresAt: inDays(11),
      en: "A one-bedroom in The Sterling, canal side, tenanted until March " +
          "at 95,000. Suits an investor who wants the income from day one.",
    },
    {
      reference: "DM-507", title: "Three-bedroom apartment, Dubai Marina",
      community: "Dubai Marina", building: "Marina Gate 2",
      bedrooms: 3, bathrooms: 4, areaSqft: 1980,
      priceFils: 5_400_000n * 100n, purpose: "SALE" as const,
      permitNumber: "7522087", permitExpiresAt: inDays(133),
      en: "A three-bedroom on the 41st floor of Marina Gate 2, full marina " +
          "view, two parking bays and a study off the living room.",
    },
    {
      reference: "AR-508", title: "Five-bedroom villa, Arabian Ranches Palmera",
      community: "Arabian Ranches", building: "Palmera 3",
      bedrooms: 5, bathrooms: 6, areaSqft: 4600,
      priceFils: 8_900_000n * 100n, purpose: "SALE" as const,
      permitNumber: "7534991", permitExpiresAt: inDays(64),
      en: "A five-bedroom on Palmera 3, extended at the rear, backing onto " +
          "open landscaping rather than another villa. Two-car garage.",
    },
    {
      reference: "DH-509", title: "Two-bedroom apartment, Dubai Hills Park Heights",
      community: "Dubai Hills Estate", building: "Park Heights 2",
      bedrooms: 2, bathrooms: 3, areaSqft: 1140,
      priceFils: 2_450_000n * 100n, purpose: "SALE" as const,
      permitNumber: "7540118", permitExpiresAt: inDays(89),
      en: "A two-bedroom in Park Heights 2 overlooking the park, handed over " +
          "last year and never lived in. Walk to the boulevard and the mall.",
    },
    {
      reference: "JVC-510", title: "Studio, Jumeirah Village Circle",
      community: "Jumeirah Village Circle", building: "Belgravia Heights",
      bedrooms: 0, bathrooms: 1, areaSqft: 430,
      priceFils: 620_000n * 100n, purpose: "SALE" as const,
      permitNumber: "7551702", permitExpiresAt: inDays(203),
      en: "A studio in Belgravia Heights, currently let at 42,000 on a " +
          "renewing contract. The cheapest thing on our book with a tenant.",
    },
    {
      reference: "DS-511", title: "One-bedroom apartment, Dubai South",
      community: "Dubai South", building: "The Pulse",
      bedrooms: 1, bathrooms: 1, areaSqft: 660,
      priceFils: 840_000n * 100n, purpose: "SALE" as const,
      // Already lapsed. The permit sweep must have something genuinely
      // wrong to find, not only something approaching wrong.
      permitNumber: "7560884", permitExpiresAt: inDays(-6),
      en: "A one-bedroom in The Pulse, close to the Expo site and the metro " +
          "extension. Handover completed, service charge among the lowest.",
    },
    {
      reference: "EH-512", title: "Six-bedroom villa, Emirates Hills",
      community: "Emirates Hills", building: "Sector W",
      bedrooms: 6, bathrooms: 8, areaSqft: 11400,
      priceFils: 47_000_000n * 100n, purpose: "SALE" as const,
      permitNumber: "7570226", permitExpiresAt: inDays(240),
      en: "A six-bedroom on Sector W with a lake view, staff quarters and a " +
          "separate majlis. Off-market until now; the owner wants discretion.",
    },
    {
      reference: "MG-513", title: "Two-bedroom apartment, Marina Gate 1",
      community: "Dubai Marina", building: "Marina Gate 1",
      bedrooms: 2, bathrooms: 3, areaSqft: 1290,
      priceFils: 185_000n * 100n, purpose: "RENT" as const,
      permitNumber: "7581340", permitExpiresAt: inDays(120),
      en: "A furnished two-bedroom in Marina Gate 1, available on four " +
          "cheques. Marina view, chiller included, one bay.",
    },
    {
      reference: "TH-514", title: "Three-bedroom townhouse, Town Square",
      community: "Town Square", building: "Zahra",
      bedrooms: 3, bathrooms: 4, areaSqft: 1850,
      priceFils: 1_980_000n * 100n, purpose: "SALE" as const,
      permitNumber: "7592715", permitExpiresAt: inDays(17),
      en: "A three-bedroom in Zahra, corner plot with a wider garden than " +
          "the terrace standard. Community pool two doors down.",
    },
    {
      reference: "CT-515", title: "Two-bedroom apartment, Creek Harbour",
      community: "Dubai Creek Harbour", building: "Creek Rise",
      bedrooms: 2, bathrooms: 2, areaSqft: 1080,
      priceFils: 2_780_000n * 100n, purpose: "SALE" as const,
      permitNumber: "7601188", permitExpiresAt: inDays(156),
      en: "A two-bedroom in Creek Rise facing the tower and the water. " +
          "Vacant, ready to move into, parking on the same floor.",
    },
    {
      reference: "AR-516", title: "Four-bedroom villa, Arabian Ranches Joy",
      community: "Arabian Ranches III", building: "Joy",
      bedrooms: 4, bathrooms: 4, areaSqft: 2740,
      priceFils: 3_950_000n * 100n, purpose: "SALE" as const,
      permitNumber: "7612903", permitExpiresAt: inDays(71),
      en: "A four-bedroom on Joy, end of terrace, with the garden on two " +
          "sides. Handed over eighteen months ago and lightly used.",
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
 * The offers book.
 *
 * `/offers` said "1 on the table" and `/offers/[listingId]` — the
 * screen that ranks competing offers on one property, and the one that
 * carries the argument this product makes about strength beating price
 * — had a single row to rank. A ranking of one demonstrates nothing.
 *
 * ## The shape is the point, not the count
 *
 * Two properties carry **competing** offers, because that screen sorts
 * cash with no conditions above a higher mortgage offer nobody has
 * pre-approved, and a fixture where the highest number is also the
 * strongest offer cannot show it. On Dubai Hills the top bid is a
 * mortgage without pre-approval, subject to a valuation and to a chain;
 * the second is unconditional cash. If that sort is ever "fixed" to
 * price, this inversion is what goes red.
 *
 * Expiries are relative and staggered, so the live board has something
 * genuinely urgent at the top and the "offer expires today" line on
 * `/today` has a real row behind it.
 *
 * A countered offer gets an `OfferResponse` rather than an edited
 * amount. An offer is never edited — the negotiation is the record both
 * sides argue about later — so a fixture that overwrote the figure
 * would teach the opposite of what the offers module says.
 */
async function offers(orgId: string) {
  const hours = (n: number) => new Date(Date.now() + n * 3_600_000);
  const byRef = new Map(
    (await db.listing.findMany({
      where: { orgId }, select: { id: true, reference: true },
    })).map((l) => [l.reference, l.id])
  );
  const leadByName = new Map(
    (await db.lead.findMany({
      where: { orgId, deletedAt: null }, select: { id: true, name: true },
    })).map((l) => [l.name ?? "", l.id])
  );

  const rows: {
    ref: string; lead: string; aed: number; hoursLeft: number | null;
    financing: "CASH" | "MORTGAGE"; preApproved?: boolean;
    status: "SUBMITTED" | "PRESENTED" | "COUNTERED" | "REJECTED";
    conditions?: string; counter?: number;
  }[] = [
    // Dubai Hills Grove — three in, and the highest is the weakest.
    { ref: "DH-101", lead: "James Whitfield",   aed: 11_200_000, hoursLeft: 3,
      financing: "MORTGAGE", status: "PRESENTED",
      conditions: "Subject to valuation, and to their own villa selling." },
    { ref: "DH-101", lead: "Noura Al Suwaidi",  aed: 10_950_000, hoursLeft: 26,
      financing: "CASH", status: "PRESENTED" },
    { ref: "DH-101", lead: "Sarah Al Mansoori", aed: 10_600_000, hoursLeft: 50,
      financing: "MORTGAGE", preApproved: true, status: "COUNTERED",
      counter: 11_000_000 },

    // Marina Gate — two, one already turned down.
    { ref: "MG-202", lead: "Emma Lindqvist",    aed: 3_050_000,  hoursLeft: 19,
      financing: "MORTGAGE", preApproved: true, status: "PRESENTED" },
    { ref: "MG-202", lead: "Marco Rossi",       aed: 2_780_000,  hoursLeft: null,
      financing: "MORTGAGE", status: "REJECTED" },

    { ref: "DM-507", lead: "Aditi Ramanathan",  aed: 5_150_000,  hoursLeft: 8,
      financing: "CASH", status: "COUNTERED", counter: 5_350_000 },
    { ref: "AR-508", lead: "Fatima Al Zaabi",   aed: 8_400_000,  hoursLeft: 44,
      financing: "MORTGAGE", preApproved: true, status: "PRESENTED",
      conditions: "Completion no earlier than June — they are in a lease." },
    { ref: "DH-509", lead: "Priya Menon",       aed: 2_320_000,  hoursLeft: 70,
      financing: "CASH", status: "SUBMITTED" },
    { ref: "CT-515", lead: "Tom Bradley",       aed: 2_640_000,  hoursLeft: 15,
      financing: "MORTGAGE", status: "PRESENTED" },
    { ref: "BB-506", lead: "Sofia Petrova",     aed: 1_560_000,  hoursLeft: 92,
      financing: "CASH", status: "SUBMITTED",
      conditions: "Wants the tenant to stay on after transfer." },
    { ref: "TH-514", lead: "Daniel Mwangi",     aed: 1_880_000,  hoursLeft: null,
      financing: "MORTGAGE", status: "REJECTED" },
  ];

  for (const r of rows) {
    const listingId = byRef.get(r.ref);
    const leadId = leadByName.get(r.lead);
    if (!listingId || !leadId) continue;
    // Idempotent on the property, the buyer and the amount — which is
    // what identifies an offer in a fixture that never edits one.
    const already = await db.offer.findFirst({
      where: { orgId, listingId, leadId, amountFils: BigInt(r.aed) * 100n },
      select: { id: true },
    });
    if (already) continue;
    const offer = await db.offer.create({
      data: {
        orgId, listingId, leadId,
        amountFils: BigInt(r.aed) * 100n,
        financing: r.financing,
        preApproved: r.preApproved ?? false,
        conditions: r.conditions ?? null,
        status: r.status,
        expiresAt: r.hoursLeft === null ? null : hours(r.hoursLeft),
        decidedAt: r.status === "REJECTED" ? new Date() : null,
      },
    });
    if (r.counter) {
      await db.offerResponse.create({
        data: {
          orgId, offerId: offer.id,
          // The vendor is the one countering, which is the whole point
          // of recording a response rather than editing the offer.
          by: "VENDOR", kind: "COUNTER",
          amountFils: BigInt(r.counter) * 100n,
          note: "Vendor came back. Nothing signed yet.",
        },
      });
    }
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

/**
 * What the conversations actually say.
 *
 * ## The inbox was empty, and it is the product
 *
 * Eleven conversations existed with a lead, a channel, an unread count
 * and a 24-hour clock — and **not one message row between them**. The
 * inbox of a WhatsApp-first CRM rendered eleven threads each reading
 * "No messages yet", every one of them "Window closed", because a
 * window opens on an inbound message and there were none.
 *
 * That is the shape this codebase keeps finding: everything around the
 * thing exists and the thing itself has never been written. It is worse
 * here than in the usual case, because the screen does not look broken
 * — it looks like a brokerage nobody has messaged.
 *
 * ## The rules these have to obey
 *
 * A transcript that disagrees with the badge beside it is worse than no
 * transcript. So:
 *
 * - A thread whose lead carries `unread` **ends with the buyer
 *   speaking**, and one that does not ends with us. The dot and the
 *   last line can then never contradict each other.
 * - The final message is stamped at the conversation's own
 *   `lastInboundAt`, which is re-anchored on every run — so the clock,
 *   the transcript and the "Window Nh" chip all move together instead
 *   of the transcript aging out from under the other two.
 * - Nothing here quotes a price the assistant was not given. The
 *   guardrails refuse an ungrounded figure, and a fixture that shows it
 *   doing the opposite teaches the wrong thing to everybody who reads
 *   it.
 */
type Turn = ["them" | "bot" | "agent", string];

const THREADS: Record<string, Turn[]> = {
  "Sarah Al Mansoori": [
    ["them", "Hi, saw the 4-bed in Dubai Hills Grove. Is it still available?"],
    ["bot", "It is. Are you buying to live in or as an investment?"],
    ["them", "To live in. We're relocating in March."],
    ["bot", "Understood. What sort of budget are you working to?"],
    ["them", "Up to 12 if it's the right one."],
    ["bot", "That works for this one. Omar looks after Dubai Hills — shall I ask him to call you?"],
    ["agent", "Sarah, Omar here. I have the keys Saturday morning if you'd like to see it."],
    ["them", "Saturday works. Can my husband join on video?"],
    ["them", "Also — is the service charge included in what you quoted?"],
  ],
  "James Whitfield": [
    ["them", "Following up on Palmera. Any movement from the seller?"],
    ["agent", "They came back at 18. I've told them you were at 17.4 and they're thinking."],
    ["them", "I can go to 17.8 but that's my ceiling."],
    ["bot", "Noted — I've recorded 17.8 as your position and flagged it to Omar."],
    ["them", "How long do they have to respond?"],
  ],
  "Emma Lindqvist": [
    ["them", "Hello! Looking for a 2-bed in Marina, budget around 3.2"],
    ["bot", "Marina at 3.2 is realistic for a 2-bed. Do you need it furnished?"],
    ["them", "Unfurnished is fine. Ideally high floor."],
    ["bot", "Noted. Are you buying with a mortgage or cash?"],
    ["them", "Mortgage. Pre-approved with Emirates NBD."],
    ["them", "Sorry, one more — do any of them allow pets?"],
    ["them", "Hello? Still there?"],
  ],
  "Michael Osei": [
    ["them", "Is the 1-bed in JVC still on?"],
    ["bot", "It is. What's prompting the move?"],
    ["them", "First place. Budget is 2.5 max, honestly a bit tight."],
    ["bot", "That's workable in JVC. I'll have Omar send you three that fit."],
    ["agent", "Michael, sent you three just now. The Arabian Ranches one is the best value of them."],
  ],
  "Grace Oyelaran": [
    ["them", "Hi, enquiring about the villa in Arabian Ranches"],
    ["bot", "Happy to help. Are you looking to buy or to rent?"],
    ["them", "Buy. Around 4 million."],
    ["bot", "That's the right range for a 3-bed there. When would you want to move?"],
    ["them", "No rush, next six months."],
    ["agent", "Grace, I'll keep an eye out and send anything that comes up. No pressure."],
  ],
  "David Chen": [
    ["them", "do you have anything under 300k"],
    ["bot", "Not in the communities we cover — 300k is below the entry point for Dubai Hills or Marina. I can tell you where it does buy something, if that helps."],
    ["them", "ok"],
    ["them", "what about jvc"],
  ],

  "Peter Nkemelu": [
    ["them", "Do you have anything in Business Bay around 1.9?"],
    ["bot", "At 1.9 that would be a studio or a small 1-bed in Business Bay. Is that the size you had in mind?"],
    ["them", "1-bed ideally. It's an investment, not to live in."],
    ["bot", "Understood — I'll flag you for anything that comes up with a tenant already in place."],
  ],
  "Claudia Moreau": [
    ["them", "Bonjour, I saw your advert on Instagram"],
    ["bot", "Hello — happy to help. Which property was it?"],
    ["them", "The one in Jumeirah Village. Around 2.8?"],
    ["bot", "That one has gone, but there are two similar on the same street. Shall I send them over?"],
  ],
  "Yusuf Demir": [
    ["them", "Merhaba, looking for a 3-bed, budget 5.6"],
    ["bot", "That opens up Dubai Hills and Arabian Ranches. Do you need it ready to move into?"],
    ["them", "Yes, this year."],
    ["agent", "Yusuf, I've put four together for you. Ranches is the better value at that budget."],
  ],
  "Hannah Kruger": [
    ["them", "Hi, what can I get for 1.4?"],
    ["bot", "At 1.4 you're looking at a studio in JVC or Dubai South. Would either work?"],
    ["them", "Let me think about it."],
    ["agent", "No rush at all Hannah. I'll check in if something good comes up."],
  ],
  "Rashid Al Falasi": [
    ["them", "السلام عليكم، هل الفيلا في دبي هيلز متاحة؟"],
    ["bot", "وعليكم السلام. نعم، ما زالت متاحة. هل تفضل الشراء أم الإيجار؟"],
    ["them", "Buy. Around 11.5, cash."],
    ["agent", "Rashid, a cash offer at that level is strong. I can get you in this week."],
  ],
};

/**
 * A thread for everybody else, composed rather than copied.
 *
 * Eleven leads could have eleven hand-written conversations. Forty-two
 * cannot — and the failure mode is not "less detail", it is **the same
 * four lines on thirty-one consecutive rows**, which reads as a
 * rendering bug rather than as thirty-one people. Two adjacent rows
 * were enough to look broken the last time this happened.
 *
 * So the thread is built from the lead's own facts: what they can
 * spend decides which communities they are shown, and where they have
 * got to decides how far the conversation runs. A variant index taken
 * from the phone number keeps two leads at the same budget and stage
 * from opening identically, and keeps it stable across runs — the
 * fixture must not shuffle itself every time somebody re-seeds.
 *
 * Every line still obeys the guardrails: the assistant qualifies, hands
 * over, and never quotes a figure it was not given. A fixture that
 * shows it doing otherwise teaches the wrong thing to everyone who
 * reads the demo.
 */
/**
 * One turn. A function rather than a bare `["bot", "..."]` literal,
 * because a tuple written inline inside an array that also spreads
 * `Turn[]` widens to `(string | Turn)[]` and the whole composer stops
 * type-checking — which is noise, not safety.
 */
const t = (who: Turn[0], body: string): Turn => [who, body];

function areaFor(aed: number): { area: string; kind: string } {
  if (aed < 1_200_000) return { area: "Dubai South", kind: "studio" };
  if (aed < 2_000_000) return { area: "JVC", kind: "1-bed" };
  if (aed < 3_500_000) return { area: "Business Bay", kind: "1-bed" };
  if (aed < 6_000_000) return { area: "Dubai Marina", kind: "2-bed" };
  if (aed < 10_000_000) return { area: "Dubai Hills", kind: "3-bed" };
  if (aed < 16_000_000) return { area: "Dubai Hills Grove", kind: "villa" };
  return { area: "Palm Jumeirah", kind: "villa" };
}

/** AED, in the way a person says it out loud: "2.4", "850k". */
function spoken(aed: number): string {
  return aed >= 1_000_000
    ? `${(aed / 1_000_000).toFixed(aed % 1_000_000 === 0 ? 0 : 1)}`
    : `${Math.round(aed / 1_000)}k`;
}

function threadFor(
  name: string, status: string, budgetAed: number, variant: number
): Turn[] {
  const first = name.split(" ")[0] ?? "there";
  const { area, kind } = areaFor(budgetAed);
  const money = spoken(budgetAed);

  const opener: Turn[][] = [
    [t("them", `Hi, do you have any ${kind} in ${area}?`)],
    [t("them", `Saw your listing. Is it still available?`)],
    [t("them", `Hello — looking for something in ${area} around ${money}`)],
    [t("them", `Good morning. Can you send me what you have in ${area}?`)],
  ];
  const qualify: Turn[][] = [
    [t("bot", "Happy to help. Are you buying to live in or as an investment?"),
     t("them", variant % 2 ? "To live in." : "Investment — I'm after the yield.")],
    [t("bot", "Of course. What budget are you working to?"),
     t("them", `Around ${money}, maybe a little over for the right one.`)],
    [t("bot", "Yes — a few. Is this your first purchase in Dubai?"),
     t("them", variant % 2 ? "Second. I already own in JVC." : "First one, yes.")],
  ];
  const finance: Turn = variant % 3 === 0
    ? t("them", "Cash, so I can move quickly.")
    : t("them", "Mortgage — pre-approved already.");

  const o = opener[variant % opener.length]!;
  const q = qualify[variant % qualify.length]!;

  switch (status) {
    case "NEW":
      return [...o, t("bot", "Happy to help — what sort of budget are you working to?")];

    case "UNRESPONSIVE":
      return [...o,
        t("bot", `We do. Before I send them over — is ${money} the ceiling, or is there room?`),
        t("bot", `Still happy to send those over whenever suits, ${first}.`)];

    case "LOST":
      return [...o, ...q,
        ["them", variant % 2
          ? "Thanks — we've decided to rent for another year."
          : "We went with somewhere else in the end. Appreciate your help."],
        t("agent", "No problem at all. I'll keep your details on file if anything changes.")];

    case "WON":
      return [...o, ...q, finance,
        t("agent", `${first}, transfer went through this morning. Congratulations.`),
        t("them", "Thank you! Genuinely, you made that painless.")];

    case "NEGOTIATING":
      return [...o, ...q, finance,
        t("agent", `${first}, they've come back. I'll call you in five to talk it through.`),
        t("them", "Please do. I don't want to lose this one over a small gap.")];

    case "VIEWING_BOOKED":
      return [...o, ...q,
        t("bot", `That fits what we have in ${area}. Are you free this weekend to see two of them?`),
        t("them", "Saturday morning works."),
        t("agent", `Booked for Saturday, ${first}. I'll send the locations the night before.`)];

    case "QUALIFIED":
      return [...o, ...q, finance,
        t("bot", `Thanks ${first} — that's everything I need. Passing you to the agent who covers ${area}.`),
        t("agent", "I'll put a shortlist together and come back to you today.")];

    default:
      return [...o, ...q,
        t("bot", `Noted. I'll have the agent who covers ${area} send you a shortlist.`)];
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
