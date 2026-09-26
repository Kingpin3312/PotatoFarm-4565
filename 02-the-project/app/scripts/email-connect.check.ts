/**
 * A mailbox connects, syncs, keeps itself alive and stays its owner's.
 *
 * Google and Microsoft are stood up on loopback (4335, 4336) and the
 * application is pointed at them by `GOOGLE_OAUTH_BASE` and
 * `MICROSOFT_OAUTH_BASE`, as `check:meta-inbound` does for Graph. The
 * handshake is driven over HTTP against the running app with real session
 * cookies; syncs run in-process through the same `syncAccount` the job
 * calls.
 *
 * Needs the app running (`npm run dev`) with those variables set.
 */
import http from "node:http";
import { randomBytes } from "node:crypto";
import { crossTenant } from "../src/server/db/client";
import { syncAccount } from "../src/server/lib/email/sync";
import { fetchSecret, writeSecret } from "../src/server/lib/secrets/vault";
import { emailRouter } from "../src/server/api/routers/email";
import { blackbookRouter } from "../src/server/api/routers/blackbook";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const people = crossTenant("pre-tenant");
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3000";
const SLUG = "email-connect-check-";
const EMAIL = (k: string) => `email-connect-check-${k}@example.com`;
const CLIENT = "priya.client@example.test";

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};

/* ------------------------------ stand-ins ------------------------------ */

const google = { access: "g-access-1", refreshes: 0, refuseRefresh: false };
const microsoft = { access: "m-access-1", refreshes: 0 };

function body(req: http.IncomingMessage): Promise<URLSearchParams> {
  return new Promise((r) => { let d = ""; req.on("data", (c) => (d += c)); req.on("end", () => r(new URLSearchParams(d))); });
}
function json(res: http.ServerResponse, status: number, value: unknown) {
  res.writeHead(status, { "content-type": "application/json" }); res.end(JSON.stringify(value));
}

const gmailMsg = (id: string, from: string, subject: string) => ({
  id, threadId: `t-${id}`, snippet: `About ${subject}`, internalDate: String(Date.now()),
  payload: { headers: [{ name: "From", value: from }, { name: "To", value: "Agent <agent.mailbox@gmail.test>" }, { name: "Subject", value: subject }] },
});

const googleServer = http.createServer(async (req, res) => {
  const url = new URL(req.url!, "http://x");
  if (req.method === "POST" && url.pathname === "/token") {
    const f = await body(req);
    if (f.get("client_id") !== "check-google-client" || f.get("client_secret") !== "check-google-secret") return json(res, 401, { error: "invalid_client" });
    if (f.get("grant_type") === "authorization_code") {
      if (f.get("code") !== "good-code-g") return json(res, 400, { error: "invalid_grant" });
      return json(res, 200, { access_token: google.access, refresh_token: "g-refresh-secret", expires_in: 3600 });
    }
    if (f.get("grant_type") === "refresh_token") {
      if (google.refuseRefresh || f.get("refresh_token") !== "g-refresh-secret") return json(res, 400, { error: "invalid_grant" });
      google.refreshes++; google.access = `g-access-${google.refreshes + 1}`;
      return json(res, 200, { access_token: google.access, expires_in: 3600 });
    }
  }
  if (req.headers.authorization !== `Bearer ${google.access}`) return json(res, 401, { error: "unauthorized" });
  if (url.pathname === "/userinfo") return json(res, 200, { email: "Agent.Mailbox@gmail.test" });
  if (url.pathname === "/gmail/v1/users/me/profile") return json(res, 200, { historyId: "100" });
  if (url.pathname === "/gmail/v1/users/me/messages") return json(res, 200, { messages: [{ id: "m1" }, { id: "m2" }] });
  if (url.pathname === "/gmail/v1/users/me/history") {
    return json(res, 200, url.searchParams.get("startHistoryId") === "100"
      ? { history: [{ messagesAdded: [{ message: { id: "m3" } }] }], historyId: "101" }
      : { historyId: url.searchParams.get("startHistoryId") });
  }
  const m = url.pathname.match(/^\/gmail\/v1\/users\/me\/messages\/(\w+)$/);
  if (m) {
    const id = m[1]!;
    return json(res, 200, id === "m1" ? gmailMsg("m1", `Priya Nair <${CLIENT}>`, "The Marina flat")
      : id === "m2" ? gmailMsg("m2", "Newsletter <news@shop.test>", "Weekend sale")
      : gmailMsg("m3", `Priya Nair <${CLIENT}>`, "Offer on the flat"));
  }
  json(res, 404, {});
});

