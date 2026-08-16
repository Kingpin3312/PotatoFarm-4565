"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * Commission plans.
 *
 * Nothing in this product ever wrote a `CommissionPlan`. `myTier` read
 * one, found none — for every brokerage, always — and returned null, so
 * the line on an agent's screen telling them what share they are on
 * simply never appeared. The tiering engine underneath had never run
 * against a real row.
 *
 * ## Why an agent cannot see this screen
 *
 * `member:update`, which is ADMIN and above. What somebody else earns is
 * not an agent's business, and a commission structure visible to
 * everyone is a brokerage's most reliable source of arguments. The agent
 * sees their own band, and only theirs, on /commission.
 *
 * ## Why setting a plan does not edit one
 *
 * It closes the current plan and writes a new one. Editing tiers in
 * place would silently restate what an agent was owed for work already
 * done — the same reason an offer is never edited in this codebase.
 * What was in force in March stays readable in December.
 */
export default function CommissionPlans() {
  const { data, isLoading, isError, refetch, error } = api.commission.plans.useQuery();
  const [editing, setEditing] = useState<string | null>(null);

  if (isError) return <QueryError retry={() => void refetch()} what="commission plans" error={error} />;
  if (isLoading) {
    return <div className="max-w-[680px] mx-auto px-6 pt-10"><div className="h-52 bg-sunk rounded-sm" aria-busy /></div>;
  }

  const rows = data ?? [];
  const without = rows.filter((r) => !r.tiers && !r.malformed).length;

  return (
    <div className="max-w-[680px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="t-label text-ink-3 block mb-3">
          Commission
        </span>
        <h1 className="font-sans font-semibold text-page text-ink">
          {/* The gap, not the total. A list of plans tells an owner
              nothing they cannot see by scrolling; the number of people
              on no plan at all is the thing worth a heading. */}
          {without === 0 ? "Everyone is on a plan." : `${without} on no plan.`}
        </h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[52ch]">
          Bands are cumulative over the calendar year: an agent earns the share of the
          highest band they have passed. Changing a plan never rewrites the old one — the
          previous bands stay on record.
        </p>
      </header>

      <div className="border-t border-ink">
        {rows.map((r) => (
          <div key={r.userId} className="py-4 border-b border-rule">
            <div className="flex items-baseline gap-3 flex-wrap">
              <span className="text-control text-ink font-medium">{r.name}</span>
              <span className="t-label text-ink-3 border border-rule rounded-[2px] px-1.5">
                {r.role.toLowerCase().replace(/_/g, " ")}
              </span>

              {r.malformed ? (
                // Not folded into "no plan". A plan nobody can read is a
                // different problem from a plan nobody has set, and only
                // one of them gets fixed by saying so.
                <span className="t-label text-danger border border-accent-edge rounded-[2px] px-1.5">
                  Unreadable
                </span>
              ) : !r.tiers ? (
                <span className="t-label text-ink-3 border border-rule border-dashed rounded-[2px] px-1.5">
                  No plan
                </span>
              ) : null}

              <button
                type="button"
                onClick={() => setEditing(editing === r.userId ? null : r.userId)}
                className="ml-auto min-h-11 text-note bg-transparent border-0 p-0 text-accent-deep underline cursor-pointer"
              >
                {editing === r.userId ? "Cancel" : r.tiers ? "Change" : "Set a plan"}
              </button>
            </div>

            {r.tiers && (
              <div className="flex gap-4 flex-wrap mt-2">
                {r.tiers.map((t, i) => (
                  <span key={i} className="font-mono text-label text-ink-2">
                    {t.fromFils === "0" ? "from 0" : `from ${aedShort(t.fromFils)}`}
                    {" · "}
                    <span className="text-ink font-semibold">{(t.shareBp / 100).toFixed(0)}%</span>
                  </span>
                ))}
              </div>
            )}

            {!r.tiers && !r.malformed && (
              <p className="text-sm text-ink-3 mt-1.5 max-w-[48ch] leading-snug">
                With no plan, their commission screen shows what they are owed but not what
                share they are on.
              </p>
            )}

            {editing === r.userId && (
              <PlanEditor
                userId={r.userId}
                name={r.name}
                initial={r.tiers}
                onDone={() => setEditing(null)}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

type Row = { fromAed: string; sharePc: string };

function PlanEditor({
  userId, name, initial, onDone,
}: {
  userId: string;
  name: string;
  initial: { fromFils: string; shareBp: number }[] | null;
  onDone: () => void;
}) {
  const utils = api.useUtils();
  const [error, setError] = useState<string | null>(null);
  const [rows, setRows] = useState<Row[]>(
    initial?.length
      ? initial.map((t) => ({
          fromAed: String(Number(BigInt(t.fromFils) / 100n)),
          sharePc: String(t.shareBp / 100),
        }))
      // The common arrangement, offered rather than an empty form: half
      // to the agent, rising to sixty past a million.
      : [{ fromAed: "0", sharePc: "50" }, { fromAed: "1000000", sharePc: "60" }],
  );

  const save = api.commission.setPlan.useMutation({
    onSuccess: () => { void utils.commission.plans.invalidate(); onDone(); },
    onError: (e) => setError(e.message),
  });

  const set = (i: number, key: keyof Row, v: string) =>
    setRows((old) => old.map((r, j) => (j === i ? { ...r, [key]: v } : r)));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = rows.map((r) => ({
      // Commas stripped: agents type "1,000,000", and `Number` returns
      // NaN for it — which would arrive as a missing threshold rather
      // than an error anybody can see.
      fromAed: Number(r.fromAed.replace(/,/g, "").trim() || "0"),
      shareBp: Math.round(Number(r.sharePc.replace(/[%\s]/g, "") || "0") * 100),
    }));
    if (parsed.some((p) => !Number.isFinite(p.fromAed) || !Number.isFinite(p.shareBp))) {
      setError("Every band needs a figure and a percentage.");
      return;
    }
    save.mutate({ userId, tiers: parsed });
  }

  return (
    <form onSubmit={submit} className="mt-4 border border-rule rounded-[3px] p-4 bg-ground">
      <p className="t-label text-ink-3 mb-3">
        {name}&rsquo;s bands
      </p>

      {error && (
        <p role="alert" className="mb-3 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2.5">
        {rows.map((r, i) => (
          <div key={i} className="flex gap-2.5 items-end flex-wrap">
            <label className="flex flex-col gap-1 flex-1 min-w-[140px]">
              <span className="t-label text-ink-3">
                {i === 0 ? "From (start at 0)" : "From (AED, cumulative)"}
              </span>
              <input
                value={r.fromAed}
                onChange={(e) => set(i, "fromAed", e.target.value)}
                inputMode="decimal"
                aria-label={`Band ${i + 1} threshold in dirhams`}
                className="min-h-11 px-3 text-control bg-raised border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
              />
            </label>
            <label className="flex flex-col gap-1 w-[110px]">
              <span className="t-label text-ink-3">Share %</span>
              <input
                value={r.sharePc}
                onChange={(e) => set(i, "sharePc", e.target.value)}
                inputMode="decimal"
                aria-label={`Band ${i + 1} share percentage`}
                className="min-h-11 px-3 text-control bg-raised border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
              />
            </label>
            {rows.length > 1 && (
              <button
                type="button"
                onClick={() => setRows((old) => old.filter((_, j) => j !== i))}
                aria-label={`Remove band ${i + 1}`}
                className="min-h-11 px-2 bg-transparent border-0 text-ink-3 hover:text-ink cursor-pointer text-note"
              >
                Remove
              </button>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2.5 mt-4 flex-wrap">
        {rows.length < 6 && (
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => setRows((old) => [...old, { fromAed: "", sharePc: "" }])}
          >
            Add a band
          </Button>
        )}
        <Button type="submit" variant="primary" size="sm" loading={save.isPending} className="ml-auto">
          Save
        </Button>
      </div>
    </form>
  );
}

/**
 * A threshold, shortened.
 *
 * Local rather than `money.ts`'s `aedShort`, because this takes fils as
 * a decimal *string* off the wire — the shape `parseTiers` writes — and
 * the shared formatter takes a bigint. Converting here keeps the wire
 * format in one place instead of teaching the money module about JSON.
 */
function aedShort(fils: string): string {
  const aed = Number(BigInt(fils) / 100n);
  if (aed >= 1_000_000) return `AED ${(aed / 1_000_000).toFixed(aed % 1_000_000 === 0 ? 0 : 1)}m`;
  if (aed >= 1_000) return `AED ${(aed / 1_000).toFixed(0)}k`;
  return `AED ${aed}`;
}
