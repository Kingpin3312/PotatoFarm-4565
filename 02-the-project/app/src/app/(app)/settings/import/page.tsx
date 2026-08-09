"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Bringing an existing CRM across.
 *
 * ## What this screen used to claim, and why it was cut
 *
 * It told the brokerage we could read a **Goyzer or PropSpace export**
 * and showed a column-mapping table. Neither was true: no
 * vendor-specific parsing exists, and `migration.inspect` never returned
 * `detectedSource`, `columns`, `rows` or `willSkip` — it returns issue
 * counts. Four fields rendered blank and a table rendered empty.
 *
 * Telling a brokerage the tool understands their old CRM when it does
 * not is the kind of claim that ends a pilot in the first week. So the
 * screen now shows what `inspect` genuinely produces, which turns out
 * to be more useful anyway: **the specific records that will not import
 * and why.**
 */

/** Minimal CSV parse. The server validates properly; this is only enough
 *  to turn a file into rows before asking about them. */
function parseCsv(text: string): Record<string, string | null>[] {
  const lines = text.trim().split(/\r?\n/).slice(0, 20_000);
  if (lines.length < 2) return [];
  const head = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((l) => {
    const cells = l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(head.map((h, i) => [h, cells[i] || null]));
  });
}

export default function Import() {
  const [rows, setRows] = useState<Record<string, string | null>[]>([]);
  const [fileName, setFileName] = useState("");
  const inspect = api.migration.inspect.useMutation();
  const plan = api.migration.plan.useMutation();
  const { data: status } = api.migration.status.useQuery(undefined, {
    refetchInterval: (d) => (d?.state === "RUNNING" ? 3000 : false),
  });

  return (
    <div className="max-w-[680px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          Import
        </span>
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-ink -tracking-[0.026em] leading-none">
          Bring your history across
        </h1>
        {/* Says what it does, not what we wish it did. */}
        <p className="text-sm text-ink-2 mt-3 max-w-[50ch]">
          A CSV export from your current system, with a column header row. We read it and
          show you exactly which records will not come across, and why, before anything is
          written.
        </p>
      </header>

      {status?.state === "RUNNING" ? (
        <div className="bg-sunk rounded-xl p-5">
          <p className="text-[16px] text-ink font-semibold">Import running</p>
          <p className="text-sm text-ink-2 mt-1.5 max-w-[44ch] leading-snug">
            You can leave this page. It carries on and we will tell you when it is finished.
          </p>
        </div>
      ) : (
        <>
          <label htmlFor="imp" className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
            Your export file
          </label>
          <input id="imp" type="file" accept=".csv"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setFileName(f.name);
              void f.text().then((t) => {
                const parsed = parseCsv(t);
                setRows(parsed);
                inspect.mutate({ contacts: parsed, deals: [] });
              });
            }}
            className="text-[15px] text-ink" />

          {rows.length > 0 && (
            <p className="text-sm text-ink-2 mt-3 tabular">
              {fileName} — {rows.length.toLocaleString()} rows,{" "}
              {Object.keys(rows[0]).length} columns.
            </p>
          )}

          {inspect.data && (
            <>
              <h2 className="font-sans font-semibold text-[19px] text-ink -tracking-[0.02em] mt-8 mb-1">
                {inspect.data.blockers > 0
                  ? `${inspect.data.blockers} record${inspect.data.blockers === 1 ? "" : "s"} cannot come across`
                  : "Nothing blocking"}
              </h2>
              <p className="text-sm text-ink-2 mb-4 max-w-[48ch] leading-snug">
                {inspect.data.readiness}
              </p>

              {/* The real value: grouped issues with examples, so the
                  brokerage can go and look at the actual rows. */}
              <div className="border-t border-ink">
                {inspect.data.groups.map((g) => (
                  <div key={g.kind}
                       className={cn("py-4 border-b border-rule",
                         g.severity === "BLOCKER" && "border-l-[3px] border-l-danger pl-4 -ml-4")}>
                    <div className="flex items-baseline gap-3">
                      <span className="text-[16px] text-ink font-semibold">
                        {g.kind.toLowerCase().replace(/_/g, " ")}
                      </span>
                      <span className="ml-auto text-[15px] text-ink tabular">{g.count}</span>
                      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3 w-16 text-right">
                        {g.severity.toLowerCase()}
                      </span>
                    </div>
                    <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">
                      {g.suggestion}
                    </p>
                    {g.examples.length > 0 && (
                      <p className="font-mono text-[11px] text-ink-3 mt-1.5">
                        e.g. {g.examples.join(", ")}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              <div className="flex items-baseline gap-4 mt-5 flex-wrap">
                <span className="text-sm text-ink-2 tabular">
                  {inspect.data.decisions} need a decision · {inspect.data.notes} notes
                </span>
              </div>

              <Button variant="primary" className="mt-6" loading={plan.isPending}
                disabled={inspect.data.blockers > 0}
                onClick={() => plan.mutate({ contacts: rows, deals: [] })}>
                {inspect.data.blockers > 0
                  ? "Fix the blockers first"
                  : `Import ${(inspect.data.counted.contacts).toLocaleString()} contacts`}
              </Button>
            </>
          )}

          {inspect.error && (
            <p role="alert" className="text-sm text-danger mt-4 max-w-[44ch]">
              {inspect.error.message}
            </p>
          )}
        </>
      )}
    </div>
  );
}
