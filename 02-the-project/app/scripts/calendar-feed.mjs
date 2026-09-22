import { randomBytes } from "node:crypto";
import { PrismaClient } from "@prisma/client";

/**
 * The agent's viewings calendar, end to end.
 *
 * ## Why this suite exists
 *
 * Nothing had ever fetched `/api/calendar/[token]`, and of every route
 * in this product it is the one that most needs it: **this is the only
 * place row-level security is deliberately switched off.**
 *
 * It has to be. Apple Calendar and Google fetch a URL on a timer with
 * no cookie and no way to sign in, so there is no session, so there is
 * no tenant until the token resolves one — the route declares
 * `crossTenant("pre-tenant")` and says exactly that. Everywhere else in
 * the codebase the database refuses to return another brokerage's rows.
 * Here the only thing standing between one agent's diary and everybody
 * else's is a hand-written `where` clause:
 *
 *     where: { orgId: membership.orgId, agentId: membership.userId, ... }
 *
 * Delete either half and every check in this repository still passes,
 * every screen still works, and the product quietly serves a rival
 * brokerage's viewings — names, phone numbers and addresses — to
 * anybody holding a URL, into a file their calendar client then syncs
 * to Google's servers. Nothing errors. That is the whole reason this
 * file exists, and the two isolation assertions below are its point.
 *
 *     npm run start
 *     npm run check:calendar-feed
 */
const APP = process.env.APP_URL ?? "http://localhost:3000";

let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

const home = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true, name: true } });
if (!home) { console.error("no organisation — run npm run db:seed"); process.exit(1); }

const STAMP = Date.now();
const tok = () => randomBytes(32).toString("base64url");
const soon = (days) => new Date(Date.now() + days * 86_400_000);

/* ------------------------------------------------------------------ *
 * Fixtures. Two agents in one brokerage, and a second brokerage —
 * because the `where` clause has two halves and each needs its own
 * counter-example.
 * ------------------------------------------------------------------ */
const made = { users: [], orgs: [], leads: [], viewings: [], memberships: [] };

async function agent(orgId, label) {
  const user = await db.user.create({
    data: { name: `Cal ${label} ${STAMP}`, email: `cal.${label}.${STAMP}@example.com` },
  });
  made.users.push(user.id);
  const m = await db.membership.create({
    data: { orgId, userId: user.id, role: "AGENT", calendarToken: tok(), calendarTokenAt: new Date() },
  });
  made.memberships.push(m.id);
  return { user, membership: m };
}

async function viewingFor(orgId, agentId, who) {
  const lead = await db.lead.create({
    data: { orgId, name: who, phone: `+9715${Math.floor(Math.random() * 90000000 + 10000000)}` },
  });
  made.leads.push(lead.id);
  const v = await db.viewing.create({
    data: {
      orgId, leadId: lead.id, agentId, scheduledAt: soon(3), durationMins: 45,
      address: `${who} Tower, Dubai Marina`, building: `${who} Tower`,
    },
  });
  made.viewings.push(v.id);
  return { lead, viewing: v };
}

const mine = await agent(home.id, "mine");
const theirs = await agent(home.id, "theirs");

const other = await db.organisation.create({
  data: { name: `Rival Brokerage ${STAMP}`, slug: `rival-${STAMP}` },
});
made.orgs.push(other.id);
const rival = await agent(other.id, "rival");

const A = await viewingFor(home.id, mine.user.id, `Mine${STAMP}`);
const B = await viewingFor(home.id, theirs.user.id, `Colleague${STAMP}`);
const C = await viewingFor(other.id, rival.user.id, `Rival${STAMP}`);

const url = (t) => `${APP}/api/calendar/${t}`;

console.log("\nThe viewings calendar\n");

/* ---------------- it serves ----------------------------------------- */
console.log("=== an agent subscribes and gets their diary ===");
let body = "";
{
  const r = await fetch(url(mine.membership.calendarToken));
  body = await r.text();
  ok("it answers", r.status === 200, `HTTP ${r.status}`);
  // A calendar client that gets the wrong content type shows nothing
  // and says nothing about why.
  ok("as a calendar, which is what Apple and Google parse",
     (r.headers.get("content-type") ?? "").includes("text/calendar"),
     r.headers.get("content-type") ?? "none");
  ok("it is a well-formed calendar",
     body.startsWith("BEGIN:VCALENDAR") && body.trimEnd().endsWith("END:VCALENDAR"),
     body.slice(0, 24).replace(/\r?\n/g, " "));
  ok("carrying the agent's viewing", body.includes(`Mine${STAMP}`),
     body.includes(`Mine${STAMP}`) ? "present" : "the agent's own viewing is missing");
  // The address is the reason an agent subscribes at all — it is what
  // their phone navigates to.
  ok("with somewhere to drive to", /LOCATION[;:]/.test(body),
     /LOCATION[;:]/.test(body) ? "yes" : "no LOCATION line");
  // A leaked .ics is a list of clients. Keep it out of search indexes.
  ok("and told search engines to stay away",
     (r.headers.get("x-robots-tag") ?? "").includes("noindex"),
     r.headers.get("x-robots-tag") ?? "none");
}

