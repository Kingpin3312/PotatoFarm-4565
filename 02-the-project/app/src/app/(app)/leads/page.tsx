"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";
import { sentence } from "@/lib/sentence";
import { Funnel } from "@/components/ui/chart";

/**
 * Every lead, as a list.
 *
 * The pipeline board is for working; this is for finding. An owner
 * looking for "everyone from Bayut last month who never got a reply"
 * needs a list, not a board.
 *
 * Bulk assign is here rather than on the board because it is a manager's
 * action taken deliberately, not something to do by dragging.
 */
export default function Leads() {
  const [filter, setFilter] = useState<"all"|"unassigned"|"cold"|"hot">("all");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const { data, isLoading, isError, refetch, error } = api.leads.list.useQuery({ filter });
  /**
   * The same filter, deliberately.
   *
   * The strip describes the list underneath it, so switching to
   * "Nobody's" has to re-shape both — a summary that keeps describing
   * the whole book over a filtered list is worse than no summary,
   * because it is confidently wrong. `leads.distribution` takes the
   * same filter object and shares the `where` clause with `list`, so
   * the two cannot drift.
   */
  const { data: shape } = api.leads.distribution.useQuery({ filter });
  // pipeline.bulkAssign, not leads.assign — the latter takes ONE leadId
  // and this screen selects many. Passing an array to it would have
  // failed at runtime with a validation error nobody could read.
  const assign = api.pipeline.bulkAssign.useMutation({
    onSuccess: () => { setPicked(new Set()); void refetch(); },
  });
  const remove = api.leads.remove.useMutation({ onSuccess: () => void refetch() });
  const { data: team } = api.org.members.useQuery();

  if (isError) return <QueryError retry={() => void refetch()} what="your leads" error={error} />;

  // `leads.list` returns `{ rows, nextCursor }` — the cursor is how the
  // list pages, and naming the array `leads` here hid that.
  const rows = data?.rows ?? [];
  const toggle = (id: string) => setPicked((s) => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });

  return (
    <div className="max-w-[760px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-5">
        <span className="t-label text-ink-3 block mb-3">
          Leads
        </span>
        {/**
          * `shape.total`, not `rows.length`.
          *
          * `leads.list` takes twenty-five rows at a time, so this — the
          * largest number on the page, under the word "Leads" — was
          * never the number of leads. Below twenty-six it was right by
          * coincidence; above it, it would have read 25 and stayed
          * there while the book grew. A count query is the fix, and the
          * distribution below already runs one.
          */}
        <h1 className="font-sans font-semibold text-page text-ink tabular">
          {(shape?.total ?? rows.length).toLocaleString()}
        </h1>
      </header>

      <div className="flex gap-2 flex-wrap mb-5">
        {/* "Waiting on us", not "Hot".

            The `hot` filter is unread-inbound — the buyer has replied
            and nobody has answered — which is about *our* backlog, not
            about how good the lead is. It shared a word with the score
            band now shown on every row, and two different meanings of
            Hot on one screen is worse than either. The enum value stays
            `hot`: it is an API contract, and only the label was wrong. */}
        {([["all","Everyone"],["unassigned","Nobody's"],
           ["hot","Waiting on us"],["cold","Gone quiet"]] as const)
          .map(([k, label]) => (
            <button key={k} onClick={() => setFilter(k)} aria-pressed={filter === k}
              className={cn("min-h-11 px-4 rounded-lg border text-ui",
                filter === k ? "bg-accent text-on-accent border-accent-edge font-medium"
                             : "border-rule text-ink")}>
              {label}
            </button>
          ))}
      </div>

      {/**
        * What the book looks like.
        *
        * Every row already carries its band, which answers "how good is
        * this lead" one lead at a time. It never answered the question
        * an owner actually opens this screen with — *is my book any
        * good* — because that is not something you get by reading
        * twenty-five chips and holding a tally.
        *
        * Ordered best to worst, so the eye lands on Golden first and
        * the shape of a healthy book is a wedge leaning up.
        *
        * **Orange for Golden and Hot, grey for the rest**, which is the
        * same two-tone split the chips on every row below already use.
        * A five-step orange ramp was the obvious thing and does not
        * exist: measured, adjacent steps land 0.037–0.067 apart in
        * OKLCH lightness against a 0.06 floor, and any spacing wide
        * enough to pass puts the palest band at 1.4:1 on white, which
        * is not a colour, it is a rumour. Two validated tokens that
        * mean "ring them" and "not today" say more anyway.
        */}
      {shape && shape.total > 0 && (
        <div className="mb-6">
          <Funnel
            caption="Leads by score"
            rows={shape.bands.map((b) => ({
              label: b.label,
              value: b.count,
              // The share, because "3" means nothing without the book
              // size and this is the number an owner repeats out loud.
              note: b.count === 0 ? undefined
                : `${Math.round((b.count / shape.total) * 100)}%`,
              muted: b.band !== "GOLDEN" && b.band !== "HOT",
            }))}
            empty="No leads to score yet."
          />
        </div>
      )}

      {/* The bar appears only when something is selected, so it never
          sits there as permanent clutter. */}
      {picked.size > 0 && (
        <div className="bg-sunk rounded-xl p-4 mb-5 flex items-center gap-3 flex-wrap">
          <span className="text-ui text-ink font-medium tabular">
            {picked.size} selected
          </span>
          <label htmlFor="assign-to" className="sr-only">Assign to</label>
          <select id="assign-to"
            onChange={(e) => e.target.value &&
              assign.mutate({ leadIds: [...picked], agentId: e.target.value })}
            className="min-h-11 px-3 text-control text-ink bg-raised border border-rule rounded-lg">
            <option value="">Assign to…</option>
            {(team?.members ?? []).map((m) => (
              // `m.id` is the membership id; assignment wants the user.
              <option key={m.id} value={m.user.id}>{m.user.name ?? m.user.email}</option>
            ))}
          </select>
          <button className="btn-inline ml-auto" onClick={() => setPicked(new Set())}>
            Clear
          </button>
        </div>
      )}

      {isLoading ? (
        <div className="h-64 bg-sunk rounded-sm" aria-busy />
      ) : rows.length === 0 ? (
        <p className="text-sub text-ink-2 border-t border-rule pt-5 max-w-[42ch]">
          Nothing here. {filter === "unassigned" ? "Every lead has somebody on it." : ""}
        </p>
      ) : (
        <div className="border-t border-ink">
          {rows.map((l) => (
            <div key={l.id} data-lead={l.id}
                 className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 border-b border-rule">
              <label className="flex items-center min-h-11 cursor-pointer">
                <span className="sr-only">Select {l.name ?? l.phone}</span>
                <input type="checkbox" checked={picked.has(l.id)} onChange={() => toggle(l.id)}
                  className="w-5 h-5 accent-[var(--accent)]" />
              </label>
              <a href={`/inbox/${l.conversation?.id ?? l.id}`}
                 className="flex min-h-11 items-center text-ui text-ink no-underline flex-1 min-w-0">
                <span className="truncate">{l.name ?? l.phone}</span>
              </a>
              {/* The band, and the number it came from. Both, because
                  the word is what an agent scans and the number is what
                  they argue with — and a word with no number behind it
                  is the kind of label people learn to ignore. */}
              {l.band && (
                <span data-band={l.band.band} title={l.band.blurb}
                      className={cn(
                        "t-label px-1.5 py-0.5 rounded-[2px] border",
                        l.band.band === "GOLDEN" || l.band.band === "HOT"
                          ? "text-accent-deep border-accent-edge bg-accent-soft"
                          : "text-ink-3 border-rule")}>
                  {l.band.label} <span className="tabular">{l.score}</span>
                </span>
              )}
              <span className="t-label text-ink-3">
                {sentence(l.source)}
              </span>
              <span className="font-mono text-label text-ink-3 w-20 text-right tabular">
                {l.assignedTo?.name ?? "unassigned"}
              </span>
              {/* Why it is that warm, in the sweep's own words. An
                  instruction with no reason is one an agent learns to
                  ignore, and the reason is also how they catch it being
                  wrong — the same argument as the Today list. */}
              {l.drivers.length > 0 && (
                <p className="basis-full pl-8 text-note leading-snug text-ink-3">
                  {l.drivers.join(" · ")}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
