"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import type { RouterOutputs } from "@/lib/trpc";

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
  // Guarded above by `lines.length < 2`, but still an index read.
  const head = (lines[0] ?? "").split(",").map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((l) => {
    const cells = l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    return Object.fromEntries(head.map((h, i) => [h, cells[i] || null]));
  });
}

export default function Import() {
  const [rows, setRows] = useState<Record<string, string | null>[]>([]);
  const [fileName, setFileName] = useState("");
  const [source, setSource] = useState("");
  const utils = api.useUtils();
  const inspect = api.migration.inspect.useMutation();
  const start = api.migration.start.useMutation({
    onSuccess: () => void utils.migration.status.invalidate(),
  });
  // `migration.plan` is a query — it returns the cutover stages, the
  // honest scope and the rollback, all of them constants. Nothing to
  // mutate.
  const plan = api.migration.plan.useQuery();
  const { data: status } = api.migration.status.useQuery(undefined, {
    // TanStack Query v5 hands `refetchInterval` the query, not the data.
    // And there is no "RUNNING" MigrationState — the states are DRAFT,
    // STAGED, RECONCILED, PARALLEL, COMPLETE, ABANDONED. `status` only
    // ever returns one that is still in flight, so its mere presence is
    // the signal to keep polling.
    refetchInterval: (q) => (q.state.data ? 3000 : false),
  });

  return (
    <div className="max-w-[680px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="t-label text-ink-3 block mb-3">
          Import
        </span>
        <h1 className="font-sans font-semibold text-page text-ink">
          Bring your history across
        </h1>
        {/* Says what it does, not what we wish it did. */}
        <p className="text-sm text-ink-2 mt-3 max-w-[50ch]">
          A CSV export from your current system, with a column header row. We read it and
          show you exactly which records will not come across, and why, before anything is
          written.
        </p>
      </header>

      {status ? (
        <Underway status={status} />
      ) : (
        <>
          <label htmlFor="imp" className="block t-label text-ink-3 mb-2">
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
            className="text-control text-ink" />

          {rows.length > 0 && (
            <p className="text-sm text-ink-2 mt-3 tabular">
              {fileName} — {rows.length.toLocaleString()} rows,{" "}
              {Object.keys(rows[0] ?? {}).length} columns.
            </p>
          )}

          {inspect.data && (
            <>
              <h2 className="font-sans font-semibold text-body-lg text-ink mt-8 mb-1">
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
                      <span className="text-control text-ink font-medium">
                        {g.kind.toLowerCase().replace(/_/g, " ")}
                      </span>
                      <span className="ml-auto text-ui text-ink tabular">{g.count}</span>
                      <span className="t-label text-ink-3 w-16 text-right">
                        {g.severity.toLowerCase()}
                      </span>
                    </div>
                    <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">
                      {g.suggestion}
                    </p>
                    {g.examples.length > 0 && (
                      <p className="font-mono text-label text-ink-3 mt-1.5">
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

              {/*
                Enabled now, and the label is careful about what it does.

                It called `plan.mutate(...)` once — `plan` is a query
                returning three constants — and then sat disabled,
                because nothing anywhere created a `Migration` row.
                `migration.start` does, with one issue per finding.

                What it does **not** do is write contacts into the live
                tables. Staging is a separate stage with its own exit
                criteria, and the label says "start" rather than
                "import" for that reason. A brokerage that believes four
                years of history has moved when it has not is the worst
                outcome this screen can produce.
              */}
              <div className="mt-6 flex items-center gap-4 flex-wrap">
                <Button
                  variant="primary"
                  loading={start.isPending}
                  onClick={() => start.mutate({
                    source: source.trim() || "spreadsheet",
                    contacts: rows,
                    deals: [],
                  })}
                >
                  Start the migration
                </Button>
                <label className="flex items-center gap-2 text-sm text-ink-2">
                  from
                  <input
                    value={source}
                    onChange={(e) => setSource(e.target.value)}
                    placeholder="PropSpace"
                    aria-label="Which system this export came from"
                    className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink w-[16ch]"
                  />
                </label>
              </div>
              <p className="text-note text-ink-3 mt-2 max-w-[48ch] leading-snug">
                This records the migration and every issue above against it. Nothing is
                written into your leads yet — that is the next stage, and it has its own
                sign-off.
              </p>
              {start.error && (
                <p role="alert" className="text-sm text-danger mt-3 max-w-[46ch]">
                  {start.error.message}
                </p>
              )}
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

/**
 * The migration under way.
 *
 * This said "Import running — you can leave this page, it carries on"
 * above a table nothing ever wrote a row to, so it was never once
 * rendered. What a brokerage actually needs here is not a spinner: it is
 * the list of decisions waiting on them, because that is what the whole
 * cutover is gated on and it is where every real migration stalls.
 */
function Underway({ status }: { status: NonNullable<RouterOutputs["migration"]["status"]> }) {
  const utils = api.useUtils();
  const plan = api.migration.plan.useQuery();
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const decide = api.migration.decide.useMutation({
    onSuccess: () => void utils.migration.status.invalidate(),
  });
  const advance = api.migration.advance.useMutation({
    onSuccess: () => void utils.migration.status.invalidate(),
  });

  const stage = plan.data?.stages.find((s) => s.state === status.state);
  const undecided = status.issues;
  const blockers = undecided.filter((i) => i.severity === "BLOCKER");

  return (
    <div>
      <div className="bg-sunk rounded-xl p-5">
        <p className="t-label text-ink-3">
          {status.source}
        </p>
        <p className="text-body-lg text-ink font-semibold mt-1">
          {stage?.title ?? status.state.toLowerCase()}
        </p>
        {stage && stage.exitCriteria.length > 0 && (
          <>
            <p className="text-sm text-ink-2 mt-3">Before the next stage:</p>
            <ul className="mt-1.5 space-y-1">
              {stage.exitCriteria.map((c) => (
                <li key={c} className="text-sm text-ink-2 leading-snug pl-4 -indent-4">— {c}</li>
              ))}
            </ul>
          </>
        )}
      </div>

      {undecided.length > 0 && (
        <>
          <h2 className="font-sans font-semibold text-body-lg text-ink mt-8 mb-1">
            {undecided.length} waiting on you
          </h2>
          {/* Blockers first and named as such. A blocker is a record
              that cannot be imported as it stands, and staging is
              refused while one has no decision. */}
          <p className="text-sm text-ink-2 mb-4 max-w-[48ch] leading-snug">
            {blockers.length > 0
              ? `${blockers.length} of these stop the next stage until somebody decides.`
              : "None of these are blocking. They are recorded so nothing is silently fixed."}
          </p>
          <div className="border-t border-ink">
            {undecided.map((i) => (
              <div key={i.id} data-issue={i.id} className="py-4 border-b border-rule">
                <div className="flex items-baseline gap-3">
                  <span className="text-control text-ink">{i.kind.replace(/_/g, " ")}</span>
                  <span className="ml-auto t-label text-ink-3">
                    {i.severity.toLowerCase()}
                  </span>
                </div>
                <p className="text-sm text-ink-2 mt-1 max-w-[48ch] leading-snug">{i.detail}</p>
                {i.suggestion && (
                  <p className="text-sm text-ink-3 mt-1 max-w-[48ch] leading-snug">
                    Suggested: {i.suggestion}
                  </p>
                )}
                <div className="flex gap-2 mt-2 flex-wrap">
                  <input
                    value={drafts[i.id] ?? ""}
                    onChange={(e) => setDrafts((d) => ({ ...d, [i.id]: e.target.value }))}
                    placeholder={i.suggestion ?? "What should happen to it?"}
                    aria-label={`Decision for ${i.kind}`}
                    className="flex-1 min-w-[18ch] min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
                  />
                  <Button
                    variant="secondary"
                    disabled={!(drafts[i.id] ?? i.suggestion ?? "").trim()}
                    loading={decide.isPending}
                    onClick={() => decide.mutate({
                      issueId: i.id,
                      // The suggestion is only recorded as the decision
                      // when somebody presses the button on it. Storing
                      // it at import time would be a silent fix.
                      decision: (drafts[i.id] ?? i.suggestion ?? "").trim(),
                    })}
                  >
                    Record
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {advance.error && (
        <p role="alert" className="text-sm text-danger mt-4 max-w-[48ch]">{advance.error.message}</p>
      )}

      {status.state === "DRAFT" && (
        <Button
          variant="primary"
          className="mt-6"
          loading={advance.isPending}
          onClick={() => advance.mutate({
            to: "STAGED",
            acknowledged: stage?.exitCriteria ?? ["mapping agreed"],
          })}
        >
          The mapping is agreed
        </Button>
      )}
    </div>
  );
}
