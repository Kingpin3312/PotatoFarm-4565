"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/cn";
import { aedShort } from "@/lib/money";
import type { StepStage } from "@/server/lib/deals/risk";
import { QueryError } from "@/components/ui/query-state";

/**
 * Deals, which nobody could see until now.
 *
 * The module underneath this is complete and has been for a long time:
 * twelve stages to DLD transfer, a timeline planned backwards from the
 * completion date, a health assessment, and a nightly job that raises
 * `DEAL_AT_RISK`. Accepting an offer creates one.
 *
 * There was no screen. The notification said a deal was at risk and
 * there was nothing to open.
 *
 * **Worst first, always.** Sorted by risk rather than by value, because
 * a collapsing small deal is more urgent than three healthy large ones,
 * and every CRM that sorts this screen by size buries the one thing
 * somebody needed to see.
 */
export default function Deals() {
  const { data, isLoading, isError, refetch, error } = api.deals.live.useQuery();
  const [open, setOpen] = useState<string | null>(null);

  return (
    <div className="mx-auto max-w-[760px] px-6 pb-28">
      <header className="pt-10 pb-6">
        <h1 className="font-sans text-page font-semibold text-ink">
          Deals
        </h1>
        {data && data.counts.total > 0 && (
          <p className="mt-3 max-w-[52ch] text-ui leading-snug text-ink-2">
            {summary(data.counts)}{" "}
            <span className="text-ink">{aedShort(data.valueFils)}</span> in play.
          </p>
        )}
      </header>

      {isLoading && <p className="text-sm text-ink-3">Checking where each one stands…</p>}

      {isError && (
        <div>
          <QueryError retry={() => void refetch()} what="your deals" error={error} />
        </div>
      )}

      {/* Empty is the normal state for a new brokerage, and it should say
          where a deal comes from rather than that there are none. */}
      {data && data.counts.total === 0 && (
        <p className="max-w-[46ch] text-ui leading-snug text-ink-2">
          Nothing in progress. A deal appears here the moment an offer is accepted,
          with the whole transfer planned backwards from the completion date.
        </p>
      )}

      {data && data.deals.length > 0 && (
        <ul className="border-t border-rule">
          {data.deals.map((d) => (
            <li key={d.id} className="border-b border-rule">
              <button
                onClick={() => setOpen(open === d.id ? null : d.id)}
                aria-expanded={open === d.id}
                // The row shows the counterparty's name when there is
                // one, so its reference is not always on screen and a
                // check cannot find the deal it means by reading the
                // label. Same reason `data-listing` exists on the
                // listings rows.
                data-deal={d.id}
                className="flex w-full items-baseline gap-3 py-4 text-left"
              >
                <Level level={d.level} />

                <span className="min-w-0 flex-1">
                  <span className="block text-control leading-snug text-ink">
                    {d.counterparty ?? d.reference}
                    {d.where && <span className="text-ink-2"> · {d.where}</span>}
                  </span>
                  {/* The reason, always. A colour with no sentence is an
                      alarm somebody learns to switch off. */}
                  <span className="mt-1 block max-w-[52ch] text-sm leading-snug text-ink-2">
                    {d.reason}
                  </span>
                </span>

                <span className="tabular shrink-0 text-right text-ui font-medium text-ink">
                  {aedShort(d.valueFils)}
                  <span className="mt-0.5 block font-mono text-label font-normal uppercase tracking-[0.1em] text-ink-3">
                    {STAGE[d.stage] ?? d.stage.toLowerCase().replace(/_/g, " ")}
                  </span>
                </span>
              </button>

              {open === d.id && <Detail id={d.id} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * The state in words, with the colour second.
 *
 * Same rule as everywhere else in this product: about one man in twelve
 * cannot separate the red from the green, and nobody can in Dubai
 * sunlight.
 */
function Level({ level }: { level: "HEALTHY" | "WATCH" | "AT_RISK" }) {
  const label = { HEALTHY: "on track", WATCH: "watch", AT_RISK: "at risk" }[level];
  return (
    <span
      className={cn(
        "w-20 shrink-0 t-label",
        level === "AT_RISK" ? "text-accent-deep" : level === "WATCH" ? "text-ink" : "text-ink-3"
      )}
    >
      {label}
    </span>
  );
}

function Detail({ id }: { id: string }) {
  const utils = api.useUtils();
  const { data, isLoading } = api.deals.one.useQuery({ id });
  const step = api.deals.step.useMutation({
    onSettled: () => {
      void utils.deals.one.invalidate({ id });
      void utils.deals.live.invalidate();
    },
  });
  const [blocking, setBlocking] = useState<StepStage | null>(null);
  const [reason, setReason] = useState("");

  if (isLoading || !data) {
    return <p className="pb-4 pl-[5.75rem] text-sm text-ink-3">Loading…</p>;
  }

  return (
    <div className="pb-5 pl-[5.75rem] pr-1">
      {/* A lapsed broker card or brokerage licence stops this deal
          moving, and the server refuses `Done` while it has. Said here
          rather than only at the click: finding out by pressing a button
          and being told no is the worst way to learn it, because the
          agent has already opened the deal believing they can work it. */}
      {data.blockers.length > 0 && (
        <div
          data-blocked
          className="mb-4 rounded-xl border-l-[3px] p-4"
          style={{ background: "var(--sunk)", borderLeftColor: "var(--danger-deep)" }}
        >
          <p className="text-ui font-medium text-ink">
            This deal cannot be moved on.
          </p>
          {data.blockers.map((b, i) => (
            <p key={i} className="mt-1.5 max-w-[48ch] text-sm leading-snug text-ink-2">
              <span className="text-ink">
                {b.whose}&rsquo;s {b.what} expired{" "}
                {b.daysExpired === 0 ? "today" : `${b.daysExpired} days ago`}.
              </span>{" "}
              {b.consequence}
            </p>
          ))}
          <p className="mt-2 text-sm">
            <a href="/documents" className="text-accent-deep">
              Record the renewal under Documents
            </a>{" "}
            <span className="text-ink-2">and this clears.</span>
          </p>
          {/* Recording a step as stuck stays available. That is somebody
              telling the truth about a transaction they cannot move,
              which is exactly what should still work while a card is
              being renewed. */}
          <p className="mt-2 max-w-[48ch] text-note leading-snug text-ink-3">
            You can still mark a step stuck.
          </p>
        </div>
      )}

      {/* Nothing showed when the mutation failed.
          `step` had no error branch at all, so a refusal — any refusal,
          not only the new one — looked like a button that did nothing
          and left an agent clicking it again. */}
      {step.isError && (
        <p role="alert" className="mb-4 rounded-[3px] bg-ink px-3 py-2.5 text-sm text-ground">
          {step.error.message}
        </p>
      )}

      {/* Everything that contributed, not only the headline reason. */}
      {data.risk.factors.length > 1 && (
        <ul className="mb-4 space-y-1.5 border-l-2 border-l-accent-edge pl-3">
          {data.risk.factors.slice(1).map((f, i) => (
            <li key={i} className="max-w-[48ch] text-sm leading-snug text-ink-2">{f}</li>
          ))}
        </ul>
      )}

      {data.risk.action && (
        <p className="mb-4 text-ui text-ink">
          <span className="t-label text-ink-3">
            Do this
          </span>
          <br />
          {data.risk.action.headline}
        </p>
      )}

      {data.steps.length === 0 ? (
        <p className="max-w-[46ch] text-sm leading-snug text-ink-2">
          No completion date has been agreed, so there is no schedule yet. Set one and
          the whole transfer plans itself backwards from it.
        </p>
      ) : (
        <ol className="border-t border-rule">
          {data.steps.map((s) => (
            <li key={s.stage} className="flex items-baseline gap-3 border-b border-rule py-2.5">
              <span className="w-12 shrink-0 t-label text-ink-3">
                {s.completedAt ? "done" : s.overdue ? "late" : ""}
              </span>
              <span className="min-w-0 flex-1">
                <span
                  className={cn(
                    "block text-ui leading-snug",
                    s.completedAt ? "text-ink-3 line-through" : "text-ink"
                  )}
                >
                  {s.title}
                </span>
                <span className="t-label text-ink-3">
                  {s.owner.toLowerCase()} · {s.dueAt.toLocaleDateString("en-GB",
                    { day: "numeric", month: "short" })}
                </span>
                {s.blockedReason && (
                  <span className="mt-1 block max-w-[44ch] text-sm leading-snug text-accent-deep">
                    Blocked: {s.blockedReason}
                  </span>
                )}
              </span>

              {!s.completedAt && (
                <span className="flex shrink-0 gap-1">
                  <button
                    onClick={() => step.mutate({ dealId: id, stage: s.stage, done: true })}
                    // Disabled as well as refused. The server is the
                    // control; this is so nobody presses a button that
                    // was never going to work, with the banner above
                    // already saying why.
                    disabled={step.isPending || data.blockers.length > 0}
                    className="btn-inline min-h-11 disabled:opacity-50"
                  >
                    Done
                  </button>
                  <button
                    onClick={() => { setBlocking(s.stage); setReason(s.blockedReason ?? ""); }}
                    className="min-h-11 px-2 t-label text-ink-3 hover:text-ink"
                  >
                    Stuck
                  </button>
                </span>
              )}
            </li>
          ))}
        </ol>
      )}

      {/* Recording a blocker is the same moment as updating the deal,
          which is why it is inline rather than a separate screen — that
          separation is how `blockedReason` stayed empty for so long. */}
      {blocking && (
        <div className="mt-4">
          <label htmlFor="stuck" className="t-label text-ink-3">
            What is holding it up?
          </label>
          <input
            id="stuck"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Bank waiting on the liability letter"
            className="mt-1 w-full rounded-lg border border-rule bg-sunk px-3 py-2 text-control text-ink focus-visible:shadow-[var(--ring)] focus-visible:outline-none"
          />
          <div className="mt-2 flex gap-2">
            <button
              onClick={() => {
                step.mutate({
                  dealId: id,
                  stage: blocking,
                  done: false,
                  blockedReason: reason.trim() || undefined,
                });
                setBlocking(null);
              }}
              disabled={step.isPending}
              className="btn-inline min-h-11 disabled:opacity-50"
            >
              Save
            </button>
            <button
              onClick={() => setBlocking(null)}
              className="min-h-11 px-2 t-label text-ink-3 hover:text-ink"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

const STAGE: Record<string, string> = {
  AGREED: "agreed",
  MOU_SIGNED: "form F",
  DEPOSIT_PAID: "deposit",
  MORTGAGE_APPLIED: "mortgage",
  VALUATION_DONE: "valued",
  FINAL_OFFER: "final offer",
  LIABILITY_LETTER: "liability",
  NOC_APPLIED: "NOC applied",
  NOC_RECEIVED: "NOC in",
  TRANSFER_BOOKED: "transfer booked",
};

function summary(c: { atRisk: number; watch: number; total: number }): string {
  if (c.atRisk === 0 && c.watch === 0) {
    return `${c.total} in progress, none in trouble.`;
  }
  const bits = [
    c.atRisk ? `${c.atRisk} at risk` : null,
    c.watch ? `${c.watch} worth watching` : null,
  ].filter(Boolean);
  const head = bits.join(" and ");
  return `${head[0]!.toUpperCase()}${head.slice(1)} of ${c.total}.`;
}
