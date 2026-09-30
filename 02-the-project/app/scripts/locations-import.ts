/**
 * Read Property Finder's location list into the location tree.
 *
 *     npm run locations:import -- path/to/pf-locations.csv
 *     npm run locations:import -- path/to/pf-locations.json --dry-run
 *
 * The list comes from Property Finder with the partner agreement. It is
 * the only source of a Property Finder location id — see
 * `src/server/lib/locations/import.ts` for why none is ever typed in or
 * guessed — and until it has been run, publishing to Property Finder is
 * refused with a reason naming this command.
 *
 * Runs as the owning role (`DATABASE_URL_UNSCOPED`): the tree is shared
 * reference data and the application role can only read it. Safe to
 * run again with a newer list; what is already right is left alone.
 */
import { readFileSync } from "node:fs";
import { basename } from "node:path";
import { PrismaClient } from "@prisma/client";
import { readFile, applyImport } from "../src/server/lib/locations/import";
import { fatal } from "./fatal";

async function main() {
  const args = process.argv.slice(2);
  const dry = args.includes("--dry-run");
  const file = args.find((a) => !a.startsWith("--"));
  if (!file) {
    console.error("Usage: npm run locations:import -- <pf-locations.csv|json> [--dry-run]");
    process.exit(2);
  }
  const { rows, problems } = readFile(basename(file), readFileSync(file, "utf8"));
  console.log(`\nProperty Finder locations: ${rows.length} row(s) read from ${basename(file)}`);
  for (const p of problems.slice(0, 20)) console.log(`  line ${p.line}: ${p.problem}`);
  if (problems.length > 20) console.log(`  … and ${problems.length - 20} more`);

  const url = process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL_DIRECT ?? process.env.DATABASE_URL;
  const db = new PrismaClient({ datasources: { db: { url } } });
  try {
    // One transaction, so a list that fails half-way leaves the tree as
    // it was rather than half-numbered. A dry run is the same work,
    // rolled back.
    const DRY = Symbol("dry");
    let result: Awaited<ReturnType<typeof applyImport>> | undefined;
    await db.$transaction(async (tx) => {
      result = await applyImport(tx, rows);
      if (dry) throw DRY;
    }, { timeout: 10 * 60_000 }).catch((e) => { if (e !== DRY) throw e; });
    const r = result!;
    console.log(`${dry ? "Would set" : "Set"} ${r.idsSet} id(s), ${r.created} new place(s); ${r.unchanged} already right.`);
    for (const p of r.refused) console.log(`  refused, line ${p.line}: ${p.problem}`);
    if (r.placesWithoutId.length) {
      console.log(`\n${r.placesWithoutId.length} place(s) with listings still have no Property Finder id —`);
      console.log("usually a name spelt differently from Property Finder's. Those listings cannot go to Property Finder:");
      for (const u of r.placesWithoutId.slice(0, 40)) console.log(`  ${u.path}  (${u.listings})`);
    } else {
      console.log("Every place a listing is filed under has a Property Finder id.");
    }
    if (dry) console.log("\nDry run: nothing was written.");
    process.exitCode = problems.length || r.refused.length ? 1 : 0;
  } finally {
    await db.$disconnect();
  }
}

main().catch(fatal);
