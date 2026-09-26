/**
 * Two-step sign-in and the sessions list (the audit's C8), end to end.
 *
 * The router is driven directly for the flows; the three things that
 * decide whether it is a control rather than a setting are asked of the
 * running application over HTTP, with real session cookies:
 *
 *   - a device signed in by the link but not the code reaches no API,
 *   - and no screen — it is sent to the page that asks for the code,
 *   - and `/api/auth/session` never hands a script the session token.
 *
 * Needs the app running (`npm run dev`), like `check:billing`.
 */
import { randomBytes } from "node:crypto";
import { crossTenant } from "../src/server/db/client";
import { securityRouter } from "../src/server/api/routers/security";
import { totp } from "../src/server/lib/auth/totp";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const people = crossTenant("pre-tenant");
const BASE = process.env.CHECK_BASE_URL ?? "http://localhost:3000";
const SLUG = "two-step-check-";
const EMAIL = (k: string) => `two-step-check-${k}@example.com`;

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
const refused = async (fn: () => Promise<unknown>) => {
  try { await fn(); return null; } catch (e) { return e as { code?: string; message: string }; }
};

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    await root.auditLog.deleteMany({ where: { orgId: { in: ids } } }).catch(() => {});
    await root.membership.deleteMany({ where: { orgId: { in: ids } } });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  const users = await people.user.findMany({ where: { email: { startsWith: "two-step-check-" } }, select: { id: true } });
  await people.rateLimitHit.deleteMany({ where: { action: "auth.twoStep", key: { in: users.map((u) => `user:${u.id}`) } } });
  await people.session.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await people.user.deleteMany({ where: { id: { in: users.map((u) => u.id) } } });
}

const ctxFor = (orgId: string, userId: string, sid: string, twoStep: string) => ({
  session: { user: { id: userId }, sid, twoStep },
  membership: { orgId, orgName: "x", role: "OWNER" },
  ip: "127.0.0.1", userAgent: "two-step-check",
}) as never;

const cookie = (token: string) => ({ Cookie: `authjs.session-token=${token}` });

