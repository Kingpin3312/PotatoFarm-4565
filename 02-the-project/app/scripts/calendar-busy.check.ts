/**
 * A viewing is never offered on top of the agent's own appointments.
 *
 * The diary published viewings to an agent's phone and nothing read the
 * other way, so the booking screen — and the assistant — could offer a
 * buyer a slot the agent had already given to their dentist. This drives
 * the real mailbox sync against Google and Microsoft stand-ins on
 * loopback, then asks the real `availableSlots` what it would offer.
 *
 * What it proves: busy times are read for the connected agent only and
 * stored as times alone; each sync replaces the last; "free", cancelled
 * and "working elsewhere" do not block; Microsoft's paging is followed on
 * its own address and nowhere else; times Graph writes without a zone
 * are read as UTC; a mailbox connected before the calendar was asked for
 * says so and blocks nothing; disconnecting forgets the busy times.
 *
 *     npm run check:calendar-busy
 */
import http from "node:http";
import type { AddressInfo } from "node:net";
import { crossTenant } from "../src/server/db/client";
import { syncAccount, BUSY_DAYS } from "../src/server/lib/email/sync";
import { availableSlots } from "../src/server/lib/scheduling";
import { writeSecret } from "../src/server/lib/secrets/vault";
import { emailRouter } from "../src/server/api/routers/email";
import { fatal } from "./fatal";

// Dubai, so a time read without its zone would land four hours out and
// be caught rather than agree by accident with a UTC machine.
process.env.TZ = "Asia/Dubai";

const root = crossTenant("sweep");
const SLUG = "calendar-busy-check-";
const RUN = Date.now().toString(36);
const EMAIL = (k: string) => `calendar-busy-check-${k}-${RUN}@example.com`;

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
const json = (res: http.ServerResponse, status: number, v: unknown) => {
  res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(v));
};
const readBody = (req: http.IncomingMessage) => new Promise<string>((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(d)); });

/** 11:00 in Dubai, `days` from now, as an instant. */
function dubai(days: number, hour: number, minute = 0) {
  const d = new Date(Date.now() + days * 86_400_000);
  const [y, m, day] = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Dubai", year: "numeric", month: "2-digit", day: "2-digit" })
    .format(d).split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!, hour - 4, minute));
}
const graphTime = (d: Date) => d.toISOString().replace("Z", "").replace(/\.\d+$/, ".0000000");

/* ------------------------------ stand-ins ------------------------------ */

const google = { busy: [] as { start: string; end: string }[], refuse: false as false | "scope" | "rate" | "backend", asked: [] as { timeMin: string; timeMax: string; items: { id: string }[] }[] };
const googleServer = http.createServer(async (req, res) => {
  const url = new URL(req.url!, "http://x");
  if (req.headers.authorization !== "Bearer g-token") return json(res, 401, {});
  if (url.pathname === "/gmail/v1/users/me/profile") return json(res, 200, { historyId: "1" });
  if (url.pathname === "/gmail/v1/users/me/messages") return json(res, 200, { messages: [] });
  if (url.pathname === "/gmail/v1/users/me/history") return json(res, 200, { historyId: "1" });
  if (req.method === "POST" && url.pathname === "/calendar/v3/freeBusy") {
    google.asked.push(JSON.parse(await readBody(req)));
    if (google.refuse === "scope") return json(res, 403, { error: { code: 403, message: "Request had insufficient authentication scopes.", errors: [{ reason: "insufficientPermissions" }], status: "PERMISSION_DENIED" } });
    if (google.refuse === "rate") return json(res, 403, { error: { code: 403, message: "Rate Limit Exceeded", errors: [{ domain: "usageLimits", reason: "rateLimitExceeded" }] } });
    if (google.refuse === "backend") return json(res, 200, { calendars: { primary: { busy: [], errors: [{ domain: "global", reason: "backendError" }] } } });
    return json(res, 200, { calendars: { primary: { busy: google.busy } } });
  }
  json(res, 404, {});
});

let msBase = "";
let foreignHits = 0;
const foreign = http.createServer((_req, res) => { foreignHits++; json(res, 200, { value: [] }); });
let foreignBase = "";
const microsoftServer = http.createServer((req, res) => {
  const url = new URL(req.url!, "http://x");
  if (req.headers.authorization !== "Bearer m-token") return json(res, 401, {});
  if (url.pathname === "/v1.0/me/messages/delta") return json(res, 200, { value: [], "@odata.deltaLink": `${msBase}/v1.0/me/messages/delta?t=1` });
  if (url.pathname === "/v1.0/me/calendarView") {
    const ev = (showAs: string, start: Date, end: Date, isCancelled = false) =>
      ({ showAs, isCancelled, subject: "Private — never to be stored", start: { dateTime: graphTime(start), timeZone: "UTC" }, end: { dateTime: graphTime(end), timeZone: "UTC" } });
    if (url.searchParams.get("page") === "2") {
      return json(res, 200, {
        value: [ev("oof", dubai(4, 9), dubai(4, 18))],
        // A link elsewhere: the token must not follow it.
        "@odata.nextLink": `${foreignBase}/v1.0/me/calendarView?page=3`,
      });
    }
    return json(res, 200, {
      value: [
        ev("busy", dubai(3, 11), dubai(3, 12)),
        ev("tentative", dubai(3, 16), dubai(3, 17)),
        ev("free", dubai(3, 13), dubai(3, 14)),
        ev("workingElsewhere", dubai(3, 14), dubai(3, 15)),
        ev("busy", dubai(3, 9), dubai(3, 10), true),
      ],
      "@odata.nextLink": `${msBase}/v1.0/me/calendarView?page=2`,
    });
  }
  json(res, 404, {});
});

