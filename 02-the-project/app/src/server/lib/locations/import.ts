import type { Prisma, PrismaClient } from "@prisma/client";
import { ensurePath, SEPARATOR } from "./index";

/**
 * Property Finder's location list, read into the tree.
 *
 * **This is the only way a Property Finder id enters the database.** An
 * id is a number in Property Finder's own tree; a guessed one files a
 * listing in somebody else's building, and the portal accepts it
 * without complaint. So nothing in the product types one in, the seed
 * writes none, and until this has been run with the list Property
 * Finder supplies, publishing to Property Finder is refused with a
 * reason that names this command.
 *
 * It takes the list as Property Finder hands it over, in either shape
 * we have seen described: one `path` column ("Dubai > Dubai Marina >
 * Marina Gate > Marina Gate 1"), or a column per level. The id column
 * may be called `pf_id`, `location_id` or `id`. Anything else is
 * reported, not guessed at.
 */
export type ImportRow = { line: number; pfLocationId: number; names: string[] };
export type ImportProblem = { line: number; problem: string };

const ID_COLUMNS = ["pf_id", "pf_location_id", "location_id", "locationid", "id"];
const LEVEL_COLUMNS = [
  ["city", "emirate"],
  ["community"],
  ["sub_community", "subcommunity", "sub-community"],
  ["building", "tower", "property"],
];

/** RFC 4180 enough for a spreadsheet export: quotes, doubled quotes, commas and newlines inside quotes. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const src = text.replace(/^﻿/, "");
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
    } else cell += c;
  }
  row.push(cell);
  if (row.some((x) => x.trim() !== "")) rows.push(row);
  return rows;
}

const norm = (k: string) => k.trim().toLowerCase().replace(/\s+/g, "_");

/** Records (from CSV or JSON) to rows, with a reason for every one refused. */
export function readRecords(records: Record<string, unknown>[], firstLine = 2) {
  const rows: ImportRow[] = [];
  const problems: ImportProblem[] = [];
  records.forEach((raw, i) => {
    const line = firstLine + i;
    const rec: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw)) rec[norm(k)] = v == null ? "" : String(v).trim();

    const idKey = ID_COLUMNS.find((k) => rec[k]);
    const id = idKey ? Number(rec[idKey]) : NaN;
    if (!Number.isInteger(id) || id <= 0) {
      problems.push({ line, problem: "No Property Finder id (a whole number in pf_id, location_id or id)." });
      return;
    }

    let names: string[];
    if (rec.path) {
      names = rec.path.split(/\s*>\s*/);
    } else {
      names = [];
      for (const aliases of LEVEL_COLUMNS) {
        const v = aliases.map((a) => rec[a]).find((x) => x);
        if (!v) break;
        names.push(v);
      }
    }
    names = names.map((n) => n.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!names.length) {
      problems.push({ line, problem: "No place named (a path, or city/community/sub_community/building columns)." });
      return;
    }
    if (names.length > LEVEL_COLUMNS.length) {
      problems.push({ line, problem: `More levels than the tree has (${names.length}).` });
      return;
    }
    rows.push({ line, pfLocationId: id, names });
  });
  return { rows, problems };
}

/** A file's text, by its extension, to rows. */
export function readFile(name: string, text: string) {
  if (/\.json$/i.test(name)) {
    const data = JSON.parse(text) as unknown;
    const list = Array.isArray(data) ? data : (data as { data?: unknown[]; locations?: unknown[] }).data
      ?? (data as { locations?: unknown[] }).locations;
    if (!Array.isArray(list)) throw new Error("Expected a JSON array of locations, or { data: [...] }.");
    return readRecords(list as Record<string, unknown>[], 1);
  }
  const [header, ...body] = parseCsv(text);
  if (!header) return { rows: [], problems: [{ line: 1, problem: "The file is empty." }] };
  const keys = header.map(norm);
  return readRecords(body.map((cells) => Object.fromEntries(keys.map((k, i) => [k, cells[i] ?? ""]))));
}

type Writer = PrismaClient | Prisma.TransactionClient;

export type ImportResult = {
  rows: number;
  created: number;
  idsSet: number;
  unchanged: number;
  refused: ImportProblem[];
  /** Places listings are filed under that still have no Property Finder id. */
  placesWithoutId: { path: string; listings: number }[];
};

/**
 * Apply the rows. Idempotent: the same list twice changes nothing the
 * second time.
 *
 * Two conflicts are refused rather than resolved, because either answer
 * would be a guess: one id on two different places in the file, and an
 * id already held by a different place in the database (Property Finder
 * renamed or moved it — somebody should look before listings follow it).
 */
export async function applyImport(db: Writer, rows: ImportRow[]): Promise<ImportResult> {
  const out: ImportResult = { rows: rows.length, created: 0, idsSet: 0, unchanged: 0, refused: [], placesWithoutId: [] };

  const seen = new Map<number, string>();
  for (const r of rows) {
    const path = r.names.join(SEPARATOR);
    const before = seen.get(r.pfLocationId);
    if (before && before !== path) {
      out.refused.push({ line: r.line, problem: `Id ${r.pfLocationId} is also given to "${before}" in this file.` });
      continue;
    }
    seen.set(r.pfLocationId, path);

    const holder = await db.location.findUnique({ where: { pfLocationId: r.pfLocationId }, select: { path: true } });
    if (holder && holder.path !== path) {
      out.refused.push({ line: r.line, problem: `Id ${r.pfLocationId} already belongs to "${holder.path}". Look before moving it.` });
      continue;
    }
    if (holder) { out.unchanged++; continue; }

    const existing = await db.location.findFirst({ where: { path }, select: { id: true, pfLocationId: true } });
    if (existing?.pfLocationId != null && existing.pfLocationId !== r.pfLocationId) {
      out.refused.push({ line: r.line, problem: `"${path}" already has id ${existing.pfLocationId}, not ${r.pfLocationId}.` });
      continue;
    }
    const nodesBefore = await db.location.count();
    await ensurePath(db, r.names, r.pfLocationId);
    out.created += (await db.location.count()) - nodesBefore;
    out.idsSet++;
  }

  const unplaced = await db.location.findMany({
    where: { pfLocationId: null, listings: { some: { deletedAt: null } } },
    select: { path: true, _count: { select: { listings: { where: { deletedAt: null } } } } },
    orderBy: { path: "asc" },
  });
  out.placesWithoutId = unplaced.map((u) => ({ path: u.path, listings: u._count.listings }));
  return out;
}