async function main() {
  console.log("\nTwo-step sign-in\n");
  const up = await fetch(`${BASE}/api/health`).then((r) => r.ok, () => false);
  ok("the application is running", up, up ? "" : `${BASE} unreachable — start it with \`npm run dev\``);
  if (!up) { console.log(`\n${bad} FAILURE(S)\n`); process.exit(1); }

  await cleanup();
  const org = await root.organisation.create({ data: { name: "Two Step Realty", slug: `${SLUG}${Date.now().toString(36)}` } });
  const me = await people.user.create({ data: { email: EMAIL("owner"), name: "Maya Chen" } });
  const stranger = await people.user.create({ data: { email: EMAIL("stranger"), name: "Someone Else" } });
  await root.membership.create({ data: { orgId: org.id, userId: me.id, role: "OWNER" } });
  const expires = new Date(Date.now() + 86_400_000);
  const tokA = `two-step-a-${randomBytes(8).toString("hex")}`;
  const tokB = `two-step-b-${randomBytes(8).toString("hex")}`;
  const A = await people.session.create({ data: { sessionToken: tokA, userId: me.id, expires, activeOrgId: org.id, lastActiveAt: new Date(Date.now() - 3_600_000) } });
  const B = await people.session.create({ data: { sessionToken: tokB, userId: me.id, expires, activeOrgId: org.id } });
  const theirs = await people.session.create({ data: { sessionToken: `two-step-c-${randomBytes(8).toString("hex")}`, userId: stranger.id, expires } });

  console.log("=== what the browser is told about a session ===");
  {
    const body = await fetch(`${BASE}/api/auth/session`, { headers: cookie(tokA) }).then((r) => r.text());
    ok("the session token is never in it", !body.includes(tokA), body.slice(0, 120));
    ok("nor the user's row", !/totpSecret|totpRecovery|emailVerified/.test(body));
    ok("it says two-step is off", JSON.parse(body).twoStep === "off", JSON.parse(body).twoStep);
  }

  console.log("\n=== turning it on ===");
  const S = securityRouter.createCaller(ctxFor(org.id, me.id, A.id, "off"));
  const status0 = await S.status();
  ok("an owner is asked to turn it on", status0.recommended && !status0.enabled);
  const { secret, uri } = await S.begin();
  ok("a key for the app, and a link it opens", /^[A-Z2-7]{32}$/.test(secret) && uri.startsWith("otpauth://totp/PotatoFarm"), uri.slice(0, 40));
  const stored = await people.user.findUniqueOrThrow({ where: { id: me.id } });
  ok("the key is stored sealed, never in the clear", !!stored.totpSecret && !stored.totpSecret.includes(secret));
  ok("and nothing is on until a code proves the app has it", stored.totpEnabledAt === null);
  const wrong = await refused(() => S.confirm({ code: "000000" }));
  ok("a wrong first code switches nothing on", wrong?.code === "BAD_REQUEST", wrong?.code ?? "accepted");
  const now = new Date();
  const first = totp(secret, now);
  const { recoveryCodes } = await S.confirm({ code: first });
  ok("the right one does, and hands back ten recovery codes", recoveryCodes.length === 10);
  const after = await people.user.findUniqueOrThrow({ where: { id: me.id } });
  ok("only their hashes are kept", after.totpRecovery.length === 10 && !after.totpRecovery.includes(recoveryCodes[0]!));
  const [a1, b1] = await Promise.all([people.session.findUniqueOrThrow({ where: { id: A.id } }), people.session.findUniqueOrThrow({ where: { id: B.id } })]);
  ok("this device has passed; the other has not", a1.secondFactorAt !== null && b1.secondFactorAt === null);

  console.log("\n=== the other device, signed in by the link alone ===");
  {
    const s = await fetch(`${BASE}/api/auth/session`, { headers: cookie(tokB) }).then((r) => r.json() as Promise<{ twoStep?: string }>);
    ok("is told it needs the code", s.twoStep === "needed", s.twoStep);
    const sA = await fetch(`${BASE}/api/auth/session`, { headers: cookie(tokA) }).then((r) => r.json() as Promise<{ twoStep?: string }>);
    ok("while this one is through", sA.twoStep === "done", sA.twoStep);
    const api = await fetch(`${BASE}/api/trpc/org.mine`, { headers: cookie(tokB) });
    const apiA = await fetch(`${BASE}/api/trpc/org.mine`, { headers: cookie(tokA) });
    ok("reaches no API", api.status === 401 && apiA.status === 200, `${api.status} (and ${apiA.status} with the code)`);
    await new Promise((r) => setTimeout(r, 500));
    const seen = await people.user.findUniqueOrThrow({ where: { id: me.id }, select: { lastSeenAt: true } });
    const aRow = await people.session.findUniqueOrThrow({ where: { id: A.id }, select: { lastActiveAt: true, userAgent: true } });
    ok("using the app records when and from what — the team page's 'last seen' too",
       !!seen.lastSeenAt && Date.now() - aRow.lastActiveAt.getTime() < 60_000 && !!aRow.userAgent, `${seen.lastSeenAt?.toISOString()} · ${aRow.userAgent}`);
    const page = await fetch(`${BASE}/today`, { headers: cookie(tokB), redirect: "manual" });
    const loc = page.headers.get("location") ?? "";
    const html = page.status === 200 ? await page.text() : "";
    ok("and no screen: it is sent to the code page",
       (page.status >= 300 && page.status < 400 && loc.includes("/sign-in/two-step")) || html.includes("NEXT_REDIRECT;replace;/sign-in/two-step"),
       `${page.status} ${loc}`);
  }

  console.log("\n=== finishing sign-in there ===");
  const SB = securityRouter.createCaller(ctxFor(org.id, me.id, B.id, "needed"));
  const replay = await refused(() => SB.verify({ code: first }));
  ok("the code already used is refused", replay?.code === "BAD_REQUEST", replay?.code ?? "accepted");
  const viaRecovery = await SB.verify({ code: recoveryCodes[3]!.toLowerCase() });
  ok("a recovery code gets in, typed however", viaRecovery.usedRecovery && viaRecovery.recoveryLeft === 9, JSON.stringify(viaRecovery));
  const again = await refused(() => SB.verify({ code: recoveryCodes[3]! }));
  ok("and works once", again?.code === "BAD_REQUEST", again?.code ?? "accepted");
  const sB = await fetch(`${BASE}/api/auth/session`, { headers: cookie(tokB) }).then((r) => r.json() as Promise<{ twoStep?: string }>);
  ok("that device is through now", sB.twoStep === "done", sB.twoStep);

  console.log("\n=== too many guesses ===");
  {
    await people.rateLimitHit.deleteMany({ where: { action: "auth.twoStep", key: `user:${me.id}` } });
    const codes: (string | undefined)[] = [];
    for (let i = 0; i < 6; i++) codes.push((await refused(() => SB.verify({ code: String(100000 + i) })))?.code);
    ok("five wrong codes, then no more tries", codes.slice(0, 5).every((c) => c === "BAD_REQUEST") && codes[5] === "TOO_MANY_REQUESTS", codes.join(","));
    await people.rateLimitHit.deleteMany({ where: { action: "auth.twoStep", key: `user:${me.id}` } });
  }

  console.log("\n=== where you're signed in ===");
  {
    const list = await S.sessions();
    ok("both devices, this one marked", list.length === 2 && list.filter((s) => s.current).length === 1 && list.find((s) => s.current)!.id === A.id);
    const none = await S.signOut({ id: theirs.id });
    ok("somebody else's session id signs nobody out", none.count === 0 && !!(await people.session.findUnique({ where: { id: theirs.id } })));
    const { count } = await S.signOutOthers();
    ok("'sign out the others' ends the other device and keeps this one",
       count === 1 && !(await people.session.findUnique({ where: { id: B.id } })) && !!(await people.session.findUnique({ where: { id: A.id } })));
    const gone = await fetch(`${BASE}/api/trpc/org.mine`, { headers: cookie(tokB) });
    ok("and its cookie opens nothing", gone.status === 401, String(gone.status));
  }

  console.log("\n=== turning it off ===");
  {
    const wrongOff = await refused(() => S.disable({ code: "123456" }));
    ok("not without a current code", wrongOff?.code === "BAD_REQUEST", wrongOff?.code ?? "accepted");
    await S.disable({ code: totp(secret, new Date(Date.now() + 30_000)) });
    const u = await people.user.findUniqueOrThrow({ where: { id: me.id } });
    ok("with one, it is off and the key is gone", u.totpEnabledAt === null && u.totpSecret === null && u.totpRecovery.length === 0);
    const audits = await root.auditLog.findMany({ where: { orgId: org.id, action: { startsWith: "security." } }, select: { action: true } });
    ok("on, sign-outs and off are all in the audit log",
       ["security.twoStepOn", "security.signOutOthers", "security.twoStepOff"].every((a) => audits.some((x) => x.action === a)),
       audits.map((a) => a.action).join(", "));
  }

  await cleanup();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
