/**
 * Every new listing has an exact place, and Property Finder gets its id.
 *
 * Drives the real procedures: the search an agent types into, create
 * and edit refusing anything short of an exact place, the publish check
 * and the publish queue refusing Property Finder until its id for the
 * place is on file, the import that puts it there, and the feed carrying
 * it. Also that the application role cannot write the tree, which is
 * shared by every brokerage.
 *
 *     npm run check:locations
 */
import { crossTenant, forOrg } from "../src/server/db/client";
import { listingsRouter } from "../src/server/api/routers/listings";
import { locationsRouter } from "../src/server/api/routers/locations";
import { ensurePath } from "../src/server/lib/locations";
import { readFile, applyImport } from "../src/server/lib/locations/import";
import { feedFor, toXml } from "../src/server/lib/portals/feed";
import { drainPublishQueue } from "../src/server/lib/portals/queue";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "locations-check-";
const RUN = Date.now().toString(36);
const CITY = `Locations Check ${RUN}`;
// Test ids at the very top of the Int range, in a city that exists only
// for this run and is removed after it. No real place is given one.
const ID1 = 2_147_000_001;
const ID2 = 2_147_000_002;
let bad = 0;
const ok = (l: string, p: boolean, d = "") => { console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`); if (!p) bad++; };
const refused = async (fn: () => Promise<unknown>) => { try { await fn(); return null; } catch (e) { return e as { code?: string; message: string }; } };

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    const where = { orgId: { in: ids } };
    await root.listingPublication.deleteMany({ where });
    await root.auditLog.deleteMany({ where }).catch(() => {});
    await root.listing.deleteMany({ where });
    await root.channel.deleteMany({ where });
    await root.membership.deleteMany({ where });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: SLUG } } }).catch(() => {});
  await root.location.deleteMany({ where: { parentId: null, name: { startsWith: "Rogue " } } });
  // The tree is shared, so only this check's own city goes, deepest first.
  for (const level of ["BUILDING", "SUB_COMMUNITY", "COMMUNITY", "CITY"] as const) {
    await root.location.deleteMany({ where: { level, path: { startsWith: "Locations Check " } } });
  }
}

async function main() {
  console.log("\nThe location tree\n");
  await cleanup();
  const org = await root.organisation.create({ data: { name: "Locations Check", slug: `${SLUG}a` } });
  const u = await root.user.create({ data: { email: `${SLUG}m-${RUN}@example.com`, name: "Maya Chen" } });
  await root.membership.create({ data: { orgId: org.id, userId: u.id, role: "MANAGER" } });
  const ctx = { session: { user: { id: u.id } }, membership: { orgId: org.id, orgName: "x", role: "MANAGER" }, ip: "127.0.0.1", userAgent: "check" } as never;
  const L = listingsRouter.createCaller(ctx);
  const S = locationsRouter.createCaller(ctx);

  const tower = (await ensurePath(root, [CITY, "Harbour View", "Harbour Towers", "Tower A"]))!.id;
  const towerB = (await ensurePath(root, [CITY, "Harbour View", "Harbour Towers", "Tower B"]))!.id;
  const villas = (await ensurePath(root, [CITY, "Palm Grove", "Grove Villas"]))!.id;
  const area = (await ensurePath(root, [CITY, "Harbour View"]))!.id;

  console.log("=== finding a place ===");
  const hits = (await S.search({ q: `${RUN} tower a` })).results;
  ok("a few words find the building", hits[0]?.id === tower, hits.map((h) => h.path).join(" | "));
  const both = (await S.search({ q: `${RUN} harbour` })).results;
  ok("exact places come before the areas above them", both.length >= 3 && both[0]!.exact && !both[both.length - 1]!.exact,
    both.map((h) => `${h.exact ? "•" : "○"} ${h.path}`).join(" | "));

  console.log("\n=== a new listing needs an exact place ===");
  const base = { title: "2-bed, Tower A", bedrooms: 2, priceAed: 2_000_000 };
  const none = await refused(() => L.create({ ...base, reference: `LC-0-${RUN}` } as never));
  ok("no place: refused", none?.code === "BAD_REQUEST", none?.message.slice(0, 80));
  const onArea = await refused(() => L.create({ ...base, reference: `LC-1-${RUN}`, locationId: area }));
  ok("an area with buildings under it: refused, and says so", onArea?.code === "BAD_REQUEST" && /is an area/.test(onArea.message), onArea?.message);
  const unknown = await refused(() => L.create({ ...base, reference: `LC-2-${RUN}`, locationId: "no-such-node" }));
  ok("a place that does not exist: refused", unknown?.code === "BAD_REQUEST", unknown?.message);
  const made = await L.create({ ...base, reference: `LC-3-${RUN}`, locationId: tower });
  const row = await root.listing.findUnique({ where: { id: made.id } });
  ok("a building: accepted, and community and building follow from it",
    row?.locationId === tower && row.community === "Harbour View" && row.building === "Tower A", `${row?.community} / ${row?.building}`);

  console.log("\n=== moving it ===");
  await L.update({ id: made.id, locationId: villas });
  const moved = await root.listing.findUnique({ where: { id: made.id } });
  ok("an edit moves it, names and all — a villa community's name stands in for the building",
    moved?.locationId === villas && moved.community === "Palm Grove" && moved.building === "Grove Villas", `${moved?.community} / ${moved?.building}`);
  const toArea = await refused(() => L.update({ id: made.id, locationId: area }));
  ok("an edit cannot move it onto an area", toArea?.code === "BAD_REQUEST");
  await L.update({ id: made.id, locationId: tower });
  const listed = (await L.list({} as never)).rows.find((r) => r.id === made.id);
  ok("Listings shows where it is", listed?.location?.path === `${CITY} > Harbour View > Harbour Towers > Tower A`, listed?.location?.path);

  console.log("\n=== the tree belongs to nobody's brokerage ===");
  const write = await refused(() => forOrg(org.id).location.create({ data: { name: `Rogue ${RUN}`, level: "CITY", path: `Rogue ${RUN}` } }));
  ok("the application role cannot add a place", !!write && /permission denied/i.test(write.message), write?.message.split("\n").pop());
  const rename = await refused(() => forOrg(org.id).location.update({ where: { id: tower }, data: { pfLocationId: 1 } }));
  ok("…or give one an id", !!rename && /permission denied/i.test(rename.message));
  const read = await forOrg(org.id).location.findUnique({ where: { id: tower }, select: { id: true } });
  ok("…and can read it", read?.id === tower);

  console.log("\n=== Property Finder needs its own id for the place ===");
  // Everything else Property Finder asks for, so location is the only thing it can refuse.
  await root.listing.update({
    where: { id: made.id },
    data: {
      status: "AVAILABLE", permitNumber: "7654321", permitExpiresAt: new Date(Date.now() + 90 * 86_400_000), reraBrokerCard: "12345",
      descriptions: { en: "A bright two-bedroom with a harbour view.", ar: "شقة من غرفتي نوم.", photos: ["1.jpg", "2.jpg", "3.jpg", "4.jpg"] },
    },
  });
  const pf = await root.channel.create({ data: { orgId: org.id, type: "PROPERTY_FINDER", label: "Property Finder", identifier: `pf-${RUN}` } });
  const before = (await L.checkPublish({ listingId: made.id, channelIds: [pf.id] }))[0]!;
  ok("before the list is imported: refused, naming the command", !before.canPublish && before.problems.some((p) => p.field === "location" && /locations:import/.test(p.message)),
    before.problems.map((p) => p.message).join(" · "));
  const pub = await L.publish({ listingId: made.id, channelIds: [pf.id] });
  ok("publish refuses it too", pub[0]?.queued === false && pub[0].problems.some((p) => p.field === "location"), JSON.stringify(pub[0]?.problems.map((p) => p.field)));

  // Queued earlier, when nothing was checked: the drain re-runs the gate.
  // An upsert: if publish wrongly queued it above, the drain still has to answer.
  await root.listingPublication.upsert({
    where: { listingId_channelId: { listingId: made.id, channelId: pf.id } },
    create: { orgId: org.id, listingId: made.id, channelId: pf.id, state: "PENDING" },
    update: { state: "PENDING", rejection: null, lastTriedAt: null, attempts: 0 },
  });
  await drainPublishQueue();
  const q = await root.listingPublication.findFirst({ where: { listingId: made.id, channelId: pf.id } });
  ok("the publish queue refuses it as well", q?.state === "REJECTED" && /Property Finder's id/.test(q.rejection ?? ""), `${q?.state}: ${q?.rejection}`);

  const legacy = await root.listing.create({ data: { orgId: org.id, reference: `LC-L-${RUN}`, title: "Placed before the tree", community: "Harbour View", priceFils: 100_000_00n, status: "AVAILABLE" } });
  const lg = (await L.checkPublish({ listingId: legacy.id, channelIds: [pf.id] }))[0]!;
  ok("a listing nobody has placed: refused, asking for the place", lg.problems.some((p) => p.field === "location" && /exact location/.test(p.message)));

  console.log("\n=== importing Property Finder's list ===");
  const csv = [
    "pf_id,city,community,sub_community,building",
    `${ID1},"${CITY}",Harbour View,Harbour Towers,Tower A`,
    `${ID2},"${CITY}",Palm Grove,"Grove Villas",`,
    `abc,"${CITY}",Harbour View,,`,
  ].join("\r\n");
  const parsed = readFile("pf.csv", csv);
  ok("a column per level is read; a row without a numeric id is reported", parsed.rows.length === 2 && parsed.problems.length === 1 && parsed.problems[0]!.line === 4,
    JSON.stringify(parsed.problems));
  const json = readFile("pf.json", JSON.stringify([{ location_id: ID1, path: `${CITY} > Harbour View > Harbour Towers > Tower A` }]));
  ok("so is one path column, from JSON", json.rows[0]?.names.length === 4 && json.rows[0]?.pfLocationId === ID1);

  // A listing in Tower B, which Property Finder's list (below) does not name.
  await L.create({ ...base, reference: `LC-4-${RUN}`, locationId: towerB });
  const first = await applyImport(root, parsed.rows);
  ok("ids are set on the places already in the tree, nothing duplicated", first.idsSet === 2 && first.created === 0, JSON.stringify({ ...first, placesWithoutId: first.placesWithoutId.length }));
  ok("the tree now holds the ids", (await root.location.findUnique({ where: { id: tower } }))?.pfLocationId === ID1);
  const again = await applyImport(root, parsed.rows);
  ok("the same list twice changes nothing", again.idsSet === 0 && again.unchanged === 2 && again.created === 0);
  const clash = await applyImport(root, [{ line: 9, pfLocationId: ID1, names: [CITY, "Harbour View", "Harbour Towers", "Tower B"] }]);
  ok("an id already held by another place is refused, not moved", clash.refused.length === 1 && (await root.location.findUnique({ where: { id: tower } }))?.pfLocationId === ID1,
    clash.refused[0]?.problem);
  const twice = await applyImport(root, [
    { line: 1, pfLocationId: ID2 + 5, names: [CITY, "New Bay", "Bay 1"] },
    { line: 2, pfLocationId: ID2 + 5, names: [CITY, "New Bay", "Bay 2"] },
  ]);
  ok("one id given to two places in a file: the second is refused", twice.idsSet === 1 && twice.created === 2 && twice.refused[0]?.line === 2, JSON.stringify(twice.refused));
  const towerBPath = `${CITY} > Harbour View > Harbour Towers > Tower B`;
  ok("the import names the places listings are filed under that still lack an id",
    first.placesWithoutId.some((p) => p.path === towerBPath && p.listings === 1) && !first.placesWithoutId.some((p) => p.path.endsWith("> Tower A")));

  const after = (await L.checkPublish({ listingId: made.id, channelIds: [pf.id] }))[0]!;
  ok("with the id on file, Property Finder's location rule is met", after.canPublish && !after.problems.some((p) => p.field === "location"),
    after.problems.map((p) => p.message).join(" · "));

  console.log("\n=== the feed carries it ===");
  const xml = toXml(await feedFor(org.id), { brokerage: "Locations Check" });
  const block = xml.split("<listing>").find((b) => b.includes(`LC-3-${RUN}`)) ?? "";
  ok("the location block, with Property Finder's id", block.includes(`<location pfLocationId="${ID1}">`), block.match(/<location[^>]*>/)?.[0]);
  ok("and every level by name", block.includes(`<city>${CITY}</city>`) && block.includes("<community>Harbour View</community>")
    && block.includes("<subCommunity>Harbour Towers</subCommunity>") && block.includes("<building>Tower A</building>"));
}

main()
  .then(cleanup)
  .then(() => {
    console.log(bad ? `\n${bad} failed\n` : "\nAll passed\n");
    process.exit(bad ? 1 : 0);
  })
  // `fatal` exits at once, so the clean-up is awaited before it.
  .catch(async (e) => { await cleanup().catch(() => {}); fatal(e); });
