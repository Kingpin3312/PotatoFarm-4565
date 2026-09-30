"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { aedShort } from "@/lib/money";
import { readAed } from "./requirements";

/**
 * Everything else they are doing with us.
 *
 * The person's main business is the lead itself — its stage is the one on
 * the board beside their name. This is each further piece: the buyer who
 * is also letting their villa, the tenant who has decided to buy. Each has
 * its own column, its own value and its own ending (the audit's B5).
 */
const KIND: Record<string, string> = { BUY: "Buying", SELL: "Selling", RENT: "Renting", LET: "Letting" };

export function Opportunities({ leadId }: { leadId: string }) {
  const utils = api.useUtils();
  const { data } = api.opportunities.forLead.useQuery({ leadId });
  const { data: stages } = api.pipeline.stages.useQuery();
  const [adding, setAdding] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const done = () => { setProblem(null); void utils.opportunities.forLead.invalidate({ leadId }); void utils.pipeline.board.invalidate(); };
  const create = api.opportunities.create.useMutation({ onSuccess: () => { setAdding(false); done(); }, onError: (e) => setProblem(e.message) });
  const move = api.opportunities.move.useMutation({ onSuccess: done, onError: (e) => setProblem(e.message) });
  const close = api.opportunities.close.useMutation({ onSuccess: done, onError: (e) => setProblem(e.message) });

  if (!data) return null;
  const { rows, canAdd } = data;
  if (!rows.length && !canAdd) return null;
  const columns = (stages && "stages" in stages ? stages.stages : []).map((s) => ({ id: s.id, name: s.name }));

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setProblem(null);
    const f = new FormData(e.currentTarget);
    const value = readAed(String(f.get("value") ?? ""));
    if (value === "bad") { setProblem("Value is in dirhams — 3,000,000 or 3m."); return; }
    create.mutate({
      leadId,
      kind: String(f.get("kind")) as "BUY" | "SELL" | "RENT" | "LET",
      title: String(f.get("title") ?? "").trim(),
      valueAed: value,
    });
  }

  return (
    <section id="opportunities" className="mb-10" aria-labelledby="opp-heading">
      <h2 id="opp-heading" className="font-sans font-medium text-sub text-ink mb-1">Other business with them</h2>
      {rows.length === 0 && (
        <p className="text-sm text-ink-3 max-w-[52ch]">
          Only what is above. If they are also selling, letting or renting, add it so it has its own place on the board.
        </p>
      )}

      <ul className="mt-2 space-y-4">
        {rows.map((o) => (
          <li key={o.id} data-opportunity={o.id} className={o.closedAt ? "opacity-70" : ""}>
            <p className="text-ui text-ink">
              <span className="t-label text-ink-3 me-2">{KIND[o.kind]}</span>
              {o.title}
            </p>
            <p className="text-sm text-ink-2 mt-0.5">
              {[o.valueFils ? aedShort(o.valueFils) : null, o.agent ? `with ${o.agent}` : null, o.listing?.reference]
                .filter(Boolean).join(" · ") || "No value yet"}
            </p>
            {o.closedAt ? (
              <p className="text-sm text-ink-3 mt-0.5">{o.status === "WON" ? "Won" : "Lost"} {new Date(o.closedAt).toLocaleDateString("en-GB")}</p>
            ) : o.canMove ? (
              <div className="flex gap-x-5 gap-y-1 mt-1 items-center flex-wrap">
                <label className="inline-flex items-center gap-2 text-sm text-ink-2">
                  Column
                  <select value={o.stageId ?? ""} disabled={move.isPending}
                    onChange={(e) => move.mutate({ id: o.id, stageId: e.target.value })}
                    className="min-h-11 px-2 text-control bg-ground border border-rule rounded-[3px] text-ink">
                    {!o.stageId && <option value="" disabled>Not on the board</option>}
                    {columns.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </label>
                <button type="button" className="btn-inline min-h-11" disabled={close.isPending} onClick={() => close.mutate({ id: o.id, won: true })}>Won</button>
                <button type="button" className="btn-inline min-h-11" disabled={close.isPending} onClick={() => close.mutate({ id: o.id, won: false })}>Lost</button>
              </div>
            ) : (
              <p className="text-sm text-ink-3 mt-0.5">{o.stage?.name ?? "Not on the board"}</p>
            )}
          </li>
        ))}
      </ul>

      {canAdd && (adding ? (
        <form onSubmit={submit} className="mt-4 grid gap-4 sm:grid-cols-2" aria-label="Add other business">
          <label className="flex flex-col gap-1.5">
            <span className="t-label text-ink-3">They are</span>
            <select name="kind" defaultValue="LET" className={INPUT}>
              {Object.entries(KIND).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="t-label text-ink-3">Worth (AED)</span>
            <input name="value" inputMode="decimal" placeholder="180,000 a year, or 3m" className={INPUT} />
          </label>
          <label className="flex flex-col gap-1.5 sm:col-span-2">
            <span className="t-label text-ink-3">What it is</span>
            <input name="title" required minLength={2} maxLength={120} placeholder="Their villa in Arabian Ranches" className={INPUT} />
          </label>
          <div className="flex gap-3 items-center sm:col-span-2">
            <Button type="submit" variant="primary" loading={create.isPending}>Add</Button>
            <button type="button" className="btn-inline min-h-11" onClick={() => { setAdding(false); setProblem(null); }}>Cancel</button>
          </div>
        </form>
      ) : (
        <button type="button" className="btn-inline min-h-11 mt-1" onClick={() => setAdding(true)}>Add other business</button>
      ))}

      {problem && <p role="alert" className="text-sm text-danger mt-2 max-w-[52ch]">{problem}</p>}
    </section>
  );
}

const INPUT = "min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink";
