import { z } from "zod";

/**
 * Listing import.
 *
 * Every brokerage's export is different, and none of them are tidy. Prices
 * arrive as "2.5M", "AED 2,500,000" and "2500000.00" in the same file.
 * Column headers vary by whichever system they are escaping from.
 *
 * The rule that matters: **nothing is written until they have seen what we
 * found.** An import that silently creates 400 half-parsed listings is a
 * worse first day than an import that refuses.
 */

export type Mapping = Record<string, string>;

/** Common headers, so most files map themselves and nobody types anything. */
const GUESSES: Record<string, string[]> = {
  reference:      ["reference", "ref", "ref no", "property id", "listing id", "unit no"],
  title:          ["title", "name", "property name", "headline"],
  community:      ["community", "location", "area", "sub community", "district"],
  bedrooms:       ["bedrooms", "beds", "bed", "br", "no of bedrooms"],
  bathrooms:      ["bathrooms", "baths", "bath", "ba"],
  areaSqft:       ["size", "area", "sqft", "built up area", "size sqft", "bua"],
  price:          ["price", "amount", "asking price", "rent", "sale price"],
  purpose:        ["purpose", "offering type", "for", "type", "sale or rent"],
  permitNumber:   ["permit", "permit number", "trakheesi", "trakheesi permit", "dld permit"],
  reraBrokerCard: ["rera", "brn", "broker card", "agent brn"],
  description:    ["description", "details", "notes", "about"],
};

export function guessMapping(headers: string[]): Mapping {
  const map: Mapping = {};
  const norm = (h: string) => h.toLowerCase().replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();

  for (const [field, options] of Object.entries(GUESSES)) {
    const match = headers.find((h) => options.includes(norm(h)));
    if (match) map[field] = match;
  }
  return map;
}

/**
 * Money, as brokerages actually write it. Returns null rather than
 * guessing — a listing imported at 2.5 dirhams instead of 2.5 million is
 * worse than one that failed to import, because it goes live.
 */
export function parsePrice(raw: string | undefined): number | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase().replace(/aed|dhs?|,|\s/g, "");
  if (!s) return null;

  const m = s.match(/^(\d+(?:\.\d+)?)(k|m)?$/);
  if (!m) return null;

  const n = Number(m[1]);
  const scaled = m[2] === "m" ? n * 1_000_000 : m[2] === "k" ? n * 1_000 : n;

  // A UAE property under 50,000 or over 500 million is a parsing error,
  // not a bargain.
  return scaled >= 50_000 && scaled <= 500_000_000 ? scaled : null;
}

export function parsePurpose(raw: string | undefined): "SALE" | "RENT" | null {
  const s = raw?.trim().toLowerCase() ?? "";
  if (/sale|sell|buy|sa\b/.test(s)) return "SALE";
  if (/rent|let|lease|re\b/.test(s)) return "RENT";
  return null;
}

const row = z.object({
  reference: z.string().trim().min(1),
  title: z.string().trim().min(1),
  community: z.string().trim().optional(),
  bedrooms: z.coerce.number().int().min(0).max(20).optional(),
  bathrooms: z.coerce.number().int().min(0).max(20).optional(),
  areaSqft: z.coerce.number().int().min(50).max(200_000).optional(),
  permitNumber: z.string().trim().optional(),
  reraBrokerCard: z.string().trim().optional(),
});

export type Preview = {
  total: number;
  ready: number;
  problems: { line: number; reference: string; issues: string[] }[];
  duplicatesInFile: string[];
  sample: Record<string, unknown>[];
};

/** Dry run. Always shown before anything is written. */
export function preview(rows: Record<string, string>[], mapping: Mapping): Preview {
  const problems: Preview["problems"] = [];
  const seen = new Map<string, number>();
  const duplicates: string[] = [];
  const sample: Record<string, unknown>[] = [];
  let ready = 0;

  rows.forEach((r, i) => {
    const pick = (f: string) => (mapping[f] ? r[mapping[f]] : undefined);
    const issues: string[] = [];

    const parsed = row.safeParse({
      reference: pick("reference"),
      title: pick("title"),
      community: pick("community"),
      bedrooms: pick("bedrooms") || undefined,
      bathrooms: pick("bathrooms") || undefined,
      areaSqft: pick("areaSqft") || undefined,
      permitNumber: pick("permitNumber"),
      reraBrokerCard: pick("reraBrokerCard"),
    });

    if (!parsed.success) {
      for (const e of parsed.error.errors) issues.push(`${e.path.join(".")}: ${e.message}`);
    }

    const price = parsePrice(pick("price"));
    if (price === null) issues.push(`price: couldn't read "${pick("price") ?? ""}"`);

    const purpose = parsePurpose(pick("purpose"));
    if (!purpose) issues.push(`purpose: couldn't tell if this is for sale or rent`);

    if (!pick("permitNumber")) {
      // A warning rather than a failure — it imports, it just cannot be
      // published until somebody adds the permit.
      issues.push("permit: missing, so this can't go live until you add it");
    }

    const ref = pick("reference") ?? `line ${i + 2}`;
    const first = seen.get(ref);
    if (first !== undefined) duplicates.push(ref);
    else seen.set(ref, i);

    const blocking = issues.filter((x) => !x.startsWith("permit:"));
    if (blocking.length) problems.push({ line: i + 2, reference: ref, issues });
    else ready += 1;

    if (sample.length < 5 && !blocking.length) {
      sample.push({ reference: ref, title: pick("title"), price, purpose, community: pick("community") });
    }
  });

  return {
    total: rows.length,
    ready,
    problems: problems.slice(0, 50),
    duplicatesInFile: [...new Set(duplicates)],
    sample,
  };
}
