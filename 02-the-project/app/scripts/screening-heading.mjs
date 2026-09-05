import fs from "node:fs";
import pw from "playwright";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { sessionCookies } from "./lib/session-cookie.mjs";

/**
 * What a compliance file says it is, in every state it can be in.
 *
 * ## The bug this exists to stop coming back
 *
 * `/compliance/[kycId]` chose its heading with a ternary chain:
 * `CONFIRMED_MATCH` was named, `ERROR` was named, and **everything else**
 * became "Possible match". Two things fall into everything else — a
 * screening that came back `CLEAR`, and a file with no screening at all,
 * which is every file `openKycFile` creates until somebody presses the
 * button. Both rendered as a possible sanctions match to a compliance
 * officer, the second of them above an empty screening history.
 *
 * The comment beside that ternary made exactly the right argument about
 * `ERROR` — "calling that a possible match tells the officer a list came
 * back with a hit on this person when nothing was ever checked" — and
 * the code it justified did that very thing to the other two states.
 *
 * This is the screen where a decision goes on a permanent record with a
 * name and a timestamp against it, so manufacturing a match is the
 * expensive direction to be wrong in: it is the one somebody acts on.
 *
 * ## Why this is a browser check and not a unit test
 *
 * The first attempt fetched the page and searched the HTML. It failed on
 * all five cases, and it was the check that was wrong: the heading is
 * rendered client-side from a tRPC query, so none of those words are in
 * the server payload. Asserting on the map alone would prove the map and
 * not the screen. This opens the page.
 *
 *     npm run build && npm run start
 *     npm run browser:screening-heading
 */
function cp(){const r="/opt/pw-browsers";if(fs.existsSync(`${r}/chromium`))return `${r}/chromium`;
 for(const d of fs.readdirSync(r).filter(x=>x.startsWith("chromium")).sort().reverse()){
   const p=`${r}/${d}/chrome-linux/chrome`;if(fs.existsSync(p))return p;}}

let bad = 0;
const ok = (l, p, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };

const db = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED } } });
const org = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true } });
if (!org) { console.error("no organisation"); process.exit(1); }

const tag = randomUUID().slice(0, 8);
const made = [];
async function fileFor(result) {
  const lead = await db.lead.create({
    data: { orgId: org.id, name: `Head ${tag}`, phone: `+9715${Math.floor(Math.random() * 90000000 + 10000000)}` },
    select: { id: true },
  });
  made.push(lead.id);
  const kyc = await db.kycRecord.create({
    data: { orgId: org.id, leadId: lead.id, subjectType: "INDIVIDUAL",
            legalName: `Head ${tag}`, status: "NOT_STARTED" },
    select: { id: true },
  });
  if (result) {
    await db.screening.create({
      data: { orgId: org.id, kycId: kyc.id, nameChecked: `Head ${tag}`,
              provider: "none", result, lists: [], screenedAt: new Date() },
    });
  }
  return kyc.id;
}

const b = await pw.chromium.launch({ executablePath: cp() });
const ctx = await b.newContext({ viewport: { width: 1280, height: 900 } });
// The compliance officer. An owner cannot open this desk, by design.
await ctx.addCookies(sessionCookies("dev-session-compliance_officer"));
const p = await ctx.newPage();

console.log("\nA compliance file says what it actually is\n");

const CASES = [
  [null,               "Not screened yet",        "a file nobody has run"],
  ["CLEAR",            "No match",                "screened and clean"],
  ["ERROR",            "Check did not complete",  "the check failed, or no provider is configured"],
  ["POSSIBLE_MATCH",   "Possible match",          "a real possible match"],
  ["CONFIRMED_MATCH",  "Confirmed match",         "a real confirmed match"],
];

for (const [result, expected, why] of CASES) {
  const id = await fileFor(result);
  await p.goto(`http://localhost:3000/compliance/${id}`, { waitUntil: "networkidle" }).catch(() => {});
  await p.addStyleTag({ content: "nextjs-portal{display:none!important}" });
  await p.waitForTimeout(900);
  const h1 = (await p.locator("h1").first().innerText().catch(() => "")).trim();
  ok(`${why} reads "${expected}"`, h1 === expected, h1 || "(nothing rendered)");
  if (result !== "POSSIBLE_MATCH") {
    ok("  and is not called a possible match", h1 !== "Possible match",
       "manufacturing a match is the direction somebody acts on");
  }
}

await b.close();
await db.kycRecord.deleteMany({ where: { leadId: { in: made } } });
await db.lead.deleteMany({ where: { id: { in: made } } });
await db.$disconnect();

console.log(bad ? `\n  ${bad} failure(s)\n` : "\n  nothing is called a match that has not been matched.\n");
process.exitCode = bad ? 1 : 0;
