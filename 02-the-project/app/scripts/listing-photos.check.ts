/**
 * Listing photographs, end to end.
 *
 * Publishing anywhere needs a photo and nothing could add one, so every
 * real listing failed the rule for ever and the demo's feed handed
 * portals `01.jpg`. This drives the whole path through the real
 * procedures: a signed upload to storage, the bytes checked by their
 * contents, the order and the cover, the buyer's page and its photo
 * route, the portal feed, and who may do each.
 *
 * Storage is a small S3-shaped server on localhost holding objects in
 * memory — `check:storage` already proves the signing against an
 * independent implementation, so this one is about what the product does
 * with a store, not whether the store accepts the signature.
 *
 *     npm run check:listing-photos
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { crossTenant } from "../src/server/db/client";
import { listingsRouter } from "../src/server/api/routers/listings";
import { publicListing, publicPhoto, publicCover } from "../src/server/lib/listings/public";
import { feedFor, toXml } from "../src/server/lib/portals/feed";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "photos-check-";
const RUN = Date.now().toString(36);

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};
const code = (p: Promise<unknown>) => p.then(() => "allowed", (e: { code?: string }) => e.code ?? "error");

/* A very small S3: PUT, HEAD, GET (with a range), DELETE, by path. */
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

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(2000, 7)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(900, 3)]);

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  if (orgs.length) {
    await root.attachment.deleteMany({ where: { orgId: { in: orgs.map((o) => o.id) } } });
    await root.organisation.deleteMany({ where: { id: { in: orgs.map((o) => o.id) } } });
  }
  await root.user.deleteMany({ where: { email: { startsWith: "photos-check-" } } }).catch(() => {});
}

