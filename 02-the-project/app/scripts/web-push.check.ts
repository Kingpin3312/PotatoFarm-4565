import http from "node:http";
import { createECDH, createPublicKey, hkdfSync, randomBytes, createDecipheriv, verify } from "node:crypto";
import webpush from "web-push";
import { crossTenant } from "../src/server/db/client";
import { orgRouter } from "../src/server/api/routers/org";
import { sendPush } from "../src/server/lib/notify/push";
import { dispatch } from "../src/server/lib/notify/dispatch";
import { releaseHeld } from "../src/server/lib/notify/digest";
import { pushEndpointProblem } from "../src/server/lib/notify/web-push";
import { fatal } from "./fatal";

/**
 * Phone alerts by Web Push, proved against a stand-in push service.
 *
 * The stand-in plays Google's or Apple's part: it receives what this
 * server sends, checks the VAPID signature the way they do, and decrypts
 * the payload with **its own** RFC 8291 implementation (node:crypto, not
 * the library the server uses), so "encrypted" is shown, not assumed. It
 * answers 410 when told to, the way a push service says a phone has
 * dropped the subscription.
 *
 * What it proves:
 *   - an alert reaches a subscribed phone, signed and end-to-end
 *     encrypted, with the page to open;
 *   - the server never POSTs to an address that is not a push service
 *     (an internal address, another site, another port, credentials);
 *   - a dead subscription stops being sent to;
 *   - signing a phone out stops its alerts, and only its owner's next
 *     sign-in revives them — another person signing in on it does not
 *     inherit them;
 *   - "Push to my phone" off means no push, while the alert still lands
 *     on the in-app list and is not queued for the digest;
 *   - the stand-in origin is ignored in production.
 */

const root = crossTenant("sweep");
const SLUG = "web-push-check-";
const RUN = Date.now().toString(36);
let bad = 0;
const ok = (l: string, p: boolean, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };

const b64u = (b: Buffer) => b.toString("base64url");
const unb64u = (s: string) => Buffer.from(s, "base64url");

/** A browser's half of a subscription: its key pair and auth secret. */
function fakeBrowser() {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { ecdh, p256dh: b64u(ecdh.getPublicKey()), auth: b64u(randomBytes(16)) };
}

/** RFC 8291 decryption, written here independently of the sender. */
function decrypt(body: Buffer, browser: ReturnType<typeof fakeBrowser>) {
  const salt = body.subarray(0, 16);
  const idlen = body[20]!;
  const serverKey = body.subarray(21, 21 + idlen);
  const ciphertext = body.subarray(21 + idlen);
  const shared = browser.ecdh.computeSecret(serverKey);
  const info = Buffer.concat([Buffer.from("WebPush: info\0"), browser.ecdh.getPublicKey(), serverKey]);
  const ikm = Buffer.from(hkdfSync("sha256", shared, unb64u(browser.auth), info, 32));
  const cek = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16));
  const nonce = Buffer.from(hkdfSync("sha256", ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12));
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ciphertext.subarray(ciphertext.length - 16));
  const plain = Buffer.concat([d.update(ciphertext.subarray(0, ciphertext.length - 16)), d.final()]);
  let end = plain.length - 1;
  while (end > 0 && plain[end] === 0) end--;            // padding
  return JSON.parse(plain.subarray(0, end).toString()); // before the 0x02 delimiter
}

/** RFC 8292: the signature a push service checks before accepting. */
function vapidValid(authz: string, audience: string, publicKey: string) {
  const m = /^vapid t=([^,]+),\s*k=(.+)$/.exec(authz);
  if (!m || m[2] !== publicKey) return "no vapid header, or the wrong key";
  const [h, p, s] = m[1]!.split(".");
  const point = unb64u(publicKey);
  const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: b64u(point.subarray(1, 33)), y: b64u(point.subarray(33, 65)) }, format: "jwk" });
  const good = verify("sha256", Buffer.from(`${h}.${p}`), { key, dsaEncoding: "ieee-p1363" }, unb64u(s!));
  if (!good) return "signature does not verify";
  const claims = JSON.parse(unb64u(p!).toString());
  if (claims.aud !== audience) return `audience ${claims.aud}`;
  if (!(claims.exp > Date.now() / 1000 && claims.exp <= Date.now() / 1000 + 24 * 3600 + 60)) return "expiry out of range";
  if (!/^(mailto:|https:)/.test(claims.sub ?? "")) return "no contact subject";
  return null;
}

