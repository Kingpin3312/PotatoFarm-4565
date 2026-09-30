import { normalisePhone } from "@/lib/phone";
import { canonicalCommunities } from "@/server/lib/requirements/save";

/**
 * Reading somebody else's spreadsheet into leads.
 *
 * Pure: rows and a mapping in, one verdict per row out. The router looks
 * up what already exists and writes; everything that decides — which
 * column is the phone, whether two rows are one person, why a row cannot
 * come in — is here, where it can be tested without a database.
 *
 * The rule that shapes it: **nothing is silently fixed or silently
 * dropped.** Every row ends as new, already on file, a repeat of an
 * earlier row, or an error with its line number and a reason a person
 * can act on — the same promise the migration screen makes.
 */

export { FIELDS, FIELD_LABEL, guessMapping } from "@/lib/import-fields";
export type { Field, Mapping } from "@/lib/import-fields";
import type { Mapping, Field } from "@/lib/import-fields";

export type Source = "PROPERTY_FINDER" | "BAYUT" | "DUBIZZLE" | "WEBSITE" | "META_LEAD_ADS" | "WHATSAPP_AD" | "REFERRAL" | "WALK_IN" | "UNKNOWN";

export function readSource(v: string | null | undefined): Source {
  const s = (v ?? "").toLowerCase();
  if (/property ?finder|^pf$/.test(s)) return "PROPERTY_FINDER";
  if (/bayut/.test(s)) return "BAYUT";
  if (/dubizzle/.test(s)) return "DUBIZZLE";
  if (/facebook|instagram|meta|\bfb\b/.test(s)) return "META_LEAD_ADS";
  if (/whats ?app/.test(s)) return "WHATSAPP_AD";
  if (/web|site|online|google/.test(s)) return "WEBSITE";
  if (/refer/.test(s)) return "REFERRAL";
  if (/walk/.test(s)) return "WALK_IN";
  return "UNKNOWN";
}

/** "3,000,000", "3m", "2.5 million", "800k" → dirhams. */
export function readAed(v: string | null | undefined): number | null | "bad" {
  const t = (v ?? "").trim().toLowerCase().replace(/,/g, "").replace(/^(aed|dhs?)\s*/, "").replace(/\s*(aed|dhs?)$/, "");
  if (!t) return null;
  const m = t.match(/^(\d+(?:\.\d+)?)\s*(m|mn|mil|million|k|thousand)?$/);
  if (!m) return "bad";
  const n = Number(m[1]);
  const u = m[2] ?? "";
  const v2 = u.startsWith("m") ? n * 1e6 : u.startsWith("k") || u === "thousand" ? n * 1e3 : n;
  return v2 >= 1_000 && v2 <= 1_000_000_000 ? Math.round(v2) : "bad";
}

export type Planned = {
  phone: string; name: string | null; email: string | null; source: Source;
  notes: string | null; agentId: string | null; tags: string[];
  budgetMaxAed: number | null; communities: string[]; bedrooms: number | null;
};

export type Verdict =
  | { line: number; status: "new"; lead: Planned; warnings: string[] }
  | { line: number; status: "exists"; existing: { id: string; name: string | null }; lead: Planned; warnings: string[] }
  | { line: number; status: "repeat"; of: number; warnings: string[] }
  | { line: number; status: "error"; reason: string; warnings: string[] };

export function planImport(args: {
  rows: Record<string, string | null>[];
  mapping: Mapping;
  /** What is already on file, by normalised phone and lower-case email. */
  byPhone: Map<string, { id: string; name: string | null }>;
  byEmail: Map<string, { id: string; name: string | null }>;
  /** Team members by lower-case email and lower-case name. */
  agents: Map<string, string>;
  /** Applied to every imported row, so the batch can be found and undone. */
  batchTag: string | null;
}): Verdict[] {
  const { rows, mapping: m } = args;
  const get = (r: Record<string, string | null>, f: Field) => {
    const col = m[f];
    const v = col ? r[col] : null;
    return v && v.trim() ? v.trim() : null;
  };
  const seen = new Map<string, number>();
  const out: Verdict[] = [];

  rows.forEach((r, i) => {
    // The spreadsheet's own line number: data starts under the header.
    const line = i + 2;
    const warnings: string[] = [];
    const rawPhone = get(r, "phone");
    const phone = normalisePhone(rawPhone);
    if (!rawPhone) {
      out.push({ line, status: "error", reason: "No phone number. A lead is their WhatsApp number, so this row can't come in.", warnings });
      return;
    }
    if (!phone) {
      out.push({ line, status: "error", reason: `"${rawPhone}" isn't a phone number we can read. Numbers outside the UAE need their country code.`, warnings });
      return;
    }
    const earlier = seen.get(phone);
    if (earlier) {
      out.push({ line, status: "repeat", of: earlier, warnings });
      return;
    }
    seen.set(phone, line);

    let email = get(r, "email")?.toLowerCase() ?? null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      warnings.push(`"${email}" isn't an email address — left off.`);
      email = null;
    }
    const name = get(r, "name") ?? ([get(r, "firstName"), get(r, "lastName")].filter(Boolean).join(" ") || null);

    const agentRaw = get(r, "agent");
    let agentId: string | null = null;
    if (agentRaw) {
      agentId = args.agents.get(agentRaw.toLowerCase()) ?? null;
      if (!agentId) warnings.push(`"${agentRaw}" isn't on your team — left with nobody.`);
    }

    const budget = readAed(get(r, "budget"));
    if (budget === "bad") warnings.push(`Budget "${get(r, "budget")}" couldn't be read — left off.`);
    const bedsRaw = get(r, "bedrooms");
    let bedrooms: number | null = null;
    if (bedsRaw) {
      const b = /studio/i.test(bedsRaw) ? 0 : Number.parseInt(bedsRaw, 10);
      if (Number.isInteger(b) && b >= 0 && b <= 12) bedrooms = b;
      else warnings.push(`Bedrooms "${bedsRaw}" couldn't be read — left off.`);
    }
    const communities = canonicalCommunities((get(r, "areas") ?? "").split(/[,;/|]/));
    const tags = [...new Set([
      ...(get(r, "tags") ?? "").split(/[,;|]/).map((t) => t.trim().slice(0, 40)).filter(Boolean),
      ...(args.batchTag ? [args.batchTag] : []),
    ])];

    const lead: Planned = {
      phone, name: name?.slice(0, 120) ?? null, email, source: readSource(get(r, "source")),
      notes: get(r, "notes")?.slice(0, 5_000) ?? null, agentId, tags,
      budgetMaxAed: typeof budget === "number" ? budget : null, communities, bedrooms,
    };

    const existing = args.byPhone.get(phone) ?? (email ? args.byEmail.get(email) : undefined);
    out.push(existing
      ? { line, status: "exists", existing, lead, warnings }
      : { line, status: "new", lead, warnings });
  });
  return out;
}

export function tally(v: Verdict[]) {
  const t = { new: 0, exists: 0, repeat: 0, error: 0, warnings: 0 };
  for (const x of v) { t[x.status]++; if (x.warnings.length) t.warnings++; }
  return t;
}
