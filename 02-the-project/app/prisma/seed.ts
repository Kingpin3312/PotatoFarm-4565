import { PrismaClient, type LeadSource, type LeadStatus, type Role } from "@prisma/client";
import { seedStages, DEFAULT_STAGES } from "../src/server/lib/pipeline/defaults";
import { seedHours } from "../src/server/lib/hours/defaults";
import { seedQualification } from "../src/server/lib/assistant/qualification";

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
   * The three things signup does, done by signup's own code.
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
   * All three are idempotent by their own keys — `seedStages` uses
   * `skipDuplicates`, `seedQualification` returns early on an active
   * profile — which is what lets this run against a brokerage that is
   * already half configured, and fill only the half that is missing.
   */
  await db.$transaction(async (tx) => {
    await seedStages(tx, org.id);
    await seedHours(tx, org.id);
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

  await report(org.id, org.name, existing === 0);
}

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
