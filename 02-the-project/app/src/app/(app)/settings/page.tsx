"use client";

import { KillSwitch } from "./kill-switch";
import { CalendarFeed } from "./calendar";
import { ListingFeed } from "./listing-feed";
import { LanguageChoice } from "./language";
import { AssistantSettings } from "./assistant";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { Donut } from "@/components/ui/chart";

export default function SettingsPage() {
  const { data , isError, refetch , isLoading } = api.assistant.status.useQuery();
  const { data: handovers } = api.assistant.handovers.useQuery({ days: 7 });
  const { data: drafts } = api.assistant.draftStats.useQuery();

  return (
    <div className="max-w-[860px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-2">
        <span className="t-label text-ink-3 block mb-3">
          Settings · Assistant
        </span>
        <h1 className="font-sans text-page text-ink">
          The assistant
        </h1>
        <p className="mt-3 max-w-[56ch] text-ink-2">
          What it is allowed to do, what it has cost, and how to stop it.
        </p>
      </header>

      <div className="mt-7"><KillSwitch /></div>

      <CalendarFeed />

      <ListingFeed />

      <LanguageChoice />

      {data && (
        <>
          <h2 className="font-sans font-semibold text-section text-ink mt-12 mb-1">This month</h2>
          <p className="text-sm text-ink-3 max-w-[60ch]">
            Every call is counted, including ones that were blocked or failed — a total
            that only reflects the successes under-reports exactly when something is
            going wrong.
          </p>
          <div className="grid grid-cols-4 max-[640px]:grid-cols-2 border-t border-rule-strong mt-5">
            {/* Drafted, in draft mode: "sent" by the assistant stays at
                zero, because a person sends every reply. */}
            <Fig n={String((data.usage.byOutcome.drafted ?? 0) + (data.usage.byOutcome.sent ?? 0))} l="Replies written" />
            <Fig n={`${(data.usage.avgLatencyMs / 1000).toFixed(1)}s`} l="Average reply" />
            <Fig n={String(handovers?.total ?? 0)} l="Handed to a person" highlight />
            <Fig n={String(data.usage.byOutcome.blocked ?? 0)} l="Drafts blocked" highlight />
          </div>
        </>
      )}

      {/* The number behind any decision to let the assistant send alone. */}
      {drafts && drafts.decided + drafts.overtaken + drafts.waiting > 0 && (
        <>
          <h2 className="font-sans font-semibold text-section text-ink mt-12 mb-1">Its drafts, last 30 days</h2>
          <p className="text-sm text-ink-3 max-w-[60ch]">
            Every reply the assistant writes waits for a person to send it. When nearly all of
            them go out as written, that is the evidence for letting it reply by itself — outside
            working hours first.
          </p>
          {/* The ring is the drafts a person decided about — the same
              whole `sentAsWrittenPct` is a share of, so the centre and
              the pink slice are one number. Overtaken and waiting drafts
              were never decided, so they sit beside it, not in it. */}
          <div className="mt-6">
            <Donut
              caption="What happened to the drafts a person decided about"
              slices={[
                { label: "Sent as written", value: drafts.asWritten },
                { label: "Changed first", value: drafts.edited },
                { label: "Thrown away", value: drafts.discarded },
              ]}
              centre={drafts.sentAsWrittenPct === null ? "—" : `${drafts.sentAsWrittenPct}%`}
              centreLabel="sent as written"
              empty="Nobody has sent, changed or thrown away a draft yet. This fills in as the team works through them."
            />
          </div>
          {(drafts.overtaken > 0 || drafts.waiting > 0) && (
            <p className="mt-4 text-note text-ink-3 max-w-[60ch]">
              Not counted above: {drafts.overtaken} overtaken — the buyer wrote again or somebody
              replied first — and {drafts.waiting} still waiting for a person.
            </p>
          )}
        </>
      )}

      {/* The ceiling, directly under what has been spent against it.

          `assistant.tsx` was a finished form over `updateSettings` that
          nothing imported, so `monthlyBudgetFils` and `warnAtPercent`
          were columns only a database client could set — the figures
          above had no lever beside them and the warning threshold that
          decides when an owner hears about it was unreachable. */}
      <AssistantSettings />

      {handovers && handovers.byReason.length > 0 && (
        <>
          <h2 className="font-sans font-semibold text-section text-ink mt-12 mb-1">Why it stepped back</h2>
          <p className="text-sm text-ink-3 max-w-[60ch]">
            Last seven days, grouped. The useful question is what keeps happening, not
            what happened at 14:32.
          </p>
          <div className="border-t border-rule-strong mt-5">
            {handovers.byReason.map((r) => (
              <div key={r.reason} className="flex items-center gap-3.5 py-3 border-b border-rule">
                <span className="text-sm text-ink min-w-[180px]">
                  {r.reason.replace(/_/g, " ")}
                </span>
                <span className="flex-1 h-[5px] bg-sunk rounded-sm overflow-hidden">
                  <span
                    className="block h-full bg-ink"
                    // The list is sorted, so [0] is the largest — but it is
                    // still an index read, and dividing by zero would give
                    // a NaN width rather than a bar.
                    style={{ width: `${(r.count / Math.max(1, handovers.byReason[0]?.count ?? 1)) * 100}%` }}
                  />
                </span>
                <span className="font-mono text-note text-ink-3 min-w-[28px] text-end">{r.count}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Fig({ n, l, highlight }: { n: string; l: string; highlight?: boolean }) {
  return (
    <div className="px-5 py-4 border-e border-b border-rule last:border-e-0">
      <div className={`font-sans font-semibold text-title leading-none ${highlight ? "text-accent-deep" : "text-ink"}`}>{n}</div>
      <div className="t-label text-ink-3 mt-2">{l}</div>
    </div>
  );
}