type Hit = { path: string; headers: http.IncomingHttpHeaders; body: Buffer };

async function main() {
  console.log("\nPhone alerts by Web Push\n");

  // The stand-in push service.
  const hits: Hit[] = [];
  const answer = new Map<string, number>();
  const server = http.createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      hits.push({ path: req.url ?? "", headers: req.headers, body: Buffer.concat(chunks) });
      res.writeHead(answer.get(req.url ?? "") ?? 201).end();
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  process.env.PUSH_TEST_ORIGIN = origin;
  if (!process.env.VAPID_PUBLIC_KEY || !process.env.VAPID_PRIVATE_KEY) {
    const k = webpush.generateVAPIDKeys();
    process.env.VAPID_PUBLIC_KEY = k.publicKey;
    process.env.VAPID_PRIVATE_KEY = k.privateKey;
  }
  const PUBLIC = process.env.VAPID_PUBLIC_KEY!;

  await cleanup();
  const org = await root.organisation.create({ data: { name: "Alerts", slug: `${SLUG}a` } });
  const mk = (k: string, name: string) => root.user.create({ data: { email: `web-push-check-${k}-${RUN}@example.com`, name } });
  const agent = await mk("a", "Tom Reilly");
  const other = await mk("b", "Nadia Aziz");
  await root.membership.createMany({ data: [
    { orgId: org.id, userId: agent.id, role: "AGENT" },
    { orgId: org.id, userId: other.id, role: "AGENT" },
  ] });
  const signIn = (userId: string) => root.session.create({
    data: { sessionToken: `web-push-check-${randomBytes(12).toString("hex")}`, userId, expires: new Date(Date.now() + 86_400_000), activeOrgId: org.id },
  });
  const as = (userId: string, sid: string) => orgRouter.createCaller({
    session: { user: { id: userId }, sid }, membership: { orgId: org.id, orgName: "Alerts", role: "AGENT" },
    ip: "127.0.0.1", userAgent: "web-push-check",
  } as never);
  const code = (p: Promise<unknown>) => p.then(() => "allowed", (e: { code?: string }) => e.code ?? "error");

  const s1 = await signIn(agent.id);
  const A = as(agent.id, s1.id);
  const phone = fakeBrowser();
  const endpoint = `${origin}/push/${RUN}-a`;

  console.log("=== addresses the server will post to ===");
  for (const [what, url] of [
    ["the cloud metadata address", "http://169.254.169.254/latest/meta-data"],
    ["a site that is not a push service", "https://attacker.example.com/push/1"],
    ["a push service on another port", "https://fcm.googleapis.com:8443/fcm/send/x"],
    ["a push service with credentials", "https://user:pw@fcm.googleapis.com/fcm/send/x"],
    ["plain http", "http://fcm.googleapis.com/fcm/send/x"],
  ] as const) {
    const r = await code(A.pushSubscribe({ endpoint: url, keys: { p256dh: phone.p256dh, auth: phone.auth }, label: "Android" }));
    ok(`refused: ${what}`, r === "BAD_REQUEST", r);
  }
  ok("and nothing refused was stored", (await root.pushDevice.count({ where: { userId: agent.id } })) === 0);
  ok("Google, Apple and Mozilla's services are accepted",
     [ "https://fcm.googleapis.com/fcm/send/abc", "https://web.push.apple.com/QGx", "https://updates.push.services.mozilla.com/wpush/v2/x" ]
       .every((u) => pushEndpointProblem(u) === null));

  console.log("\n=== turning alerts on, and an alert arriving ===");
  const setup = await A.pushSetup();
  ok("the page is given the server's public key", setup.publicKey === PUBLIC);
  await A.pushSubscribe({ endpoint, keys: { p256dh: phone.p256dh, auth: phone.auth }, label: "iPhone" });
  const listed = (await A.pushSetup()).devices;
  ok("the phone is listed, as this phone, receiving", listed.length === 1 && listed[0]!.thisSignIn && listed[0]!.working && listed[0]!.label === "iPhone");
  ok("the list never carries the address or the keys", !JSON.stringify(listed).includes(endpoint) && !JSON.stringify(listed).includes(phone.auth));
  const renewed = `${origin}/push/${RUN}-renewed`;
  await A.pushSubscribe({ endpoint: renewed, keys: { p256dh: phone.p256dh, auth: phone.auth }, label: "iPhone" });
  const after = await root.pushDevice.findMany({ where: { userId: agent.id }, select: { token: true } });
  ok("a renewed subscription in the same browser replaces the old one", after.length === 1 && after[0]!.token === renewed, after.map((d) => d.token.slice(-12)).join(", "));
  await A.pushSubscribe({ endpoint, keys: { p256dh: phone.p256dh, auth: phone.auth }, label: "iPhone" });

  hits.length = 0;
  const sent = await A.pushTest();
  ok("a test alert is delivered", sent.sent === 1 && hits.length === 1, `${sent.sent} sent, ${hits.length} received`);
  const hit = hits[0];
  if (hit) {
    ok("signed with the server's key, for this push service", vapidValid(String(hit.headers.authorization ?? ""), origin, PUBLIC) === null,
       vapidValid(String(hit.headers.authorization ?? ""), origin, PUBLIC) ?? "");
    ok("encrypted end to end (aes128gcm), unreadable on the way", hit.headers["content-encoding"] === "aes128gcm" && !hit.body.includes(Buffer.from("Alerts are on")));
    const msg = decrypt(hit.body, phone);
    ok("and the phone can read it: title, words and the page to open",
       msg.title === "Alerts are on" && /reach this phone/.test(msg.body) && msg.url === "/me", JSON.stringify(msg).slice(0, 100));
    ok("held for a phone that is off, but not for ever", Number(hit.headers.ttl) > 0 && Number(hit.headers.ttl) <= 24 * 3600, String(hit.headers.ttl));
  }

  console.log("\n=== an alert from the product itself ===");
  hits.length = 0;
  await dispatch({
    orgId: org.id, kind: "VIEWING_SOON", subjectId: `v-${RUN}`, title: "Viewing in an hour",
    body: "Marina Gate 1, 2-bed, with the buyer you spoke to on Monday.", deeplink: "/viewings",
    assignedToId: agent.id, since: new Date(),
  });
  const urgent = hits[0] ? decrypt(hits[0].body, phone) : null;
  ok("a viewing reminder buzzes the agent's phone, opening the diary", urgent?.title === "Viewing in an hour" && urgent?.url === "/viewings");
  const row = await root.notification.findFirst({ where: { userId: agent.id, subjectId: `v-${RUN}` } });
  ok("and is recorded as delivered", !!row?.deliveredAt);

  console.log("\n=== Push to my phone, off ===");
  await root.notificationPrefs.upsert({
    where: { orgId_userId: { orgId: org.id, userId: agent.id } },
    create: { orgId: org.id, userId: agent.id, push: false, email: false },
    update: { push: false, email: false },
  });
  hits.length = 0;
  await dispatch({
    orgId: org.id, kind: "VIEWING_SOON", subjectId: `v2-${RUN}`, title: "Viewing in an hour",
    body: "JBR, 3-bed.", deeplink: "/viewings", assignedToId: agent.id, since: new Date(),
  });
  const quiet = await root.notification.findFirst({ where: { userId: agent.id, subjectId: `v2-${RUN}` } });
  ok("nothing reaches the phone", hits.length === 0, `${hits.length} received`);
  ok("it is on the in-app list, not delivered, and not queued for the digest",
     !!quiet && !quiet.deliveredAt && quiet.suppressed === null, quiet ? `delivered ${!!quiet.deliveredAt}, suppressed ${quiet.suppressed}` : "no row");

  console.log("\n=== Email me as well ===");
  // The same stand-in plays the mail service: it records the POST to
  // /emails, the way Resend would receive it.
  process.env.RESEND_API_BASE = origin;
  const heldKey = process.env.RESEND_API_KEY;
  process.env.RESEND_API_KEY = "check-only-not-a-key";
  const mails = () => hits.filter((h) => h.path === "/emails").map((h) => JSON.parse(h.body.toString()));
  await root.notificationPrefs.update({ where: { orgId_userId: { orgId: org.id, userId: agent.id } }, data: { push: false, email: true } });
  hits.length = 0;
  await dispatch({
    orgId: org.id, kind: "VIEWING_SOON", subjectId: `v3-${RUN}`, title: "Viewing in an hour",
    body: "Palm Jumeirah, <b>4-bed</b> villa.", deeplink: "/viewings", assignedToId: agent.id, since: new Date(),
  });
  const mail = mails()[0];
  ok("push off, email on: the alert arrives by email, and only by email",
     mails().length === 1 && hits.filter((h) => h.path.startsWith("/push/")).length === 0, `${mails().length} email(s)`);
  ok("to the agent's own address, titled as the alert",
     mail?.to === agent.email && mail?.subject === "Viewing in an hour", `${mail?.to} · ${mail?.subject}`);
  ok("with a button to the page it is about, and the words escaped",
     String(mail?.html).includes("/viewings\"") && String(mail?.html).includes("&lt;b&gt;4-bed&lt;/b&gt;") && !String(mail?.html).includes("<b>4-bed"));
  const byMail = await root.notification.findFirst({ where: { userId: agent.id, subjectId: `v3-${RUN}` } });
  ok("and it counts as delivered", !!byMail?.deliveredAt);

  // The morning summary of what was held, by email when push is off.
  await root.notification.create({ data: {
    orgId: org.id, userId: agent.id, kind: "PERMIT_EXPIRING", subjectId: `held-${RUN}`,
    title: "Permit expires in 14 days", body: "MG-202", deeplink: "/listings", suppressed: "held for the digest",
  } });
  hits.length = 0;
  await releaseHeld();
  ok("what was held overnight is summarised by email", mails().some((m) => m.to === agent.email && /Permit expires/.test(m.subject)),
     mails().map((m) => m.subject).join(" · "));

  await root.notificationPrefs.update({ where: { orgId_userId: { orgId: org.id, userId: agent.id } }, data: { push: false, email: false } });
  hits.length = 0;
  await dispatch({
    orgId: org.id, kind: "VIEWING_SOON", subjectId: `v4-${RUN}`, title: "Viewing in an hour",
    body: "x", deeplink: "/viewings", assignedToId: agent.id, since: new Date(),
  });
  ok("both off: nothing is sent by either route", hits.length === 0, `${hits.length} request(s)`);
  if (heldKey === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = heldKey;
  delete process.env.RESEND_API_BASE;
  await root.notificationPrefs.update({ where: { orgId_userId: { orgId: org.id, userId: agent.id } }, data: { push: true, email: false } });

  console.log("\n=== signing a phone out ===");
  await root.session.delete({ where: { id: s1.id } });
  const sTmp = await signIn(agent.id);
  const seen = (await as(agent.id, sTmp.id).pushSetup()).devices.find((d) => !d.thisSignIn);
  ok("the list shows it signed out at once, before any alert is tried", !!seen && !seen.working && seen.why === "signed out on this device");
  hits.length = 0;
  const afterOut = await sendPush(agent.id, { title: "x", body: "y", deeplink: "/today" });
  ok("a signed-out phone gets nothing", hits.length === 0 && afterOut.sent === 0, `${hits.length} received`);
  ok("and shows as signed out in the list",
     (await root.pushDevice.findFirst({ where: { token: endpoint } }))?.failReason === "signed out on this device");

  const s2 = await signIn(other.id);
  const B = as(other.id, s2.id);
  ok("somebody else signing in on that phone does not inherit its alerts",
     (await B.pushRefresh({ endpoint })).known === false
       && (await root.pushDevice.findFirst({ where: { token: endpoint } }))?.userId === agent.id);

  const s3 = await signIn(agent.id);
  const A2 = as(agent.id, s3.id);
  ok("the owner signing back in revives them", (await A2.pushRefresh({ endpoint })).known === true);
  hits.length = 0;
  ok("and the next alert arrives", (await sendPush(agent.id, { title: "x", body: "y", deeplink: "/today" })).sent === 1 && hits.length === 1);

  console.log("\n=== a phone that dropped the subscription ===");
  answer.set(new URL(endpoint).pathname, 410);
  hits.length = 0;
  await sendPush(agent.id, { title: "x", body: "y", deeplink: "/today" });
  const dead = await root.pushDevice.findFirst({ where: { token: endpoint } });
  ok("410 marks it dead", !!dead?.failedAt, dead?.failReason ?? "");
  hits.length = 0;
  const next = await sendPush(agent.id, { title: "x", body: "y", deeplink: "/today" });
  ok("and it is never sent to again", hits.length === 0 && next.sent === 0 && next.noDevice === true);
  answer.delete(new URL(endpoint).pathname);

  console.log("\n=== one browser, handed on ===");
  await A2.pushRefresh({ endpoint });            // working again
  await B.pushSubscribe({ endpoint, keys: { p256dh: phone.p256dh, auth: phone.auth }, label: "iPhone" });
  hits.length = 0;
  const toA = await sendPush(agent.id, { title: "x", body: "y", deeplink: "/today" });
  ok("when the new person turns alerts on, the old owner's stop", toA.sent === 0 && hits.length === 0);
  ok("and nobody can remove another person's device", (await A2.pushForget({ id: (await root.pushDevice.findFirst({ where: { token: endpoint } }))!.id })).removed === 0);

  console.log("\n=== a stored address that is not a push service ===");
  await root.pushDevice.create({ data: {
    orgId: org.id, userId: agent.id, token: "https://attacker.example.com/collect", platform: "WEB",
    provider: "webpush", p256dh: phone.p256dh, auth: phone.auth, sessionId: s3.id,
  } });
  const smuggled = await sendPush(agent.id, { title: "x", body: "y", deeplink: "/today" });
  const refused = await root.pushDevice.findFirst({ where: { token: "https://attacker.example.com/collect" } });
  ok("is refused at send time too, and marked dead", smuggled.sent === 0 && /refused endpoint/.test(refused?.failReason ?? ""), refused?.failReason ?? "");

  console.log("\n=== production ===");
  const env = process.env as Record<string, string | undefined>;
  const was = env.NODE_ENV;
  env.NODE_ENV = "production";
  ok("the stand-in origin is ignored in production", pushEndpointProblem(endpoint) !== null, pushEndpointProblem(endpoint) ?? "");
  env.NODE_ENV = was;

  server.close();
  await cleanup();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

async function cleanup() {
  const users = await root.user.findMany({ where: { email: { startsWith: "web-push-check-" } }, select: { id: true } });
  const ids = users.map((u) => u.id);
  await root.pushDevice.deleteMany({ where: { userId: { in: ids } } });
  await root.session.deleteMany({ where: { userId: { in: ids } } });
  await root.rateLimitHit.deleteMany({ where: { key: { in: ids.map((i) => `user:${i}`) } } });
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (orgs.length) await root.organisation.deleteMany({ where: { id: { in: orgs.map((o) => o.id) } } });
  await root.user.deleteMany({ where: { id: { in: ids } } }).catch(() => {});
}

main().catch(fatal);