const microsoftServer = http.createServer(async (req, res) => {
  const url = new URL(req.url!, "http://x");
  if (req.method === "POST" && url.pathname === "/token") {
    const f = await body(req);
    if (f.get("client_id") !== "check-microsoft-client") return json(res, 401, { error: "invalid_client" });
    if (f.get("grant_type") === "authorization_code" && f.get("code") === "good-code-m") {
      return json(res, 200, { access_token: microsoft.access, refresh_token: "m-refresh-1", expires_in: 3600 });
    }
    return json(res, 400, { error: "invalid_grant" });
  }
  if (req.headers.authorization !== `Bearer ${microsoft.access}`) return json(res, 401, { error: "unauthorized" });
  if (url.pathname === "/v1.0/me") return json(res, 200, { mail: "agent@outlook.test" });
  if (url.pathname === "/v1.0/me/messages/delta") {
    return json(res, 200, {
      value: [{
        id: "o1", conversationId: "c1", subject: "Viewing on Thursday", bodyPreview: "Thursday works",
        from: { emailAddress: { address: CLIENT } }, toRecipients: [{ emailAddress: { address: "agent@outlook.test" } }],
        sentDateTime: new Date().toISOString(), webLink: "https://outlook.test/o1",
      }],
      "@odata.deltaLink": "http://127.0.0.1:4336/v1.0/me/messages/delta?token=next",
    });
  }
  json(res, 404, {});
});

/* ------------------------------ fixture ------------------------------- */

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    await root.secret.deleteMany({ where: { orgId: { in: ids } } }).catch(() => {});
    await root.emailMessage.deleteMany({ where: { orgId: { in: ids } } }).catch(() => {});
    await root.emailAccount.deleteMany({ where: { orgId: { in: ids } } }).catch(() => {});
    await root.auditLog.deleteMany({ where: { orgId: { in: ids } } }).catch(() => {});
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  const users = await people.user.findMany({ where: { email: { startsWith: "email-connect-check-" } }, select: { id: true } });
  await people.session.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await people.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
}

const cookie = (t: string) => ({ Cookie: `authjs.session-token=${t}` });
const location = (r: Response) => r.headers.get("location") ?? "";

