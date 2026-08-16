"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { Bars, Funnel } from "@/components/ui/chart";

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
        <span className="t-label text-ink-3 block mb-3">
          Response time
        </span>
        <h1 className="font-sans font-semibold text-page text-ink">
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
          <p className="text-control text-ink font-medium">Capture this week as your baseline</p>
          <p className="text-sm text-ink-2 mt-1.5 max-w-[48ch] leading-snug">
            Freezes the current numbers so the difference afterwards is measurable rather than
            a feeling. Do it before the assistant starts replying.
          </p>
          <div className="flex gap-2 mt-3 flex-wrap">
            <label htmlFor="blabel" className="sr-only">Label</label>
            <input id="blabel" value={label} onChange={(e) => setLabel(e.target.value)}
              className="flex-1 min-w-[180px] min-h-11 px-4 text-control text-ink bg-raised border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
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
      <h2 className="font-sans font-semibold text-body-lg text-ink mb-1">
        By hour of day
      </h2>
      <p className="text-sm text-ink-2 mb-4 max-w-[48ch]">
        Enquiries do not arrive evenly and neither do replies. The gap after six in the
        evening is usually the whole story.
      </p>
      {/**
        * The empty case is the point.
        *
        * This drew a 160px band and a row of hour labels whether or not
        * there was anything to plot, and on a brokerage with no messages
        * recorded that is what it drew: an axis under nothing. It read as
        * broken software rather than as "no replies yet", which is the
        * true and much less alarming statement.
        *
        * `Bars` will not render an axis it has no data for.
        */}
      <Bars
        bars={hours.map((h) => ({
          label: `${String(h.hour).padStart(2, "0")}:00`,
          value: h.medianMins,
          // Office hours are the quiet bars; the finding is the contrast
          // with everything outside them.
          muted: h.hour >= 9 && h.hour < 18,
        }))}
        format={fmt}
        empty="No replies recorded yet, so there is no shape to show. This fills in once the first enquiries have been answered."
      />

      <h2 className="font-sans font-semibold text-body-lg text-ink mt-12 mb-3">
        Where they come from
      </h2>
      {/* Counts in a column are compared by reading; a length is
          compared by looking. The reply time stays a number, because
          "which is slowest" is not a question about size. */}
      <Funnel
        rows={(byChannel?.channels ?? []).map((c) => ({
          label: c.label,
          value: c.count,
          note: fmt(c.medianMins),
        }))}
        empty="No enquiries have arrived through a connected channel yet."
      />
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
