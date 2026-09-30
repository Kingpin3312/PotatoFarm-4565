/**
 * Identity documents in a due diligence file, end to end.
 *
 * Every open file said "Waiting on both documents" and nothing could put
 * one in; the only writer stored no bytes and nothing called it; and
 * nothing could mark a document checked. This drives the whole path
 * through the real procedures: the agent adds a passport, the file moves
 * to review, the agent cannot open or verify it, the compliance officer
 * opens it (and that is recorded) and checks it.
 *
 * Storage is an in-memory S3-shaped server on localhost, as in
 * `check:listing-photos`; `check:storage` proves the signing itself.
 *
 *     npm run check:kyc-documents
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { crossTenant } from "../src/server/db/client";
import { amlRouter } from "../src/server/api/routers/aml";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "kyc-docs-check-";
const RUN = Date.now().toString(36);

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
const code = (p: Promise<unknown>) => p.then(() => "allowed", (e: { code?: string }) => e.code ?? "error");

const objects = new Map<string, Buffer>();
const s3 = createServer((req, res) => {
  const key = decodeURIComponent(new URL(req.url ?? "/", "http://x").pathname);
  if (req.method === "PUT") {
    const parts: Buffer[] = [];
    req.on("data", (c) => parts.push(c));
    req.on("end", () => { objects.set(key, Buffer.concat(parts)); res.writeHead(200).end(); });
    return;
  }
  const body = objects.get(key);
  if (req.method === "DELETE") { objects.delete(key); res.writeHead(204).end(); return; }
  if (!body) { res.writeHead(404).end(); return; }
  if (req.method === "HEAD") { res.writeHead(200, { "content-length": body.length }).end(); return; }
  const range = /bytes=(\d+)-(\d+)/.exec(String(req.headers.range ?? ""));
  if (range) {
    const [a, b] = [Number(range[1]), Math.min(Number(range[2]), body.length - 1)];
    res.writeHead(206, { "content-range": `bytes ${a}-${b}/${body.length}` }).end(body.subarray(a, b + 1));
    return;
  }
  res.writeHead(200).end(body);
});

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 9)]);
const PDF = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.alloc(2000, 1)]);
const EXE = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(1500, 2)]);

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    // KYC documents are RESTRICT on the brokerage, as the law keeps them.
    // A check's own fixtures are the one thing allowed to go.
    await root.kycDocument.deleteMany({ where: { orgId: { in: ids } } });
    await root.kycRecord.deleteMany({ where: { orgId: { in: ids } } });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "kyc-docs-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nIdentity documents in a due diligence file\n");
  await new Promise<void>((r) => s3.listen(0, "127.0.0.1", r));
  const port = (s3.address() as AddressInfo).port;
  Object.assign(process.env, {
    S3_BUCKET: "kyc", S3_ENDPOINT: `http://127.0.0.1:${port}`, S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_FORCE_PATH_STYLE: "true",
  });
  await cleanup();

  const org = await root.organisation.create({ data: { name: "Due Diligence Realty", slug: `${SLUG}a-${RUN}` } });
  const rival = await root.organisation.create({ data: { name: "Rival", slug: `${SLUG}r-${RUN}` } });
  const mk = (k: string) => root.user.create({ data: { email: `kyc-docs-check-${k}-${RUN}@example.com`, name: k } });
  const [agent, colleague, officer, viewer] = await Promise.all([mk("agent"), mk("colleague"), mk("officer"), mk("viewer")]);
  await root.membership.createMany({ data: [
    { orgId: org.id, userId: agent.id, role: "AGENT" },
    { orgId: org.id, userId: colleague.id, role: "AGENT" },
    { orgId: org.id, userId: officer.id, role: "COMPLIANCE_OFFICER" },
    { orgId: org.id, userId: viewer.id, role: "VIEWER" },
    { orgId: rival.id, userId: officer.id, role: "OWNER" },
  ] });
  const ctx = (orgId: string, userId: string, role: string) => ({
    session: { user: { id: userId } }, membership: { orgId, orgName: "Due Diligence Realty", role }, ip: "127.0.0.1", userAgent: "kyc",
  }) as never;
  const A = amlRouter.createCaller(ctx(org.id, agent.id, "AGENT"));
  const C = amlRouter.createCaller(ctx(org.id, colleague.id, "AGENT"));
  const O = amlRouter.createCaller(ctx(org.id, officer.id, "COMPLIANCE_OFFICER"));
  const V = amlRouter.createCaller(ctx(org.id, viewer.id, "VIEWER"));
  const R = amlRouter.createCaller(ctx(rival.id, officer.id, "OWNER"));

  const lead = await root.lead.create({ data: {
    orgId: org.id, phone: `+97155${RUN.slice(-7).replace(/\D/g, "3").padStart(7, "4")}`, name: "Amira Saleh", assignedToId: agent.id,
  } });
  await A.openFile({ leadId: lead.id });
  const kyc = await root.kycRecord.findUniqueOrThrow({ where: { leadId: lead.id } });

  async function add(caller: typeof A, bytes: Buffer, mimeType: string, type: "PASSPORT" | "EMIRATES_ID", declared = bytes.length) {
    const t = await caller.documentUpload({ leadId: lead.id, type, fileName: `${type.toLowerCase()}.x`, mimeType, sizeBytes: declared });
    await fetch(t.uploadUrl, { method: "PUT", headers: { "content-type": mimeType }, body: new Uint8Array(bytes) });
    return { key: t.key, confirm: () => caller.documentConfirm({ leadId: lead.id, key: t.key, type, fileName: `${type.toLowerCase()}.x`, mimeType, sizeBytes: declared }) };
  }

  console.log("=== before ===");
  const before = await A.fileStatus({ leadId: lead.id });
  ok("an open file waits on both documents", before.exists && before.outstanding.length === 2, JSON.stringify(before.exists && before.outstanding));

  console.log("\n=== the agent adds what the buyer sent ===");
  const passport = await add(A, JPEG, "image/jpeg", "PASSPORT");
  ok("the upload is under this file's own prefix", passport.key.startsWith(`kyc/${org.id}/${kyc.id}/`), passport.key);
  const p1 = await passport.confirm();
  const after = await A.fileStatus({ leadId: lead.id });
  ok("the passport is in, one document is still outstanding, and it is unverified",
     after.exists && JSON.stringify(after.outstanding) === JSON.stringify(["EMIRATES_ID"]) && after.unverified === 1,
     JSON.stringify(after.exists && { outstanding: after.outstanding, unverified: after.unverified }));
  const moved = await root.kycRecord.findUniqueOrThrow({ where: { id: kyc.id } });
  ok("the file moves to review, and no further", moved.status === "PENDING_REVIEW", moved.status);
  const eid = await add(A, PDF, "application/pdf", "EMIRATES_ID");
  await eid.confirm();
  const both = await A.fileStatus({ leadId: lead.id });
  ok("with both in, nothing is outstanding", both.exists && both.outstanding.length === 0);

  console.log("\n=== what is refused ===");
  const exe = await add(A, EXE, "application/pdf", "PASSPORT");
  const exeCode = await code(exe.confirm());
  ok("a program declared as a PDF is refused and deleted", exeCode === "BAD_REQUEST" && !objects.has(`/kyc/${exe.key}`), exeCode);
  const heic = await code(A.documentUpload({ leadId: lead.id, type: "PASSPORT", fileName: "p.heic", mimeType: "image/heic", sizeBytes: 100 }));
  ok("a HEIC is refused before any bytes move", heic === "BAD_REQUEST", heic);
  // A real upload into the agent's other client's file, offered to this
  // one: the object exists and the bytes are good, so only the prefix
  // rule can refuse it.
  const second = await root.lead.create({ data: {
    orgId: org.id, phone: `+97156${RUN.slice(-7).replace(/\D/g, "5").padStart(7, "6")}`, name: "Omar Nasser", assignedToId: agent.id,
  } });
  await A.openFile({ leadId: second.id });
  const t2 = await A.documentUpload({ leadId: second.id, type: "PASSPORT", fileName: "o.jpg", mimeType: "image/jpeg", sizeBytes: JPEG.length });
  await fetch(t2.uploadUrl, { method: "PUT", headers: { "content-type": "image/jpeg" }, body: new Uint8Array(JPEG) });
  const forged = await code(A.documentConfirm({ leadId: lead.id, key: t2.key, type: "PASSPORT", fileName: "o.jpg", mimeType: "image/jpeg", sizeBytes: JPEG.length }));
  ok("another file's upload cannot be filed in this one", forged === "BAD_REQUEST", forged);
  const again = await code(passport.confirm());
  ok("the same upload cannot be filed twice", again === "CONFLICT", again);
  const colleagueAdds = await code(C.documentUpload({ leadId: lead.id, type: "PASSPORT", fileName: "p.jpg", mimeType: "image/jpeg", sizeBytes: 100 }));
  const viewerAdds = await code(V.documentUpload({ leadId: lead.id, type: "PASSPORT", fileName: "p.jpg", mimeType: "image/jpeg", sizeBytes: 100 }));
  ok("a colleague cannot add to another agent's client's file, nor a viewer", colleagueAdds === "NOT_FOUND" && viewerAdds === "FORBIDDEN", `${colleagueAdds}, ${viewerAdds}`);

  console.log("\n=== the agent collects; the officer opens and checks ===");
  const agentList = await code(A.documents({ kycId: kyc.id }));
  const agentView = await code(A.documentView({ documentId: p1.id }));
  const agentVerify = await code(A.documentVerify({ documentId: p1.id }));
  ok("the agent can neither list, open nor verify documents", [agentList, agentView, agentVerify].every((c) => c === "FORBIDDEN"), `${agentList}, ${agentView}, ${agentVerify}`);
  const list = await O.documents({ kycId: kyc.id });
  ok("the officer sees both, unchecked", list.rows.length === 2 && list.rows.every((r) => !r.verifiedAt));
  const opened = await O.documentView({ documentId: p1.id });
  const bytes = Buffer.from(await (await fetch(opened.url)).arrayBuffer());
  ok("opening gives a two-minute link to the real bytes", opened.url.includes("X-Amz-Expires=120") && bytes.equals(JPEG));
  const viewed = await root.auditLog.count({ where: { orgId: org.id, action: "aml.document_viewed", actorId: officer.id } });
  ok("and the opening is in the audit log, by who opened it", viewed === 1, String(viewed));
  await O.documentVerify({ documentId: p1.id });
  const checked = await root.kycDocument.findUniqueOrThrow({ where: { id: p1.id } });
  ok("checking records when and by whom", !!checked.verifiedAt && checked.verifiedById === officer.id);
  const status = await A.fileStatus({ leadId: lead.id });
  ok("the agent's panel shows one still to check", status.exists && status.unverified === 1, String(status.exists && status.unverified));
  const rivalView = await code(R.documentView({ documentId: p1.id }));
  const rivalList = await R.documents({ kycId: kyc.id });
  ok("another brokerage cannot open or list them", rivalView === "NOT_FOUND" && rivalList.rows.length === 0, `${rivalView}, ${rivalList.rows.length}`);
  console.log("\n=== a screening that never ran is not a clear one ===");
  // Opening the file screened it, and with no provider that is an ERROR.
  const detail = await O.screeningDetail({ kycId: kyc.id });
  const errored = detail.screenings.find((s) => s.result === "ERROR");
  ok("the officer is told nothing was checked, never 'No matches'",
     !!errored && !/no match/i.test(errored.guidance) && /nothing has been checked/i.test(errored.guidance),
     errored?.guidance);

  const audited = await root.auditLog.findMany({ where: { orgId: org.id, action: { startsWith: "aml.document_" } }, select: { action: true, after: true } });
  ok("the audit names types and ids, never file names", audited.length === 4 && audited.every((a) => !JSON.stringify(a.after).includes(".x")),
     audited.map((a) => a.action).join(", "));

  await cleanup();
  s3.close();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => { await cleanup().catch(() => {}); s3.close(); fatal(e); });
