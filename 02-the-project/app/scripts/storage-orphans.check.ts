/**
 * The orphan sweep deletes only what nothing keeps.
 *
 * Its failure in one direction is storage rent and stray passport
 * photos; in the other, a broker card the law says to keep for five
 * years, deleted because the table the sweep looked at did not name it.
 * So every kind of reference is set up, and every kind of object the
 * sweep must leave alone, and the stand-in bucket pages three at a time
 * so the continuation token is exercised rather than assumed.
 *
 *     npm run check:storage-orphans
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { crossTenant } from "../src/server/db/client";
import { sweepOrphans } from "../src/server/lib/files/sweep";
import { fatal } from "./fatal";

const root = crossTenant("sweep");
const SLUG = "orphans-check-";
const RUN = Date.now().toString(36);
const BUCKET = "orphans";

let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};

/* A small S3: ListObjectsV2 three to a page, and DELETE. */
const objects = new Map<string, Date>();
const pages: Record<string, number> = {};
const s3 = createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  if (!req.headers.authorization) { res.writeHead(403).end("MissingAuthorization"); return; }
  if (req.method === "GET" && url.pathname === `/${BUCKET}` && url.searchParams.get("list-type") === "2") {
    const prefix = url.searchParams.get("prefix") ?? "";
    pages[prefix] = (pages[prefix] ?? 0) + 1;
    // Continued from the last key returned, as S3 does, so deleting
    // during the listing cannot make the next page skip anything.
    const after = url.searchParams.get("continuation-token") ?? "";
    const keys = [...objects.keys()].filter((k) => k.startsWith(prefix) && k > after).sort();
    const page = keys.slice(0, 3);
    const more = keys.length > 3;
    res.writeHead(200, { "content-type": "application/xml" }).end(
      `<?xml version="1.0"?><ListBucketResult><IsTruncated>${more}</IsTruncated>` +
      page.map((k) => `<Contents><Key>${k}</Key><LastModified>${objects.get(k)!.toISOString()}</LastModified><Size>10</Size></Contents>`).join("") +
      (more ? `<NextContinuationToken>${page[page.length - 1]}</NextContinuationToken>` : "") + `</ListBucketResult>`,
    );
    return;
  }
  if (req.method === "DELETE") {
    objects.delete(decodeURIComponent(url.pathname).replace(`/${BUCKET}/`, ""));
    res.writeHead(204).end();
    return;
  }
  res.writeHead(400).end();
});

async function cleanup() {
  const orgs = await root.organisation.findMany({ where: { slug: { startsWith: SLUG } }, select: { id: true } });
  const ids = orgs.map((o) => o.id);
  if (ids.length) {
    await root.kycDocument.deleteMany({ where: { orgId: { in: ids } } });
    await root.kycRecord.deleteMany({ where: { orgId: { in: ids } } });
    await root.document.deleteMany({ where: { orgId: { in: ids } } });
    await root.attachment.deleteMany({ where: { orgId: { in: ids } } });
    await root.organisation.deleteMany({ where: { id: { in: ids } } });
  }
}

async function main() {
  console.log("\nThe storage orphan sweep\n");
  await new Promise<void>((r) => s3.listen(0, "127.0.0.1", r));
  const port = (s3.address() as AddressInfo).port;
  await cleanup();

  const skipped = await sweepOrphans();
  ok("with no storage configured it says so and touches nothing", "skipped" in skipped && skipped.removed === 0, JSON.stringify(skipped));

  Object.assign(process.env, {
    S3_BUCKET: BUCKET, S3_ENDPOINT: `http://127.0.0.1:${port}`, S3_REGION: "auto",
    S3_ACCESS_KEY_ID: "k", S3_SECRET_ACCESS_KEY: "s", S3_FORCE_PATH_STYLE: "true",
  });

  const org = await root.organisation.create({ data: { name: "Orphans Realty", slug: `${SLUG}${RUN}` } });
  const lead = await root.lead.create({ data: { orgId: org.id, phone: `+97150${RUN.slice(-7).replace(/\D/g, "8").padStart(7, "2")}`, name: "Sam Carter" } });
  const kyc = await root.kycRecord.create({ data: { orgId: org.id, leadId: lead.id, legalName: "Sam Carter" } });

  const old = new Date(Date.now() - 3 * 86_400_000);
  const k = {
    attachment: `org/${org.id}/files/kept-attachment`,
    document: `org/${org.id}/files/kept-by-broker-card`,
    abandoned: `org/${org.id}/files/abandoned`,
    photo: `org/${org.id}/listings/l1/photos/abandoned`,
    passport: `kyc/${org.id}/${kyc.id}/abandoned-passport`,
    kycKept: `kyc/${org.id}/${kyc.id}/kept-passport`,
    fresh: `org/${org.id}/files/uploading-now`,
    foreign: `backups/${org.id}/dump.sql`,
    odd: `org/${org.id}/files/nested/not-ours`,
  };
  for (const key of Object.values(k)) objects.set(key, old);
  objects.set(k.fresh, new Date(Date.now() - 10 * 60_000));

  await root.attachment.create({ data: { orgId: org.id, kind: "BROCHURE", fileName: "b.pdf", storageRef: k.attachment, mimeType: "application/pdf", sizeBytes: 10 } });
  await root.kycDocument.create({ data: { orgId: org.id, kycId: kyc.id, type: "PASSPORT", storageRef: k.kycKept, fileName: "p.jpg" } });
  // A compliance document pointing at a key under files/ — the case a
  // sweep that checked only attachments would delete.
  await root.document.create({ data: { orgId: org.id, ownerType: "ORGANISATION", ownerId: org.id, type: "RERA_BROKER_CARD", fileName: "card.jpg", storageRef: k.document } });

  const result = await sweepOrphans();
  const left = new Set(objects.keys());
  ok("the abandoned brochure, listing photo and passport are removed",
     !left.has(k.abandoned) && !left.has(k.photo) && !left.has(k.passport), JSON.stringify(result));
  ok("an attachment's file is kept", left.has(k.attachment));
  ok("a file only a compliance document names is kept", left.has(k.document));
  ok("a passport in a due diligence file is kept", left.has(k.kycKept));
  ok("an upload from ten minutes ago is kept", left.has(k.fresh));
  ok("nothing outside the three upload shapes is touched", left.has(k.foreign) && left.has(k.odd));
  ok("a listing longer than a page is followed to its end", (pages["org/"] ?? 0) >= 2, JSON.stringify(pages));
  ok("and it reports what it did", result.removed === 3 && "kept" in result && result.kept === 3, JSON.stringify(result));

  await cleanup();
  s3.close();
  console.log(bad ? `\n${bad} FAILURE(S)\n` : "\nAll checks passed.\n");
  process.exit(bad ? 1 : 0);
}

main().catch(async (e) => { await cleanup().catch(() => {}); s3.close(); fatal(e); });
