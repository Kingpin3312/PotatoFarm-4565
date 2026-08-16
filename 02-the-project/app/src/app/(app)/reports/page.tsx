"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";

/**
 * The baseline, and the proof.
 *
 * This is the screen the whole pilot rests on. The website promises we
 * measure your response times for a week before switching anything on —
 * and the procedures to do that existed with nothing calling them.
 *
 * Two figures side by side, and the hour-by-hour chart underneath. Most
 * brokerages have never seen that chart for their own business, and it
 * is usually the moment the conversation stops being about software.
 */
export default function Reports() {
  const { data, isLoading, isError, refetch, error } = api.reports.responseTime.useQuery();
  const { data: byHour } = api.reports.responseByHour.useQuery();
  const { data: byChannel } = api.reports.byChannel.useQuery();
  const capture = api.reports.captureBaseline.useMutation({ onSuccess: () => void refetch() });
  const [label, setLabel] = useState("Baseline week");

  if (isError) return <QueryError retry={() => void refetch()} what="your numbers" error={error} />;
  if (isLoading) return <div className="max-w-[760px] mx-auto px-6 pt-10"><div className="h-72 bg-sunk rounded-sm" aria-busy /></div>;

  const hours = byHour?.hours ?? [];
  const worst = hours.length ? Math.max(...hours.map((h) => h.medianMins)) : 1;

  return (
    <div className="max-w-[760px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          Response time
        </span>
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-ink -tracking-[0.026em] leading-none">
          {data?.baseline
            ? `${fmt(data.baseline.medianMins)} → ${fmt(data.current.medianMins)}`
            : fmt(data?.current.medianMins ?? 0)}
        </h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[50ch]">
          {data?.baseline
            ? `Median first reply, before and after. Measured on your own enquiries — ${data.current.count.toLocaleString()} of them.`
            : "Median first reply. Capture a baseline before switching the assistant on, or there is nothing to compare against."}
        </p>
      </header>

      {!data?.baseline && (
        <div className="bg-sunk rounded-xl p-5 border-l-[3px] border-l-accent-edge mb-10">
          <p className="text-[16px] text-ink font-semibold">Capture this week as your baseline</p>
          <p className="text-sm text-ink-2 mt-1.5 max-w-[48ch] leading-snug">
            Freezes the current numbers so the difference afterwards is measurable rather than
            a feeling. Do it before the assistant starts replying.
          </p>
          <div className="flex gap-2 mt-3 flex-wrap">
            <label htmlFor="blabel" className="sr-only">Label</label>
            <input id="blabel" value={label} onChange={(e) => setLabel(e.target.value)}
              className="flex-1 min-w-[180px] min-h-11 px-4 text-[16px] text-ink bg-raised border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
            <Button variant="primary" loading={capture.isPending}
              onClick={() => {
                const to = new Date();
                const from = new Date(to.getTime() - 7 * 86_400_000);
                capture.mutate({ label, from, to });
              }}>
              Capture
            </Button>
          </div>
        </div>
      )}

      {/* Hour by hour. The point of this chart is the shape after six in
          the evening, which is where most brokerages discover their
          problem. */}
      <h2 className="font-sans font-semibold text-[19px] text-accent-deep -tracking-[0.02em] mb-1">
        By hour of day
      </h2>
      <p className="text-sm text-ink-2 mb-4 max-w-[48ch]">
        Enquiries do not arrive evenly and neither do replies. The gap after six in the
        evening is usually the whole story.
      </p>
      <div className="flex items-end gap-[3px] h-40 border-b border-ink" role="img"
           aria-label={`Median reply time by hour. Slowest ${fmt(worst)} at ${
             hours.find((h) => h.medianMins === worst)?.hour ?? 0}:00`}>
        {hours.map((h) => (
          <div key={h.hour} className="flex-1 flex flex-col justify-end items-center h-full">
            <span className="w-full rounded-t-sm"
              style={{
                height: `${Math.max(2, (h.medianMins / worst) * 100)}%`,
                // Out-of-hours carries the accent. Inside office hours is
                // neutral — the contrast between them is the finding.
                background: h.hour < 9 || h.hour >= 18
                  ? "var(--accent)" : "var(--panel)",
                boxShadow: h.hour < 9 || h.hour >= 18
                  ? "inset 0 0 0 1px var(--accent-edge)" : "inset 0 0 0 1px var(--rule)",
              }} />
          </div>
        ))}
      </div>
      <div className="flex justify-between mt-2">
        {[0, 6, 12, 18, 23].map((h) => (
          <span key={h} className="font-mono text-[10px] text-ink-3 tabular">
            {String(h).padStart(2, "0")}:00
          </span>
        ))}
      </div>

      <h2 className="font-sans font-semibold text-[19px] text-accent-deep -tracking-[0.02em] mt-12 mb-3">
        Where they come from
      </h2>
      <div className="border-t border-ink">
        {(byChannel?.channels ?? []).map((c) => (
          <div key={c.label} className="flex items-baseline gap-3 py-3.5 border-b border-rule">
            <span className="text-[15px] text-ink">{c.label}</span>
            <span className="ml-auto text-[15px] text-ink font-semibold tabular">
              {c.count.toLocaleString()}
            </span>
            <span className="font-mono text-[11px] text-ink-3 tabular w-16 text-right">
              {fmt(c.medianMins)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/** Minutes into something a person says out loud. */
function fmt(m: number): string {
  if (m < 1) return "under a minute";
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${Math.round(h / 24)}d`;
}
