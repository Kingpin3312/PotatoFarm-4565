/**
 * A book in, and a book out.
 *
 * The audit's A4: nothing could turn a spreadsheet row into a lead, and
 * no manager could take the list out. This drives the real procedures
 * with a file shaped like other CRMs' exports — quoted commas, local and
 * spaced numbers, a repeat, a bad row, an agent who left — and asserts
 * the preview writes nothing, the import writes exactly the new ones,
 * running it twice does no harm, and the export reads back.
 *
 *     npm run check:import-export
 */
import { crossTenant } from "../src/server/db/client";
import { importsRouter } from "../src/server/api/routers/imports";
import { leadsRouter } from "../src/server/api/routers/leads";
import { csvRecords, parseCsv } from "../src/lib/csv";
import { guessMapping } from "../src/lib/import-fields";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "import-export-check-";
const RUN = Date.now().toString(36);
const EMAIL = (k: string) => `import-export-check-${k}-${RUN}@example.com`;
let bad = 0;
const ok = (l: string, p: boolean, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };
const refused = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as { code?: string }; } };

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const where = { orgId: { in: ids } };
    await root.leadOwnership.deleteMany({ where });
    await root.requirement.deleteMany({ where });
    await root.auditLog.deleteMany({ where }).catch(() => {});
    await root.lead.deleteMany({ where });
    await root.pipelineStage.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "import-export-check-" } } }).catch(() => {});
}

const n = String(Date.now()).slice(-6);
const FILE = [
  "Full Name,Mobile,E-mail,Lead Source,Assigned To,Budget,Preferred Area,Beds,Comments",
  `"Al Mansoori, Sarah",050 1${n},SARAH@example.com,Bayut,LENA_EMAIL,3m,"marina, the palm",2,"likes sea view"`,
  `Omar Haddad,+971 52 2${n},omar@example.com,Property Finder,,"AED 1,800,000",JVC,1,`,
  `Aisha Khan,009715 3 3${n},not-an-email,Referral,gone@elsewhere.com,lots,,many,`,
  `Sarah again,+97150 1${n},,,,,,,duplicate of line 2`,
  `No Number,,x@example.com,,,,,,`,
  `Bad Number,12345,,,,,,,`,
  `=HYPERLINK("http://x"),0544${n},,,,,,,formula name`,
  `Existing Person,0555${n},,,,,,,`,
].join("\n");