/* ------------------------------ fixture ------------------------------- */

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const where = { orgId: { in: ids } };
    await root.calendarBusy.deleteMany({ where });
    await root.secret.deleteMany({ where }).catch(() => {});
    await root.emailAccount.deleteMany({ where });
    await root.auditLog.deleteMany({ where }).catch(() => {});
    await root.workingHours.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "calendar-busy-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nA viewing is never offered on top of the agent's own appointments\n");
  const listen = (s: http.Server) => new Promise<string>((r) => s.listen(0, "127.0.0.1", () => r(`http://127.0.0.1:${(s.address() as AddressInfo).port}`)));
  const gBase = await listen(googleServer);
  msBase = await listen(microsoftServer);
  // `localhost` rather than 127.0.0.1: another origin, so "not Microsoft's".
  foreignBase = (await listen(foreign)).replace("127.0.0.1", "localhost");
  process.env.GOOGLE_OAUTH_BASE = gBase;
  process.env.MICROSOFT_OAUTH_BASE = msBase;
  await cleanup();

  const org = await root.organisation.create({ data: { name: "Diary Realty", slug: `${SLUG}${RUN}`, timezone: "Asia/Dubai" } });
  const mk = (k: string, name: string) => root.user.create({ data: { email: EMAIL(k), name } });
  const [ahmed, lena, omar] = await Promise.all([mk("ahmed", "Ahmed Khalil"), mk("lena", "Lena Popescu"), mk("omar", "Omar Haddad")]);
  await root.membership.createMany({ data: [ahmed, lena, omar].map((u) => ({ orgId: org.id, userId: u.id, role: "AGENT" as const })) });
  await root.workingHours.createMany({ data: [0, 1, 2, 3, 4, 5, 6].map((d) => ({ orgId: org.id, dayOfWeek: d, startMin: 9 * 60, endMin: 18 * 60 })) });

  const connect = async (agentId: string, provider: "GOOGLE" | "MICROSOFT", token: string, address: string) => {
    const ref = `calbusy-${provider.toLowerCase()}-${RUN}`;
    await writeSecret({ orgId: org.id, ref, value: JSON.stringify({ accessToken: token, refreshToken: "r", expiresAt: Date.now() + 3_600_000 }) });
    return root.emailAccount.create({ data: { orgId: org.id, agentId, provider, address, secretRef: ref } });
  };
  const slotsFor = async (agentId: string) => (await availableSlots({ orgId: org.id, agentId, from: new Date(), days: 7 })).slots;
  const offered = (slots: { start: Date }[], at: Date) => slots.some((s) => s.start.getTime() === at.getTime());

  console.log("=== Google: the agent's busy times are read ===");
  google.busy = [{ start: dubai(3, 11).toISOString(), end: dubai(3, 12).toISOString() }];
  const gAcct = await connect(ahmed.id, "GOOGLE", "g-token", "ahmed@gmail.test");
  const r1 = await syncAccount(gAcct.id);
  const rows1 = await root.calendarBusy.findMany({ where: { accountId: gAcct.id } });
  ok("the busy time is stored, as times only, for the agent who connected",
     rows1.length === 1 && rows1[0]!.agentId === ahmed.id && rows1[0]!.startsAt.getTime() === dubai(3, 11).getTime(),
     JSON.stringify({ r1, rows: rows1.length }));
  const asked = google.asked[0];
  const span = asked ? (new Date(asked.timeMax).getTime() - new Date(asked.timeMin).getTime()) / 86_400_000 : 0;
  ok(`it asked for the primary calendar, ${BUSY_DAYS} days ahead`, asked?.items?.[0]?.id === "primary" && Math.round(span) === BUSY_DAYS, `${span.toFixed(2)} days`);

  const ahmedSlots = await slotsFor(ahmed.id);
  ok("11:00 that day is not offered", !offered(ahmedSlots, dubai(3, 11)));
  ok("nor 10:30, which would run into it without time to get there", !offered(ahmedSlots, dubai(3, 10, 30)));
  ok("15:00 that day still is", offered(ahmedSlots, dubai(3, 15)));
  ok("a colleague's 11:00 is untouched", offered(await slotsFor(lena.id), dubai(3, 11)));

  console.log("\n=== each sync replaces the last ===");
  google.busy = [{ start: dubai(3, 15).toISOString(), end: dubai(3, 16).toISOString() }];
  await syncAccount(gAcct.id);
  const moved = await slotsFor(ahmed.id);
  ok("a moved appointment frees the old time and takes the new one",
     offered(moved, dubai(3, 11)) && !offered(moved, dubai(3, 15)),
     JSON.stringify({ rows: await root.calendarBusy.count({ where: { accountId: gAcct.id } }) }));

  console.log("\n=== a mailbox connected before the calendar was asked for ===");
  google.refuse = "scope";
  await syncAccount(gAcct.id);
  const refused = await root.emailAccount.findUniqueOrThrow({ where: { id: gAcct.id } });
  ok("it says the calendar is not shared, and mail still syncs",
     /isn't shared/.test(refused.calendarError ?? "") && refused.lastError === null && refused.lastSyncedAt !== null,
     refused.calendarError ?? "");
  ok("and nothing it read before still blocks a slot",
     (await root.calendarBusy.count({ where: { accountId: gAcct.id } })) === 0 && offered(await slotsFor(ahmed.id), dubai(3, 15)));
  const E = emailRouter.createCaller({ session: { user: { id: ahmed.id } }, membership: { orgId: org.id, orgName: org.name, role: "AGENT" }, ip: "127.0.0.1", userAgent: "calendar" } as never);
  const status = await E.status();
  ok("Settings → Email is told", status.accounts[0]?.calendarError === refused.calendarError);
  google.refuse = false;
  await syncAccount(gAcct.id);
  ok("once shared, the message clears", (await root.emailAccount.findUniqueOrThrow({ where: { id: gAcct.id } })).calendarError === null);

  console.log("\n=== Google having a bad minute is not the agent withholding anything ===");
  // Google answers 403 for a rate limit too, and reports `backendError`
  // inside a 200. Neither may clear what was read or ask for a reconnect.
  for (const mode of ["rate", "backend"] as const) {
    google.refuse = mode;
    await syncAccount(gAcct.id);
    const acct = await root.emailAccount.findUniqueOrThrow({ where: { id: gAcct.id } });
    ok(`a ${mode === "rate" ? "rate limit" : "backend error"} keeps the last busy times and asks nobody to reconnect`,
       acct.calendarError === null && !offered(await slotsFor(ahmed.id), dubai(3, 15)),
       `${acct.calendarError ?? "no message"} · ${await root.calendarBusy.count({ where: { accountId: gAcct.id } })} row(s)`);
  }
  google.refuse = false;

  console.log("\n=== Microsoft ===");
  const mAcct = await connect(omar.id, "MICROSOFT", "m-token", "omar@outlook.test");
  await syncAccount(mAcct.id);
  const mRows = await root.calendarBusy.findMany({ where: { accountId: mAcct.id }, orderBy: { startsAt: "asc" } });
  ok("busy, tentative and out of office block; free, working elsewhere and cancelled do not",
     mRows.length === 3, mRows.map((r) => r.startsAt.toISOString()).join(", "));
  ok("the second page is read, on Microsoft's own address", mRows.some((r) => r.startsAt.getTime() === dubai(4, 9).getTime()));
  ok("and a link anywhere else is not followed with the token", foreignHits === 0, `${foreignHits}`);
  ok("a time written without its zone is read as UTC, not local", mRows[0]?.startsAt.getTime() === dubai(3, 11).getTime(),
     `${mRows[0]?.startsAt.toISOString()} vs ${dubai(3, 11).toISOString()}`);
  const stored = JSON.stringify(await root.calendarBusy.findMany({ where: { orgId: org.id } }));
  ok("no title is stored anywhere", !stored.includes("Private"));
  const omarSlots = await slotsFor(omar.id);
  ok("Omar is not offered 11:00 or 16:00 that day, but is offered 13:30", !offered(omarSlots, dubai(3, 11)) && !offered(omarSlots, dubai(3, 16)) && offered(omarSlots, dubai(3, 13, 30)));

  console.log("\n=== disconnecting ===");
  const O = emailRouter.createCaller({ session: { user: { id: omar.id } }, membership: { orgId: org.id, orgName: org.name, role: "AGENT" }, ip: "127.0.0.1", userAgent: "calendar" } as never);
  await O.disconnect({ id: mAcct.id });
  ok("forgets the busy times", (await root.calendarBusy.count({ where: { accountId: mAcct.id } })) === 0 && offered(await slotsFor(omar.id), dubai(3, 11)));

  await cleanup();
  [googleServer, microsoftServer, foreign].forEach((s) => s.close());
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => { await cleanup().catch(() => {}); [googleServer, microsoftServer, foreign].forEach((s) => s.close()); fatal(e); });