async function main() {
  console.log("\nA mailbox, connected\n");
  const up = await fetch(`${BASE}/api/health`).then((r) => r.ok, () => false);
  ok("the application is running", up, up ? "" : `${BASE} unreachable`);
  if (!up) process.exit(1);
  await new Promise<void>((r) => googleServer.listen(4335, "127.0.0.1", () => r()));
  await new Promise<void>((r) => microsoftServer.listen(4336, "127.0.0.1", () => r()));

  await cleanup();
  const org = await root.organisation.create({ data: { name: "Mailbox Realty", slug: `${SLUG}${Date.now().toString(36)}` } });
  const agent = await people.user.create({ data: { email: EMAIL("agent"), name: "Tom Reilly" } });
  const other = await people.user.create({ data: { email: EMAIL("other"), name: "Nadia Aziz" } });
  await root.membership.createMany({ data: [{ orgId: org.id, userId: agent.id, role: "AGENT" }, { orgId: org.id, userId: other.id, role: "AGENT" }] });
  const tok = (k: string) => `email-check-${k}-${randomBytes(8).toString("hex")}`;
  const aTok = tok("a"), oTok = tok("o");
  const expires = new Date(Date.now() + 86_400_000);
  await people.session.createMany({ data: [
    { sessionToken: aTok, userId: agent.id, expires, activeOrgId: org.id },
    { sessionToken: oTok, userId: other.id, expires, activeOrgId: org.id },
  ] });
  const lead = await root.lead.create({ data: { orgId: org.id, phone: "+971509998877", name: "Priya Nair", email: CLIENT, assignedToId: agent.id } });

  console.log("=== starting ===");
  const start = await fetch(`${BASE}/api/oauth/google/start`, { headers: cookie(aTok), redirect: "manual" });
  const to = new URL(location(start));
  const state = to.searchParams.get("state") ?? "";
  ok("the agent is sent to Google with this app's id", to.host === "127.0.0.1:4335" && to.searchParams.get("client_id") === "check-google-client", to.origin + to.pathname);
  ok("asking to read mail only, with a refresh token", /gmail\.readonly/.test(to.searchParams.get("scope") ?? "") && !/modify|send|compose/.test(to.searchParams.get("scope") ?? "") && to.searchParams.get("access_type") === "offline");

  console.log("\n=== somebody else's link, or a forged one ===");
  const cb = (params: string, t: string) => fetch(`${BASE}/api/oauth/google/callback?${params}`, { headers: cookie(t), redirect: "manual" });
  const theirs = await cb(`code=good-code-g&state=${encodeURIComponent(state)}`, oTok);
  const forged = await cb(`code=good-code-g&state=${encodeURIComponent(state.replace(/.$/, (c) => (c === "A" ? "B" : "A")))}`, aTok);
  const none = await root.emailAccount.count({ where: { orgId: org.id } });
  ok("a colleague finishing the agent's link connects nothing", location(theirs).includes("problem=") && none === 0, location(theirs).slice(-60));
  ok("nor does a tampered state", location(forged).includes("problem="), location(forged).slice(-60));

  console.log("\n=== finishing ===");
  const done = await cb(`code=good-code-g&state=${encodeURIComponent(state)}`, aTok);
  const acct = await root.emailAccount.findFirst({ where: { orgId: org.id, agentId: agent.id } });
  ok("the mailbox is connected, to the agent", location(done).includes("connected=") && acct?.address === "agent.mailbox@gmail.test" && acct.provider === "GOOGLE", location(done).slice(-60));
  const secretRow = acct ? await root.secret.findUnique({ where: { ref: acct.secretRef } }) : null;
  ok("the tokens are sealed, not stored in the clear", !!secretRow && !secretRow.ciphertext.includes("g-refresh-secret"));
  const logged = await root.emailMessage.findMany({ where: { orgId: org.id } });
  ok("the first sync ran: mail with the client is on their record", logged.some((m) => m.leadId === lead.id && m.subject === "The Marina flat"), logged.map((m) => m.subject).join(" | "));
  ok("and the newsletter was never written", !logged.some((m) => m.subject === "Weekend sale"));
  ok("headers and a snippet only", logged.every((m) => (m.snippet ?? "").length <= 200));

  console.log("\n=== an hour later ===");
  const t = JSON.parse((await fetchSecret(acct!.secretRef))!);
  await writeSecret({ orgId: org.id, ref: acct!.secretRef, value: JSON.stringify({ ...t, expiresAt: Date.now() - 1000 }) });
  const r2 = await syncAccount(acct!.id);
  const after = await root.emailAccount.findUniqueOrThrow({ where: { id: acct!.id } });
  ok("an expired token is refreshed and the sync carries on", google.refreshes === 1 && r2.synced === 1 && after.cursor === "101", JSON.stringify(r2));
  const person = await blackbookRouter.createCaller({ session: { user: { id: agent.id } }, membership: { orgId: org.id, orgName: "x", role: "AGENT" }, ip: "1", userAgent: "x" } as never).person({ leadId: lead.id });
  ok("both emails are on the client's timeline", (person as { entries: { channel: string }[] }).entries.filter((e) => e.channel === "email").length === 2);

  console.log("\n=== access withdrawn at Google ===");
  google.refuseRefresh = true;
  const t2 = JSON.parse((await fetchSecret(acct!.secretRef))!);
  await writeSecret({ orgId: org.id, ref: acct!.secretRef, value: JSON.stringify({ ...t2, expiresAt: Date.now() - 1000 }) });
  await syncAccount(acct!.id);
  const broken = await root.emailAccount.findUniqueOrThrow({ where: { id: acct!.id } });
  ok("it says so, rather than looking like a quiet inbox", /disconnected/i.test(broken.lastError ?? ""), broken.lastError ?? "no error");

  console.log("\n=== whose it is ===");
  const E = (u: string) => emailRouter.createCaller({ session: { user: { id: u } }, membership: { orgId: org.id, orgName: "x", role: "AGENT" }, ip: "1", userAgent: "x" } as never);
  const mine = await E(agent.id).status();
  const theirStatus = await E(other.id).status();
  ok("the agent sees their mailbox; a colleague does not", mine.accounts.length === 1 && theirStatus.accounts.length === 0 && mine.google && mine.microsoft);
  const xDisc = await E(other.id).disconnect({ id: acct!.id }).then(() => "allowed", (e: { code?: string }) => e.code ?? "error");
  ok("and cannot disconnect it", xDisc === "NOT_FOUND", xDisc);
  await E(agent.id).disconnect({ id: acct!.id });
  const gone = await root.emailAccount.findUniqueOrThrow({ where: { id: acct!.id } });
  ok("disconnecting forgets the key and keeps the logged mail", !gone.active && !(await fetchSecret(acct!.secretRef)) && (await root.emailMessage.count({ where: { accountId: acct!.id } })) === 2);

  console.log("\n=== Microsoft, the same way ===");
  const mStart = await fetch(`${BASE}/api/oauth/microsoft/start`, { headers: cookie(aTok), redirect: "manual" });
  const mState = new URL(location(mStart)).searchParams.get("state") ?? "";
  const mDone = await fetch(`${BASE}/api/oauth/microsoft/callback?code=good-code-m&state=${encodeURIComponent(mState)}`, { headers: cookie(aTok), redirect: "manual" });
  const mAcct = await root.emailAccount.findFirst({ where: { orgId: org.id, provider: "MICROSOFT" } });
  const mMsg = await root.emailMessage.findFirst({ where: { orgId: org.id, subject: "Viewing on Thursday" } });
  ok("an Outlook mailbox connects and its mail with the client is logged", location(mDone).includes("connected=") && mAcct?.address === "agent@outlook.test" && mMsg?.leadId === lead.id, location(mDone).slice(-50));

  await cleanup();
  googleServer.close(); microsoftServer.close();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
