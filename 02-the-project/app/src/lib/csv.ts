/**
 * CSV, read and written properly.
 *
 * The import screen split each line on commas, so the first quoted name
 * with a comma in it — "Al Mansoori, Sarah" — moved every column after it
 * one place right, and a phone number landed in the email column. Real
 * exports from other CRMs quote freely, put line breaks inside notes, and
 * start with a byte-order mark. This handles all three (RFC 4180).
 *
 * Shared by the browser, which reads a file before asking about it, and
 * the server, which writes exports.
 */

/** Rows of cells. The first row is the header. */
export function parseCsv(text: string, maxRows = 50_000): string[][] {
  const src = text.replace(/^﻿/, "");
  // Excel in some locales writes semicolons. Decide from the header line.
  const firstLine = src.slice(0, src.search(/\r?\n|$/));
  const sep = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i]!;
    if (quoted) {
      if (c === '"') {
        if (src[i + 1] === '"') { cell += '"'; i++; } else quoted = false;
      } else cell += c;
      continue;
    }
    if (c === '"' && cell === "") quoted = true;
    else if (c === sep) { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((x) => x.trim() !== "")) rows.push(row);
      row = [];
      if (rows.length > maxRows) break;
    } else cell += c;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((x) => x.trim() !== "")) rows.push(row);
  }
  return rows.map((r) => r.map((x) => x.trim()));
}

/** Header row plus objects keyed by header, blanks as null. */
export function csvRecords(text: string, maxRows?: number): { headers: string[]; rows: Record<string, string | null>[] } {
  const [head, ...body] = parseCsv(text, maxRows);
  const headers = (head ?? []).map((h, i) => h || `Column ${i + 1}`);
  return {
    headers,
    rows: body.map((r) => Object.fromEntries(headers.map((h, i) => [h, r[i] ? r[i]! : null]))),
  };
}

/**
 * One cell, safe to open in a spreadsheet.
 *
 * A cell starting `=`, `@` or a formula-ish `+`/`-` is run as a formula by
 * Excel and Sheets — CSV injection, and an export of names and notes is
 * exactly where a hostile one would sit. Those get a leading apostrophe.
 * A phone number (`+971…`) is left alone: it is digits, not a formula,
 * and an apostrophe on every number would be its own bug.
 */
export function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : v instanceof Date ? v.toISOString() : String(v);
  if (/^[=@\t\r]/.test(s) || /^[+-][^\d\s]/.test(s)) s = `'${s}`;
  return /[",\r\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  // The byte-order mark is what makes Excel read Arabic names as Arabic.
  return "﻿" + [headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n") + "\r\n";
}
