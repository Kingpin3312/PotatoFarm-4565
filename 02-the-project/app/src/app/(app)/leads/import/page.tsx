"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { csvRecords, toCsv } from "@/lib/csv";
import { download } from "@/lib/download";
import { FIELDS, FIELD_LABEL, guessMapping, type Field, type Mapping } from "@/lib/import-fields";

/**
 * Bring leads in from a spreadsheet.
 *
 * Three steps, and nothing is written until the third: choose the file,
 * check which column is which (guessed from the headers, always
 * correctable), read the preview — how many are new, how many are
 * already here, which lines cannot come in and why — then import.
 *
 * Every imported lead carries the batch's tag, so the whole import can
 * be found, reassigned or archived from the leads list in one go.
 */
type Rows = Record<string, string | null>[];

export default function ImportLeads() {
  const [file, setFile] = useState<{ name: string; headers: string[]; rows: Rows } | null>(null);
  const [mapping, setMapping] = useState<Mapping>({});
  const [onExisting, setOnExisting] = useState<"skip" | "fill">("skip");
  const [agentId, setAgentId] = useState("");
  const [label, setLabel] = useState("");
  const [readError, setReadError] = useState<string | null>(null);

  const { data: team } = api.org.members.useQuery(undefined, { retry: false });
  const preview = api.imports.previewLeads.useMutation();
  const commit = api.imports.commitLeads.useMutation();
  const result = commit.data;
  const shown = result ?? preview.data;

  async function choose(f: File | undefined) {
    setReadError(null); preview.reset(); commit.reset();
    if (!f) return;
    if (f.size > 15 * 1024 * 1024) { setReadError("That file is over 15 MB. Split it, or export fewer columns."); return; }
    const text = await f.text();
    const { headers, rows } = csvRecords(text, 20_000);
    if (!rows.length) { setReadError("No rows found. The first line should be the column names."); return; }
    setFile({ name: f.name, headers, rows });
    setMapping(guessMapping(headers));
  }

  const input = () => ({ rows: file!.rows, mapping });

  return (
    <div className="max-w-[880px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <Link href="/leads" className="t-label text-ink-3 no-underline">← Leads</Link>
        <h1 className="font-sans font-semibold text-h2 text-ink mt-3">Import leads</h1>
        <p className="text-ui text-ink-2 mt-2 max-w-[60ch]">
          A CSV from your old CRM, a portal or a spreadsheet. Save it from Excel or Google Sheets as
          &ldquo;CSV&rdquo;. Nothing is added until you press Import at the end.
        </p>
      </header>

      <section aria-labelledby="s1" className="border-t border-rule-strong pt-5">
        <h2 id="s1" className="font-sans font-medium text-sub text-ink">1. Choose the file</h2>
        <label className="mt-3 inline-flex flex-col gap-1.5">
          <span className="t-label text-ink-3">CSV file</span>
          <input type="file" accept=".csv,text/csv" onChange={(e) => void choose(e.target.files?.[0])}
            className="text-ui text-ink file:me-3 file:min-h-11 file:px-4 file:rounded-lg file:border file:border-rule file:bg-raised file:text-ink" />
        </label>
        {file && <p className="text-sm text-ink-2 mt-2" data-rows={file.rows.length}>{file.name}: {file.rows.length.toLocaleString()} rows, {file.headers.length} columns.</p>}
        {readError && <p role="alert" className="text-sm text-danger mt-2">{readError}</p>}
      </section>

      {file && (
        <section aria-labelledby="s2" className="border-t border-rule-strong pt-5 mt-8">
          <h2 id="s2" className="font-sans font-medium text-sub text-ink">2. Which column is which</h2>
          <p className="text-sm text-ink-2 mt-1 max-w-[60ch]">
            Guessed from your column names — check them. Only the phone number is required: a lead is
            their WhatsApp number.
          </p>
          <div className="grid gap-3 mt-4 grid-cols-1 min-[640px]:grid-cols-2">
            {FIELDS.map((f: Field) => (
              <label key={f} className="flex flex-col gap-1">
                <span className="t-label text-ink-3">{FIELD_LABEL[f]}{f === "phone" ? " (required)" : ""}</span>
                <select value={mapping[f] ?? ""} data-field={f}
                  onChange={(e) => { preview.reset(); commit.reset(); setMapping((m) => ({ ...m, [f]: e.target.value || undefined })); }}
                  className={INPUT}>
                  <option value="">Not in this file</option>
                  {file.headers.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            ))}
          </div>
          <div className="mt-5">
            <Button variant="secondary" loading={preview.isPending} disabled={!mapping.phone}
              onClick={() => preview.mutate(input())}>
              Check the file
            </Button>
            {!mapping.phone && <p className="text-sm text-ink-3 mt-2">Choose the phone column first.</p>}
          </div>
          {preview.error && <p role="alert" className="text-sm text-danger mt-2">{preview.error.message}</p>}
        </section>
      )}

      {file && shown && (
        <section aria-labelledby="s3" className="border-t border-rule-strong pt-5 mt-8">
          <h2 id="s3" className="font-sans font-medium text-sub text-ink">{result ? "Done" : "3. What will happen"}</h2>
          <dl className="grid grid-cols-2 min-[640px]:grid-cols-4 gap-4 mt-4" data-counts={JSON.stringify(shown.counts)}>
            <Count n={shown.counts.new} label={result ? "added" : "new leads"} strong />
            <Count n={shown.counts.exists} label={result && onExisting === "fill" ? "already here, blanks filled" : "already here"} />
            <Count n={shown.counts.repeat} label="repeated in the file" />
            <Count n={shown.counts.error} label="can't come in" />
          </dl>

          {shown.problems.length > 0 && (
            <div className="mt-6">
              <div className="flex items-baseline justify-between gap-4 flex-wrap">
                <h3 className="text-ui font-medium text-ink">Lines to look at</h3>
                <button type="button" className="btn-inline min-h-11"
                  onClick={() => download(`${file.name.replace(/\.csv$/i, "")}-problems.csv`,
                    toCsv(["Line", "Name", "Outcome", "Why"], shown.problems.map((p) => [
                      p.line, p.name ?? "", p.status, [p.reason, ...p.warnings].filter(Boolean).join(" "),
                    ])))}>
                  Download the list
                </button>
              </div>
              <ul className="mt-2 border-t border-rule max-h-[360px] overflow-auto">
                {shown.problems.slice(0, 200).map((p) => (
                  <li key={p.line} className="py-2 border-b border-rule text-sm">
                    <span className="font-mono text-ink-3 me-3 tabular">line {p.line}</span>
                    <span className={p.status === "error" ? "text-danger" : "text-ink-2"}>
                      {[p.reason, ...p.warnings].filter(Boolean).join(" ")}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {!result && (
            <div className="mt-6 grid gap-4 max-w-[560px]">
              <label className="flex flex-col gap-1">
                <span className="t-label text-ink-3">People already here</span>
                <select value={onExisting} onChange={(e) => setOnExisting(e.target.value as "skip" | "fill")} className={INPUT}>
                  <option value="skip">Leave them as they are</option>
                  <option value="fill">Fill in what they&rsquo;re missing (never overwrites)</option>
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="t-label text-ink-3">Give them to{mapping.agent ? " (when the file doesn’t say)" : ""}</span>
                <select value={agentId} onChange={(e) => setAgentId(e.target.value)} className={INPUT}>
                  <option value="">Nobody — they go to &ldquo;Nobody&rsquo;s&rdquo;</option>
                  {(team?.members ?? []).map((m) => <option key={m.user.id} value={m.user.id}>{m.user.name ?? m.user.email}</option>)}
                </select>
              </label>
              <label className="flex flex-col gap-1">
                <span className="t-label text-ink-3">Tag for this import</span>
                <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={40}
                  placeholder={`import ${new Date().toISOString().slice(0, 10)}`} className={INPUT} />
              </label>
              <div>
                <Button variant="primary" loading={commit.isPending} disabled={shown.counts.new === 0 && onExisting === "skip"}
                  onClick={() => commit.mutate({ ...input(), onExisting, agentId: agentId || null, label: label || undefined })}>
                  Import {shown.counts.new.toLocaleString()} {shown.counts.new === 1 ? "lead" : "leads"}
                </Button>
              </div>
            </div>
          )}
          {commit.error && <p role="alert" className="text-sm text-danger mt-3">{commit.error.message}</p>}
          {result && (
            <p className="text-ui text-ink mt-6" role="status">
              {result.created.toLocaleString()} added, tagged &ldquo;{result.tag}&rdquo;.{" "}
              <Link href="/leads" className="btn-inline">See them on the leads list</Link> — filter by that tag to
              reassign or archive the whole import.
            </p>
          )}
        </section>
      )}
    </div>
  );
}

const INPUT = "min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink w-full";

function Count({ n, label, strong }: { n: number; label: string; strong?: boolean }) {
  return (
    <div>
      <dt className="sr-only">{label}</dt>
      <dd className={strong ? "font-sans font-semibold text-h2 text-ink tabular" : "font-sans font-semibold text-h2 text-ink-2 tabular"}>
        {n.toLocaleString()}
      </dd>
      <p className="text-sm text-ink-3" aria-hidden>{label}</p>
    </div>
  );
}
