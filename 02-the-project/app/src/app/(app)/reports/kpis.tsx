"use client";

import { useState } from "react";
import Link from "next/link";
import { api } from "@/lib/trpc";
import { aedShort } from "@/lib/money";
import { sentence } from "@/lib/sentence";

/**
 * The figures a manager runs the floor on (the audit's C11), and the way
 * into the records behind each one.
 *
 * A figure nobody can open is a figure nobody trusts: "Bayut converts
 * at 3%" invites "which three?". Every row here links to the leads list
 * already filtered to it.
 */
const RANGES = [["30", "Last 30 days"], ["90", "Last 90 days"], ["365", "Last year"]] as const;

export function Kpis() {
  const [days, setDays] = useState<"30" | "90" | "365">("90");
  const [range] = useState(() => ({ to: new Date() }));
  const from = new Date(range.to.getTime() - Number(days) * 86_400_000);
  // Refused for an agent — these are the whole floor's numbers — and
  // then simply not shown, rather than an error on their reports page.
  const { data } = api.reports.kpis.useQuery({ from, to: range.to }, { retry: false });
  if (!data) return null;

  const pct = (x: number) => `${Math.round(x * 100)}%`;
  return (
    <section className="mt-12 border-t border-rule-strong pt-6" aria-labelledby="kpi-heading" data-kpis>
      <div className="flex items-baseline justify-between gap-4 flex-wrap">
        <h2 id="kpi-heading" className="font-sans font-semibold text-h3 text-ink">The business</h2>
        <label className="flex items-center gap-2">
          <span className="t-label text-ink-3">Over</span>
          <select value={days} onChange={(e) => setDays(e.target.value as typeof days)}
            className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink">
            {RANGES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </label>
      </div>

      <dl className="grid grid-cols-1 min-[640px]:grid-cols-3 gap-6 mt-5">
        <Figure label="Pipeline, weighted by stage" value={aedShort(data.pipeline.weightedFils)}
          note={`of ${aedShort(data.pipeline.unweightedFils)} in open budgets`} href="/leads" />
        <Figure label="Commission on its way" value={aedShort(data.commission.forecastFils + data.commission.invoicedFils)}
          note={`${aedShort(data.commission.invoicedFils)} invoiced, the rest forecast`} href="/deals" />
        <Figure label="Enquiry to completion" value={data.timeToClose.medianDays === null ? "—" : `${data.timeToClose.medianDays} days`}
          note={data.timeToClose.deals ? `median of ${data.timeToClose.deals} completed` : "no completions in this period"} href="/deals" />
      </dl>

      <div className="grid gap-8 min-[800px]:grid-cols-2 mt-8">
        <div>
          <h3 className="t-label text-ink-3 mb-2">Where the business comes from</h3>
          <table className="w-full text-sm tabular">
            <thead><tr className="text-ink-3 text-start"><th className="text-start font-normal py-1">Source</th><th className="text-end font-normal">Leads</th><th className="text-end font-normal">Won</th><th className="text-end font-normal">Rate</th></tr></thead>
            <tbody>
              {data.bySource.map((r) => (
                <tr key={r.source} className="border-t border-rule">
                  <td className="py-2"><Link href={`/leads?source=${r.source}`} className="text-ink">{sentence(r.source)}</Link></td>
                  <td className="text-end text-ink-2">{r.leads}</td>
                  <td className="text-end text-ink-2">{r.won}</td>
                  <td className="text-end text-ink">{pct(r.rate)}</td>
                </tr>
              ))}
              {data.bySource.length === 0 && <tr><td colSpan={4} className="py-2 text-ink-3">No new leads in this period.</td></tr>}
            </tbody>
          </table>
        </div>
        <div>
          <h3 className="t-label text-ink-3 mb-2">Gone quiet, by agent</h3>
          <ul>
            {data.coldByAgent.map((a) => (
              <li key={a.agentId} className="flex justify-between border-t border-rule py-2 text-sm">
                <Link href={`/leads?filter=cold&agentId=${a.agentId}`} className="text-ink">{a.name}</Link>
                <span className="text-ink-2 tabular">{a.leads}</span>
              </li>
            ))}
            {data.coldByAgent.length === 0 && <li className="text-sm text-ink-3 py-2">Nobody has a lead gone quiet.</li>}
          </ul>
          <p className="text-note text-ink-3 mt-3 max-w-[48ch]">
            Weights used for the pipeline: new 5%, qualifying 10%, qualified 20%, viewing booked 35%, negotiating 60%.
          </p>
        </div>
      </div>
    </section>
  );
}

function Figure({ label, value, note, href }: { label: string; value: string; note: string; href: string }) {
  return (
    <div>
      <dt className="t-label text-ink-3">{label}</dt>
      <dd className="font-sans font-semibold text-h2 text-ink tabular mt-1"><Link href={href} className="text-ink no-underline hover:underline">{value}</Link></dd>
      <p className="text-sm text-ink-3 mt-1">{note}</p>
    </div>
  );
}