async function main() {
  console.log("\nListing photographs\n");
  await new Promise<void>((r) => s3.listen(0, "127.0.0.1", r));
  const port = (s3.address() as AddressInfo).port;
  Object.assign(process.env, {
    S3_BUCKET: "photos", S3_ENDPOINT: `http://127.0.0.1:${port}`, S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_FORCE_PATH_STYLE: "true",
  });
  await cleanup();

  const org = await root.organisation.create({ data: { name: "Gardenia Homes", slug: `${SLUG}a-${RUN}` } });
  const rival = await root.organisation.create({ data: { name: "Rival", slug: `${SLUG}r-${RUN}` } });
  const mk = (k: string) => root.user.create({ data: { email: `photos-check-${k}-${RUN}@example.com`, name: k } });
  const [manager, agent] = await Promise.all([mk("manager"), mk("agent")]);
  await root.membership.createMany({ data: [
    { orgId: org.id, userId: manager.id, role: "MANAGER" },
    { orgId: org.id, userId: agent.id, role: "AGENT" },
    { orgId: rival.id, userId: manager.id, role: "OWNER" },
  ] });
  const ctx = (orgId: string, userId: string, role: string) => ({
    session: { user: { id: userId } }, membership: { orgId, orgName: "x", role }, ip: "127.0.0.1", userAgent: "photos",
  }) as never;
  const M = listingsRouter.createCaller(ctx(org.id, manager.id, "MANAGER"));
  const A = listingsRouter.createCaller(ctx(org.id, agent.id, "AGENT"));
  const R = listingsRouter.createCaller(ctx(rival.id, manager.id, "OWNER"));

  const base = {
    orgId: org.id, title: "Two bed in Marina Gate", community: "Dubai Marina", bedrooms: 2,
    priceFils: 250_000_000n, purpose: "SALE" as const, status: "AVAILABLE" as const,
    permitNumber: "7654321", permitExpiresAt: new Date(Date.now() + 90 * 86_400_000), reraBrokerCard: "12345",
  };
  // A listing imported before uploads existed: placeholders only.
  const listing = await root.listing.create({ data: { ...base, reference: `PH-${RUN}`, descriptions: { en: "Sea views.", photos: ["01.jpg", "02.jpg"] } } });
  const other = await root.listing.create({ data: { ...base, reference: `PO-${RUN}`, descriptions: { en: "Another.", photos: [] } } });

  async function add(caller: typeof M, listingId: string, bytes: Buffer, mimeType: string, name: string, declared = bytes.length) {
    const t = await caller.photoUpload({ listingId, fileName: name, mimeType, sizeBytes: declared });
    const put = await fetch(t.uploadUrl, { method: "PUT", headers: { "content-type": mimeType }, body: new Uint8Array(bytes) });
    if (!put.ok) throw new Error(`stand-in refused the PUT: ${put.status}`);
    return { key: t.key, confirm: () => caller.photoConfirm({ listingId, key: t.key, fileName: name, mimeType, sizeBytes: declared }) };
  }

  console.log("=== before any photo ===");
  const before = await publicListing(org.slug, listing.reference);
  ok("placeholders still count, so the page is up, and are offered on request", !!before && before.photos.length === 0 && before.photosOnRequest,
     JSON.stringify(before && { photos: before.photos, onRequest: before.photosOnRequest }));

  console.log("\n=== a manager adds photos ===");
  const first = await add(M, listing.id, JPEG, "image/jpeg", "living.jpg");
  ok("the upload is under this listing's own prefix", first.key.startsWith(`org/${org.id}/listings/${listing.id}/photos/`), first.key);
  const p1 = await first.confirm();
  const second = await add(M, listing.id, PNG, "image/png", "view.png");
  const p2 = await second.confirm();
  let row = await root.listing.findUniqueOrThrow({ where: { id: listing.id } });
  const order = (row.descriptions as { photos: string[] }).photos;
  ok("both are kept, in order, and the placeholders are gone", JSON.stringify(order) === JSON.stringify([p1.id, p2.id]), JSON.stringify(order));
  const kinds = await root.attachment.findMany({ where: { listingId: listing.id }, select: { kind: true, uploadedById: true } });
  ok("each is a PHOTO attachment of this listing, by who added it", kinds.length === 2 && kinds.every((k) => k.kind === "PHOTO" && k.uploadedById === manager.id));
  const listed = await M.photos({ listingId: listing.id });
  ok("the agent's screen lists them with signed addresses", listed.rows.length === 2 && listed.rows.every((r) => r.url?.includes("X-Amz-Signature")) && listed.placeholders === 0);

  console.log("\n=== what is refused ===");
  const liar = await add(M, listing.id, PNG, "image/jpeg", "fake.jpg");
  const lie = await code(liar.confirm());
  ok("a PNG declared as a JPEG is refused and deleted from storage", lie === "BAD_REQUEST" && !objects.has(`/photos/${liar.key}`), lie);
  const short = await add(M, listing.id, JPEG, "image/jpeg", "short.jpg");
  const wrongSize = await code(M.photoConfirm({ listingId: listing.id, key: short.key, fileName: "short.jpg", mimeType: "image/jpeg", sizeBytes: JPEG.length + 5 }));
  ok("a size that does not match the bytes is refused", wrongSize === "BAD_REQUEST", wrongSize);
  const heic = await code(M.photoUpload({ listingId: listing.id, fileName: "x.heic", mimeType: "image/heic", sizeBytes: 100 }));
  const huge = await code(M.photoUpload({ listingId: listing.id, fileName: "x.jpg", mimeType: "image/jpeg", sizeBytes: 40 * 1024 * 1024 }));
  ok("a HEIC and a 40MB file are refused before any bytes move", heic === "BAD_REQUEST" && huge === "BAD_REQUEST", `${heic}, ${huge}`);
  const elsewhere = await add(M, other.id, JPEG, "image/jpeg", "other.jpg");
  const crossKey = await code(M.photoConfirm({ listingId: listing.id, key: elsewhere.key, fileName: "other.jpg", mimeType: "image/jpeg", sizeBytes: JPEG.length }));
  ok("another listing's upload cannot be attached here", crossKey === "BAD_REQUEST", crossKey);
  const again = await code(first.confirm());
  ok("the same upload cannot be kept twice", again === "CONFLICT", again);
  const agentAdd = await code(A.photoUpload({ listingId: listing.id, fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 100 }));
  const agentRemove = await code(A.photoRemove({ listingId: listing.id, photoId: p1.id }));
  ok("an agent, who cannot edit listings, cannot add or remove photos", agentAdd === "FORBIDDEN" && agentRemove === "FORBIDDEN", `${agentAdd}, ${agentRemove}`);
  const rivalSees = await code(R.photos({ listingId: listing.id }));
  const rivalAdds = await code(R.photoUpload({ listingId: listing.id, fileName: "a.jpg", mimeType: "image/jpeg", sizeBytes: 100 }));
  ok("another brokerage can neither see nor add to them", rivalSees === "NOT_FOUND" && rivalAdds === "NOT_FOUND", `${rivalSees}, ${rivalAdds}`);

  console.log("\n=== the cover, the page, the card and the feed ===");
  await M.photoCover({ listingId: listing.id, photoId: p2.id });
  row = await root.listing.findUniqueOrThrow({ where: { id: listing.id } });
  ok("making the second the cover puts it first", (row.descriptions as { photos: string[] }).photos[0] === p2.id);
  const page = await publicListing(org.slug, listing.reference);
  ok("the page lists both under its own path, cover first",
     page?.photos.length === 2 && page.photos[0] === `/p/${org.slug}/${listing.reference}/photos/${p2.id}` && !page.photosOnRequest,
     JSON.stringify(page?.photos));
  const signed = await publicPhoto(org.slug, listing.reference, p2.id);
  ok("the photo route answers with a short-lived signed address", !!signed && signed.includes("X-Amz-Expires=600"), signed?.slice(0, 60));
  const fetched = signed ? Buffer.from(await (await fetch(signed)).arrayBuffer()) : null;
  ok("which returns the photo's bytes", !!fetched && fetched.equals(PNG));
  const card = await publicCover(org.slug, listing.reference);
  ok("the preview card gets the cover's bytes", !!card?.cover && card.cover.mimeType === "image/png" && Buffer.from(card.cover.bytes).equals(PNG));
  const notOurs = await publicPhoto(org.slug, listing.reference, elsewhere.key);
  // A hand-edited order on the other property naming this one's photo:
  // it must show nothing rather than somebody else's kitchen.
  await root.listing.update({ where: { id: other.id }, data: { descriptions: { en: "Another.", photos: [p1.id] } } });
  const borrowed = await publicPhoto(org.slug, other.reference, p1.id);
  const otherPage = await publicListing(org.slug, other.reference);
  ok("an id that is not this listing's own photo gets nothing, even if its order names it",
     notOurs === null && borrowed === null && otherPage?.photos.length === 0,
     `${notOurs} ${borrowed} ${JSON.stringify(otherPage?.photos)}`);
  const feed = toXml(await feedFor(org.id, { origin: "https://crm.example" }), { brokerage: "Gardenia Homes" });
  ok("the feed gives portals absolute addresses they can download",
     feed.includes(`<photo>https://crm.example/p/${org.slug}/${listing.reference}/photos/${p2.id}</photo>`) && !feed.includes("01.jpg"));

  console.log("\n=== a withheld property takes its photos with it ===");
  await root.listing.update({ where: { id: listing.id }, data: { status: "SOLD" } });
  const gone = await publicPhoto(org.slug, listing.reference, p2.id);
  const goneCard = await publicCover(org.slug, listing.reference);
  ok("sold: the photo route and the card give nothing", gone === null && goneCard === null);
  await root.listing.update({ where: { id: listing.id }, data: { status: "AVAILABLE" } });

  console.log("\n=== removing ===");
  const key1 = (await root.attachment.findUniqueOrThrow({ where: { id: p1.id } })).storageRef;
  await M.photoRemove({ listingId: listing.id, photoId: p1.id });
  row = await root.listing.findUniqueOrThrow({ where: { id: listing.id } });
  ok("removed from the order, the attachments and storage",
     JSON.stringify((row.descriptions as { photos: string[] }).photos) === JSON.stringify([p2.id])
       && !(await root.attachment.findUnique({ where: { id: p1.id } })) && !objects.has(`/photos/${key1}`));
  const audited = await root.auditLog.count({ where: { orgId: org.id, action: { startsWith: "listing.photo_" } } });
  ok("every change is in the audit log", audited === 4, String(audited));

  console.log("\n=== two people at once ===");
  // The order is read, edited and written back. Two at once read the same
  // list, and without the row lock the second write drops the first's photo
  // — stored, billed, and on nobody's page.
  const batch = await Promise.all(["a", "b", "c"].map((n) => add(M, other.id, JPEG, "image/jpeg", `${n}.jpg`)));
  const kept = await Promise.all(batch.map((b) => b.confirm()));
  const orderOf = async () => ((await root.listing.findUniqueOrThrow({ where: { id: other.id } })).descriptions as { photos: string[] }).photos;
  const together = await orderOf();
  ok("three confirmed at the same moment are all in the order",
     together.length === 3 && kept.every((k) => together.includes(k.id)), JSON.stringify(together));
  const late = await add(M, other.id, PNG, "image/png", "d.png");
  const [, added] = await Promise.all([M.photoRemove({ listingId: other.id, photoId: kept[0]!.id }), late.confirm()]);
  const after = await orderOf();
  ok("a removal racing an upload loses neither change",
     after.length === 3 && !after.includes(kept[0]!.id) && after.includes(added.id), JSON.stringify(after));

  await cleanup();
  s3.close();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => { await cleanup().catch(() => {}); s3.close(); fatal(e); });