async function main() {
  console.log("\nImport and export\n");
  await cleanup();
  const org = await root.organisation.create({ data: { name: "Import Check", slug: `${SLUG}a` } });
  const rival = await root.organisation.create({ data: { name: "Rival", slug: `${SLUG}b` } });
  const manager = await root.user.create({ data: { email: EMAIL("manager"), name: "Maya Chen" } });
  const lena = await root.user.create({ data: { email: EMAIL("lena"), name: "Lena Popescu" } });
  await root.membership.createMany({ data: [
    { orgId: org.id, userId: manager.id, role: "MANAGER" },
    { orgId: org.id, userId: lena.id, role: "AGENT" },
  ] });
  await root.pipelineStage.create({ data: { orgId: org.id, name: "New", position: 1, maps: "NEW" } });
  // On file already, under a number written differently in the file.
  await root.lead.create({ data: { orgId: org.id, phone: `+971555${n}`, name: "Existing Person", tags: ["vip"] } });
  // The rival holds Omar's number; it is not ours, so it is not a duplicate.
  await root.lead.create({ data: { orgId: rival.id, phone: `+971522${n}`, name: "Their Omar" } });

  const ctx = (userId: string, role: string) => ({
    session: { user: { id: userId } }, membership: { orgId: org.id, orgName: "x", role }, ip: "127.0.0.1", userAgent: "check",
  }) as never;
  const I = importsRouter.createCaller(ctx(manager.id, "MANAGER"));
  const L = leadsRouter.createCaller(ctx(manager.id, "MANAGER"));

  const { headers, rows } = csvRecords(FILE.replace("LENA_EMAIL", EMAIL("lena")));
  const mapping = guessMapping(headers);
  ok("the columns are recognised from their names", mapping.phone === "Mobile" && mapping.name === "Full Name" && mapping.agent === "Assigned To" && mapping.areas === "Preferred Area",
     JSON.stringify(mapping));
  ok("a quoted comma stays in its cell", rows[0]!["Full Name"] === "Al Mansoori, Sarah");

  console.log("\n=== the preview writes nothing ===");
  const before = await root.lead.count({ where: { orgId: org.id } });
  const p = await I.previewLeads({ rows, mapping });
  ok("four new, one already here, one repeat, two that can't come in",
     p.counts.new === 4 && p.counts.exists === 1 && p.counts.repeat === 1 && p.counts.error === 2, JSON.stringify(p.counts));
  ok("each problem names its line", p.problems.some((x) => x.line === 5 && /line 2/.test(x.reason ?? "")) && p.problems.some((x) => x.line === 6) && p.problems.some((x) => x.line === 7),
     p.problems.map((x) => `${x.line}:${x.status}`).join(" "));
  ok("and the bad fields on a good row are warnings, not rejections",
     (p.problems.find((x) => x.line === 4)?.warnings.length ?? 0) >= 3, JSON.stringify(p.problems.find((x) => x.line === 4)?.warnings));
  ok("nothing was written", (await root.lead.count({ where: { orgId: org.id } })) === before);

  console.log("\n=== the import ===");
  const r = await I.commitLeads({ rows, mapping, onExisting: "skip", agentId: null, label: "old crm" });
  ok("four leads added", r.created === 4, String(r.created));
  const sarah = await root.lead.findFirst({ where: { orgId: org.id, name: "Al Mansoori, Sarah" }, include: { requirements: true } });
  ok("stored in one phone format", sarah?.phone === `+9715${"01" + n}`.replace("+971501", "+971501"), sarah?.phone);
  ok("email lower-cased, source read, agent found by email", sarah?.email === "sarah@example.com" && sarah?.source === "BAYUT" && sarah?.assignedToId === lena.id,
     `${sarah?.email} ${sarah?.source} ${sarah?.assignedToId === lena.id}`);
  ok("what they want became a requirement", sarah?.requirements[0]?.communities.join() === "Dubai Marina,Palm Jumeirah" && sarah?.requirements[0]?.bedroomsMin === 2,
     JSON.stringify(sarah?.requirements[0]?.communities));
  ok("everything imported carries the batch tag", (await root.lead.count({ where: { orgId: org.id, tags: { has: "old crm" } } })) === 4);
  ok("the owner is on the record", (await root.leadOwnership.count({ where: { orgId: org.id, leadId: sarah!.id, userId: lena.id } })) === 1);
  ok("on the board", !!sarah?.stageId);
  const aisha = await root.lead.findFirst({ where: { orgId: org.id, name: "Aisha Khan" } });
  ok("an agent who left means nobody, not a guess", aisha !== null && aisha.assignedToId === null && aisha.email === null);
  const existing = await root.lead.findFirst({ where: { orgId: org.id, name: "Existing Person" } });
  ok("the lead already on file is untouched", existing?.tags.join() === "vip");
  ok("one audit entry for the import", (await root.auditLog.count({ where: { orgId: org.id, action: "lead.import" } })) === 1);

  const again = await I.commitLeads({ rows, mapping, onExisting: "fill", agentId: null, label: "old crm" });
  ok("running it again adds nobody", again.created === 0, String(again.created));
  const filled = await root.lead.findFirst({ where: { orgId: org.id, name: "Existing Person" } });
  ok("and 'fill' adds the tag without overwriting", filled?.tags.includes("vip") === true && filled?.tags.includes("old crm") === true, filled?.tags.join());

  console.log("\n=== the export ===");
  const out = await L.exportCsv({ filter: "all", view: "active", tag: "old crm", sort: "name" });
  const table = parseCsv(out.csv);
  // The four imported, and the one already here that 'fill' tagged.
  ok("the filtered list comes out", out.count === 5 && table.length === 6, `${out.count} / ${table.length - 1}`);
  ok("and reads back cell for cell", table.some((r) => r[0] === "Al Mansoori, Sarah" && r[1] === sarah!.phone));
  ok("a name that is a formula is neutralised", table.some((r) => r[0]!.startsWith("'=HYPERLINK")), table.map((r) => r[0]).join(" | "));
  ok("phone numbers are not mangled", table.slice(1).every((r) => /^\+\d+$/.test(r[1]!)));
  ok("the export is logged", (await root.auditLog.count({ where: { orgId: org.id, action: "lead.export" } })) === 1);

  console.log("\n=== an agent can do neither ===");
  const A = ctx(lena.id, "AGENT");
  ok("import refused", (await refused(() => importsRouter.createCaller(A).previewLeads({ rows, mapping })))?.code === "FORBIDDEN");
  ok("export refused", (await refused(() => leadsRouter.createCaller(A).exportCsv({ filter: "all", view: "active", sort: "newest" })))?.code === "FORBIDDEN");

  await cleanup();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(fatal);
