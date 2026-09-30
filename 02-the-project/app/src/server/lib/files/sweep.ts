import { crossTenant } from "@/server/db/client";
import { deleteObject, listObjects, storageConfigured } from "./storage";

/**
 * Uploads nothing kept.
 *
 * Every upload is a signed PUT the browser makes before the server
 * records anything, so an agent who closes the tab, loses signal, or has
 * a file refused leaves an object with no row. For a brochure that is
 * storage rent. **For an identity document it is a copy of somebody's
 * passport that no file references** — invisible to the compliance
 * officer, to a subject access request and to erasure, which find
 * personal data through the rows that point at it. That is what made
 * this worth building rather than leaving as pennies.
 *
 * ## What it may touch, and what it must not
 *
 * Only keys the three upload flows create — brochures and attachments,
 * listing photos, and identity documents — and only when **no table in
 * the schema that holds a storage reference** names the key. A
 * compliance `Document` can point at an attachment's key; a migration can
 * point at an archive. Checking only the table a flow writes would delete
 * a broker card the law says to keep for five years because it was
 * uploaded through the inbox.
 *
 * Only objects older than a day: an upload ticket lives fifteen minutes,
 * so anything younger may be an upload somebody is finishing right now.
 *
 * Anything else in the bucket is left alone. A sweep that deletes what it
 * does not recognise is one bad prefix away from deleting everything.
 */

const OURS = [
  /^org\/[^/]+\/files\/[^/]+$/,
  /^org\/[^/]+\/listings\/[^/]+\/photos\/[^/]+$/,
  /^kyc\/[^/]+\/[^/]+\/[^/]+$/,
];
export const ORPHAN_MIN_AGE_HOURS = 24;

/** Every key the database still names, among the ones asked about. */
async function stillReferenced(keys: string[]): Promise<Set<string>> {
  const db = crossTenant("sweep");
  const [a, k, d, m, i, r1, r2] = await Promise.all([
    db.attachment.findMany({ where: { storageRef: { in: keys } }, select: { storageRef: true } }),
    db.kycDocument.findMany({ where: { storageRef: { in: keys } }, select: { storageRef: true } }),
    db.document.findMany({ where: { storageRef: { in: keys } }, select: { storageRef: true } }),
    db.migration.findMany({ where: { sourceArchiveRef: { in: keys } }, select: { sourceArchiveRef: true } }),
    db.migrationIssue.findMany({ where: { sourceRef: { in: keys } }, select: { sourceRef: true } }),
    db.agentRequest.findMany({ where: { audioRef: { in: keys } }, select: { audioRef: true } }),
    db.agentRequest.findMany({ where: { outputRef: { in: keys } }, select: { outputRef: true } }),
  ]);
  return new Set([
    ...a.map((x) => x.storageRef), ...k.map((x) => x.storageRef),
    ...d.map((x) => x.storageRef), ...m.map((x) => x.sourceArchiveRef),
    ...i.map((x) => x.sourceRef), ...r1.map((x) => x.audioRef), ...r2.map((x) => x.outputRef),
  ].filter((x): x is string => !!x));
}

export async function sweepOrphans(opts: { now?: Date } = {}) {
  if (!storageConfigured()) return { skipped: "storage not configured", examined: 0, removed: 0, kept: 0 };
  const cutoff = (opts.now ?? new Date()).getTime() - ORPHAN_MIN_AGE_HOURS * 3_600_000;
  let examined = 0, removed = 0, kept = 0;

  for (const prefix of ["org/", "kyc/"]) {
    let token: string | undefined;
    do {
      const page = await listObjects(prefix, token);
      token = page.next ?? undefined;
      const candidates = page.objects
        .filter((o) => OURS.some((re) => re.test(o.key)) && o.lastModified.getTime() < cutoff)
        .map((o) => o.key);
      examined += candidates.length;
      if (!candidates.length) continue;
      const referenced = await stillReferenced(candidates);
      for (const key of candidates) {
        if (referenced.has(key)) { kept++; continue; }
        await deleteObject(key);
        removed++;
      }
    } while (token);
  }
  return { examined, removed, kept };
}
