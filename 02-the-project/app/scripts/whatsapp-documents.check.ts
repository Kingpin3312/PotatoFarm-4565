/**
 * A passport sent on WhatsApp reaches the due diligence file.
 *
 * The identity panel gives the agent a message asking the buyer to send
 * their passport on WhatsApp — and the reply stopped at "[image]": the id
 * Meta sends, the only way to fetch the file, was dropped on arrival. This
 * drives the real inbound path, the real thread and the real filing
 * procedure against WhatsApp and storage stand-ins on loopback.
 *
 * What it proves: the reference is kept and never shown to the browser;
 * only an agent who can open the person files it, only into an open file,
 * once; the bytes prove the type; the size cap holds whatever Meta
 * declares; a file Meta no longer has says so; and the channel's token is
 * never sent anywhere but Meta's (here, the stand-in's) own address.
 *
 *     npm run check:whatsapp-documents
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { crossTenant } from "../src/server/db/client";
import { ingest } from "../src/server/lib/ingest";
import { amlRouter } from "../src/server/api/routers/aml";
import { conversationsRouter } from "../src/server/api/routers/conversations";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "wa-docs-check-";
const RUN = Date.now().toString(36);
const PNID = `pnid-wa-docs-${RUN}`;
const REF = `WADOCSCHECK${RUN.toUpperCase()}`;
const TOKEN = "check-only-whatsapp-token";
const BUCKET = "wadocs";

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
const code = (p: Promise<unknown>) => p.then(() => "allowed", (e: { code?: string }) => e.code ?? "error");
const said = (p: Promise<unknown>) => p.then(() => "", (e: { message?: string }) => e.message ?? "");

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 9)]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(2000, 1)]);
const EXE = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(1500, 2)]);
const BIG = 16 * 1024 * 1024;

/** Meta's media as the stand-in holds it. `away` is served from somewhere else entirely. */
let base = "", elsewhere = "";
const media: Record<string, { bytes?: Buffer; mime: string; declare?: number; away?: boolean; stream?: number }> = {
  "m-pass": { bytes: JPEG, mime: "image/jpeg" },
  "m-eid": { bytes: PDF, mime: "application/pdf" },
  "m-exe": { bytes: EXE, mime: "image/jpeg" },
  "m-big": { bytes: JPEG, mime: "image/jpeg", declare: BIG },
  "m-stream": { mime: "image/jpeg", stream: BIG },
  "m-away": { bytes: JPEG, mime: "image/jpeg", away: true },
  // Held until two requests are waiting for it, so the two filings below
  // are both past the "already filed?" look before either writes.
  "m-race": { bytes: JPEG, mime: "image/jpeg" },
};
const raceHeld: (() => void)[] = [];
const fetched: string[] = [];
const awayHits: (string | undefined)[] = [];

const objects = new Map<string, Buffer>();
const standIn = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  const path = decodeURIComponent(url.pathname);
  if (path.startsWith(`/${BUCKET}/`)) {
    const key = path.slice(BUCKET.length + 2);
    if (req.method === "PUT") {
      const parts: Buffer[] = [];
      req.on("data", (c) => parts.push(c));
      req.on("end", () => { objects.set(key, Buffer.concat(parts)); res.writeHead(200).end(); });
      return;
    }
    if (req.method === "DELETE") { objects.delete(key); res.writeHead(204).end(); return; }
    const body = objects.get(key);
    if (!body) { res.writeHead(404).end(); return; }
    res.writeHead(200).end(body);
    return;
  }
  const authed = req.headers.authorization === `Bearer ${TOKEN}`;
  if (path.startsWith("/graph/")) {
    const id = path.slice("/graph/".length);
    const m = media[id];
    if (!authed) { res.writeHead(401).end("{}"); return; }
    if (!m) { res.writeHead(404, { "content-type": "application/json" }).end(JSON.stringify({ error: { message: "gone" } })); return; }
    res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({
      url: `${m.away ? elsewhere : base}/media/${id}`, mime_type: m.mime,
      ...(m.stream ? {} : { file_size: m.declare ?? m.bytes!.length }),
    }));
    return;
  }
  if (path.startsWith("/media/")) {
    const id = path.slice("/media/".length);
    fetched.push(id);
    const m = media[id];
    if (!authed) { res.writeHead(401).end(); return; }
    if (!m) { res.writeHead(404).end(); return; }
    if (m.stream) {
      res.writeHead(200, { "content-type": m.mime });
      const chunk = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(1024 * 1024 - 4, 7)]);
      let sent = 0;
      const more = () => {
        while (sent < m.stream!) { sent += chunk.length; if (!res.write(chunk)) { res.once("drain", more); return; } }
        res.end();
      };
      res.on("error", () => {});
      more();
      return;
    }
    if (id === "m-race") {
      raceHeld.push(() => res.writeHead(200, { "content-type": m.mime }).end(m.bytes));
      const go = () => raceHeld.splice(0).forEach((f) => f());
      if (raceHeld.length >= 2) go(); else setTimeout(go, 5000);
      return;
    }
    res.writeHead(200, { "content-type": m.mime }).end(m.bytes);
    return;
  }
  res.writeHead(404).end("{}");
});
/** A host that is not Meta's. Whatever reaches it is recorded. */
const away = createServer((req, res) => { awayHits.push(req.headers.authorization); res.writeHead(200).end(JPEG); });