/* ---------------- THE POINT ------------------------------------------ */
console.log("\n=== and nobody else's, which is the whole reason for this file ===");
{
  /**
   * `agentId` — a colleague in the same brokerage.
   *
   * The realistic leak. An agent's diary is their book of clients, and
   * in a commission business that is the most sensitive thing they own.
   * Drop `agentId` from the route's where clause and this is the only
   * assertion in the repository that notices.
   */
  ok("a colleague's viewing is not in it", !body.includes(`Colleague${STAMP}`),
     body.includes(`Colleague${STAMP}`)
       ? "LEAK — another agent's diary is being served"
       : "absent");

  /**
   * `orgId` — a different brokerage entirely.
   *
   * The catastrophic one. There is no row-level security on this path,
   * so nothing but that clause prevents it.
   */
  ok("a rival brokerage's viewing is not in it", !body.includes(`Rival${STAMP}`),
     body.includes(`Rival${STAMP}`)
       ? "LEAK — another brokerage's viewings are being served"
       : "absent");

  /**
   * And the case that assertion does *not* cover, which is the one
   * `orgId` actually guards.
   *
   * Deleting `orgId` from the route's where clause failed nothing
   * above: every fixture user belongs to one brokerage, so filtering by
   * `agentId` alone already excluded the rival, and the assertion
   * passed while the clause it was meant to protect was gone. **A test
   * that cannot distinguish the thing it is named after is
   * decoration**, and this one was until this block existed.
   *
   * The real exposure is one person consulting for two brokerages —
   * which the schema allows, `@@unique([orgId, userId])` being per
   * membership, and which `org.switch` exists in anticipation of. Their
   * calendar token belongs to **one** membership. Filtering only by
   * `agentId` would hand whoever holds that URL their viewings at both
   * firms, in one file, which their phone then syncs to Google.
   */
  const bothMembership = await db.membership.create({
    data: { orgId: other.id, userId: mine.user.id, role: "AGENT", calendarToken: tok(), calendarTokenAt: new Date() },
  });
  made.memberships.push(bothMembership.id);
  const D = await viewingFor(other.id, mine.user.id, `Moonlight${STAMP}`);
  made.viewings.push(D.viewing.id);

  const dual = await fetch(url(mine.membership.calendarToken));
  const dualBody = await dual.text();
  ok("the same person's work at another brokerage is not in this feed",
     !dualBody.includes(`Moonlight${STAMP}`),
     dualBody.includes(`Moonlight${STAMP}`)
       ? "LEAK — one token is serving both brokerages' diaries"
       : "absent");
  // Both ways round again, so the assertion cannot pass by the fixture
  // simply having failed to render anywhere.
  const dual2 = await fetch(url(bothMembership.calendarToken));
  const dual2Body = await dual2.text();
  ok("and their other brokerage's token serves that one", dual2Body.includes(`Moonlight${STAMP}`),
     dual2Body.includes(`Moonlight${STAMP}`) ? "present" : "the fixture never rendered — the test above proves nothing");

  // And the same both ways round, so a pass cannot come from the rival
  // fixture simply not existing.
  const r = await fetch(url(rival.membership.calendarToken));
  const rivalBody = await r.text();
  ok("the rival's own feed works", rivalBody.includes(`Rival${STAMP}`),
     rivalBody.includes(`Rival${STAMP}`) ? "present" : "the fixture never rendered — the test above proves nothing");
  ok("and contains none of ours", !rivalBody.includes(`Mine${STAMP}`),
     rivalBody.includes(`Mine${STAMP}`) ? "LEAK — in the other direction" : "absent");
}

/* ---------------- the heartbeat -------------------------------------- */
console.log("\n=== the agent can tell whether their calendar is still collecting ===");
{
  let seen = null;
  for (let i = 0; i < 20 && !seen; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const m = await db.membership.findUnique({
      where: { id: mine.membership.id }, select: { calendarLastReadAt: true },
    });
    seen = m?.calendarLastReadAt ?? null;
  }
  // A subscription that quietly stops — a rotated token, a client that
  // gave up — is otherwise found by missing a viewing.
  ok("the fetch is recorded", !!seen,
     seen ? seen.toISOString() : "calendarLastReadAt is null — the settings screen can only show a URL and hope");
}

/* ---------------- rotation ------------------------------------------- */
console.log("\n=== rotating the address revokes the old one ===");
{
  const old = mine.membership.calendarToken;
  const fresh = tok();
  // What `org.rotateCalendarFeed` does: new token, and the heartbeat
  // cleared, because a rotation means nothing has collected the new
  // address yet and saying otherwise would be a lie on the screen.
  await db.membership.update({
    where: { id: mine.membership.id },
    data: { calendarToken: fresh, calendarTokenAt: new Date(), calendarLastReadAt: null },
  });

  const stale = await fetch(url(old));
  ok("the old address stops working", stale.status === 404, `HTTP ${stale.status}`);
  const now = await fetch(url(fresh));
  ok("and the new one works", now.status === 200, `HTTP ${now.status}`);
}

/* ---------------- a guessed address ---------------------------------- */
console.log("\n=== a guessed address gets nothing, and gives nothing away ===");
{
  const wrong = await fetch(url(tok()));
  ok("a well-formed but unknown token is refused", wrong.status === 404, `HTTP ${wrong.status}`);
  const short = await fetch(url("abc"));
  // Rejected on shape before the database is touched, so a scanner is free.
  ok("and a short one without a query", short.status === 404, `HTTP ${short.status}`);
  const wrongBody = await wrong.text();
  const shortBody = await short.text();
  // A different answer for "that token existed once" is a probe oracle.
  ok("both answer identically", wrongBody === shortBody,
     wrongBody === shortBody ? "same response" : "the two 404s differ — that is an oracle");
}

/* ---------------- leave nothing behind -------------------------------- */
await db.viewing.deleteMany({ where: { id: { in: made.viewings } } });
await db.lead.deleteMany({ where: { id: { in: made.leads } } });
await db.membership.deleteMany({ where: { id: { in: made.memberships } } });
await db.user.deleteMany({ where: { id: { in: made.users } } });
await db.organisation.deleteMany({ where: { id: { in: made.orgs } } });
await db.$disconnect();

console.log();
if (bad) { console.log(`${bad} PROBLEM(S)\n`); process.exit(1); }
console.log("  one agent's diary, and nobody else's.\n");