let wamid = 0;
const payload = (from: string, msg: Record<string, unknown>) => ({
  entry: [{ changes: [{ value: {
    metadata: { phone_number_id: PNID },
    contacts: [{ profile: { name: "Amira Saleh" } }],
    messages: [{ id: `wamid.wadocs.${RUN}.${++wamid}`, from: from.replace("+", ""), timestamp: String(Math.floor(Date.now() / 1000)), ...msg }],
  } }] }],
});

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const where = { orgId: { in: ids } };
    await root.kycDocument.deleteMany({ where });
    await root.kycRecord.deleteMany({ where });
    await root.notification.deleteMany({ where });
    await root.followUp.deleteMany({ where });
    await root.aiAction.deleteMany({ where }).catch(() => {});
    await root.message.deleteMany({ where });
    await root.conversation.deleteMany({ where });
    await root.leadOwnership.deleteMany({ where });
    await root.lead.deleteMany({ where });
    await root.channel.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "wa-docs-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nA passport sent on WhatsApp reaches the due diligence file\n");
  await new Promise<void>((r) => standIn.listen(0, "127.0.0.1", r));
  await new Promise<void>((r) => away.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(standIn.address() as AddressInfo).port}`;
  // Loopback too — `localhost` rather than 127.0.0.1, so it is a
  // different origin and counts as "not Meta's address".
  elsewhere = `http://localhost:${(away.address() as AddressInfo).port}`;
  Object.assign(process.env, {
    WHATSAPP_GRAPH_BASE: `${base}/graph`, ASSISTANT_API_BASE: base,
    S3_BUCKET: BUCKET, S3_ENDPOINT: base, S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_FORCE_PATH_STYLE: "true",
    [`SECRET_${REF}`]: TOKEN,
  });
  process.env.ANTHROPIC_API_KEY ||= "check-only-not-a-key";
  await cleanup();

  const org = await root.organisation.create({ data: { name: "Due Diligence Realty", slug: `${SLUG}${RUN}` } });
  const mk = (k: string) => root.user.create({ data: { email: `wa-docs-check-${k}-${RUN}@example.com`, name: k } });
  const [agent, colleague, viewer] = await Promise.all([mk("agent"), mk("colleague"), mk("viewer")]);
  await root.membership.createMany({ data: [
    { orgId: org.id, userId: agent.id, role: "AGENT" },
    { orgId: org.id, userId: colleague.id, role: "AGENT" },
    { orgId: org.id, userId: viewer.id, role: "VIEWER" },
  ] });
  await root.channel.create({ data: { orgId: org.id, type: "WHATSAPP", label: "Main", identifier: PNID, secretRef: REF } });
  const ctx = (userId: string, role: string) => ({
    session: { user: { id: userId } }, membership: { orgId: org.id, orgName: org.name, role }, ip: "127.0.0.1", userAgent: "wa-docs",
  }) as never;
  const A = amlRouter.createCaller(ctx(agent.id, "AGENT"));
  const C = amlRouter.createCaller(ctx(colleague.id, "AGENT"));
  const V = amlRouter.createCaller(ctx(viewer.id, "VIEWER"));
  const T = conversationsRouter.createCaller(ctx(agent.id, "AGENT"));

  const phone = `+97155${RUN.replace(/\D/g, "").padEnd(7, "5").slice(-7)}`;
  const lead = await root.lead.create({ data: { orgId: org.id, phone, name: "Amira Saleh", assignedToId: agent.id } });

  const arrive = async (msg: Record<string, unknown>) => {
    await ingest(payload(phone, msg));
    return root.message.findFirstOrThrow({ where: { orgId: org.id }, orderBy: [{ sentAt: "desc" }, { id: "desc" }] });
  };

  console.log("=== it arrives ===");
  const photo = await arrive({ type: "image", image: { id: "m-pass", mime_type: "image/jpeg", caption: "Here's my passport" } });
  ok("the photo's reference and type are kept, with a line for the thread",
     photo.mediaId === "m-pass" && photo.mediaType === "image/jpeg" && photo.body === "[photo] Here's my passport",
     JSON.stringify({ mediaId: photo.mediaId, body: photo.body }));
  const text = await arrive({ type: "text", text: { body: "Sent it" } });
  ok("a text message has none", text.mediaId === null);
  const convoId = photo.conversationId;
  const thread = await T.thread({ conversationId: convoId });
  const shown = thread.messages.find((m) => m.id === photo.id);
  ok("the thread says it is a photo not yet filed", JSON.stringify(shown?.file) === JSON.stringify({ kind: "photo", filed: false }), JSON.stringify(shown?.file));
  ok("and never hands Meta's id to the browser", !JSON.stringify(thread).includes("m-pass"));

  console.log("\n=== who may file it, and where ===");
  const noFile = await code(A.documentFromMessage({ messageId: photo.id, type: "PASSPORT" }));
  ok("with no file open there is nowhere to put it", noFile === "NOT_FOUND", noFile);
  await A.openFile({ leadId: lead.id });
  const kyc = await root.kycRecord.findUniqueOrThrow({ where: { leadId: lead.id } });
  const colleagueTry = await code(C.documentFromMessage({ messageId: photo.id, type: "PASSPORT" }));
  ok("a colleague who cannot open the person cannot file it", colleagueTry === "NOT_FOUND", colleagueTry);
  const viewerTry = await code(V.documentFromMessage({ messageId: photo.id, type: "PASSPORT" }));
  ok("a viewer cannot file it", viewerTry === "FORBIDDEN", viewerTry);
  const textTry = await code(A.documentFromMessage({ messageId: text.id, type: "PASSPORT" }));
  ok("a message with no file has nothing to file", textTry === "NOT_FOUND", textTry);
  ok("none of that fetched anything from Meta", fetched.length === 0, JSON.stringify(fetched));

  console.log("\n=== the agent files it ===");
  await A.documentFromMessage({ messageId: photo.id, type: "PASSPORT" });
  const key = `kyc/${org.id}/${kyc.id}/wa-${photo.id}`;
  ok("the bytes Meta holds are in the file's own storage", objects.get(key)?.equals(JPEG) === true, [...objects.keys()].join(","));
  const doc = await root.kycDocument.findFirst({ where: { kycId: kyc.id, storageRef: key } });
  ok("recorded as a passport that came by WhatsApp, unverified",
     doc?.type === "PASSPORT" && doc.collectedVia === "WHATSAPP" && doc.verifiedAt === null, JSON.stringify(doc && { type: doc.type, via: doc.collectedVia }));
  const moved = await root.kycRecord.findUniqueOrThrow({ where: { id: kyc.id } });
  ok("the file moves to review, and no further", moved.status === "PENDING_REVIEW", moved.status);
  const trail = await root.auditLog.findFirst({ where: { orgId: org.id, action: "aml.document_added", entityId: kyc.id } });
  ok("the audit row says what and how, nothing read off it",
     JSON.stringify(trail?.after ?? {}).includes('"via":"WHATSAPP"') && !JSON.stringify(trail?.after ?? {}).includes("passport\""),
     JSON.stringify(trail?.after));
  const twice = await code(A.documentFromMessage({ messageId: photo.id, type: "PASSPORT" }));
  ok("the same message cannot be filed twice", twice === "CONFLICT", twice);
  // And not at the same moment either: two tabs pressing "Add" both pass
  // the look-before-you-leap check while Meta is still answering (the
  // stand-in holds this download until both have asked). One row, one
  // CONFLICT — and the object stays, because it is the winner's.
  const again = await arrive({ type: "image", image: { id: "m-race", mime_type: "image/jpeg" } });
  const both = await Promise.all([
    code(A.documentFromMessage({ messageId: again.id, type: "PASSPORT" })),
    code(A.documentFromMessage({ messageId: again.id, type: "PASSPORT" })),
  ]);
  const againKey = `kyc/${org.id}/${kyc.id}/wa-${again.id}`;
  const againRows = await root.kycDocument.count({ where: { storageRef: againKey } });
  ok("filed from two tabs at once, it is filed once and the copy is kept",
     againRows === 1 && both.filter((c) => c === "CONFLICT").length === 1 && objects.has(againKey),
     `${againRows} row(s), ${both.join(" / ")}, object ${objects.has(againKey) ? "kept" : "gone"}`);
  const after = await T.thread({ conversationId: convoId });
  ok("the thread now says it is in the file", after.messages.find((m) => m.id === photo.id)?.file?.filed === true);

  const pdf = await arrive({ type: "document", document: { id: "m-eid", mime_type: "application/pdf", filename: "emirates-id.pdf" } });
  await A.documentFromMessage({ messageId: pdf.id, type: "EMIRATES_ID" });
  const eid = await root.kycDocument.findFirst({ where: { kycId: kyc.id, type: "EMIRATES_ID" } });
  ok("a PDF keeps the name it was sent with", pdf.body === "[document: emirates-id.pdf]" && eid?.fileName === "emirates-id.pdf", `${pdf.body} / ${eid?.fileName}`);
  const status = await A.fileStatus({ leadId: lead.id });
  ok("with both in, nothing is outstanding", status.exists && status.outstanding.length === 0);

  console.log("\n=== what is refused ===");
  const exe = await arrive({ type: "image", image: { id: "m-exe", mime_type: "image/jpeg" } });
  const exeCode = await code(A.documentFromMessage({ messageId: exe.id, type: "PASSPORT" }));
  ok("a program sent as a photo is refused, and nothing is stored", exeCode === "BAD_REQUEST" && !objects.has(`kyc/${org.id}/${kyc.id}/wa-${exe.id}`), exeCode);
  const gone = await arrive({ type: "image", image: { id: "m-gone", mime_type: "image/jpeg" } });
  const goneSaid = await said(A.documentFromMessage({ messageId: gone.id, type: "PASSPORT" }));
  ok("a file WhatsApp no longer has says to ask for it again", /send it again/.test(goneSaid), goneSaid);
  const big = await arrive({ type: "image", image: { id: "m-big", mime_type: "image/jpeg" } });
  const bigCode = await code(A.documentFromMessage({ messageId: big.id, type: "PASSPORT" }));
  ok("a file declared over the cap is refused before it is downloaded", bigCode === "BAD_REQUEST" && !fetched.includes("m-big"), `${bigCode} ${JSON.stringify(fetched)}`);
  const streamed = await arrive({ type: "image", image: { id: "m-stream", mime_type: "image/jpeg" } });
  const streamCode = await code(A.documentFromMessage({ messageId: streamed.id, type: "PASSPORT" }));
  ok("a file that declares nothing and runs over the cap is cut off", streamCode === "BAD_REQUEST" && !objects.has(`kyc/${org.id}/${kyc.id}/wa-${streamed.id}`), streamCode);
  const moved2 = await arrive({ type: "image", image: { id: "m-away", mime_type: "image/jpeg" } });
  const awayCode = await code(A.documentFromMessage({ messageId: moved2.id, type: "PASSPORT" }));
  ok("an address that is not Meta's is refused, and the token never goes there", awayCode !== "allowed" && awayHits.length === 0, `${awayCode} ${awayHits.length}`);

  await cleanup();
  standIn.close(); away.close();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => { await cleanup().catch(() => {}); standIn.close(); away.close(); fatal(e); });
