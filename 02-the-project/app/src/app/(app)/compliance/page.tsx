"use client";

import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";

/**
 * The compliance officer's screen.
 *
 * Eight AML procedures existed with nothing calling them — the strongest
 * argument in the pitch was unreachable.
 *
 * Two rules from the router carry through to here and must not be
 * softened:
 *
 * 1. **An agent never sees a sanctions reason.** A possible match shows
 *    as a neutral hold. Telling an agent "possible terrorist financing
 *    match" is how somebody gets tipped off, which is itself an offence.
 *    That screen is `/inbox`, not this one.
 *
 * 2. **This page is gated on `compliance:read`.** It is for the MLRO,
 *    not the floor.
 */
export default function Compliance() {
  const { data, isLoading, isError, refetch } = api.aml.reports.useQuery();
  const { data: rear } = api.aml.checkRear.useQuery();

  if (isError) return <QueryError retry={() => void refetch()} what="the compliance file" />;
  if (isLoading) return <div className="max-w-[760px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;

  const pending = data?.pending ?? [];
  const due = data?.reviewsDue ?? [];

  return (
    <div className="max-w-[760px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          Compliance
        </span>
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-ink -tracking-[0.026em] leading-none">
          {pending.length === 0 && due.length === 0
            ? "Nothing waiting on you."
            : `${pending.length + due.length} need a decision.`}
        </h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[52ch]">
          Every brokerage concluding a sale is a DNFBP. Nothing here is auto-cleared — a
          possible match is a person's decision, and the record of who decided is the point.
        </p>
      </header>

      {/* The cash threshold. Surfaced first because it has a deadline
          attached and the others do not. */}
      {rear?.due?.length ? (
        <section className="bg-sunk rounded-xl p-5 border-l-[3px] border-l-accent-edge mb-8">
          <h2 className="text-[17px] text-ink font-semibold">
            {rear.due.length} cash transaction{rear.due.length === 1 ? "" : "s"} over the threshold
          </h2>
          <p className="text-sm text-ink-2 mt-1.5 max-w-[52ch] leading-snug">
            A REAR filing is due. We prepare it here; you file it on goAML — we do not submit
            on your behalf, and you should be wary of anyone who offers to.
          </p>
          <div className="mt-3 border-t border-rule">
            {rear.due.map((r) => (
              <div key={r.id} className="flex items-baseline gap-3 py-2.5 border-b border-rule">
                <span className="text-[15px] text-ink tabular">{r.amount}</span>
                <span className="text-sm text-ink-2">{r.reference}</span>
                <span className="ml-auto font-mono text-[11px] text-accent-type uppercase tracking-[0.1em]">
                  {r.daysLeft}d left
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <h2 className="font-sans font-semibold text-[19px] text-ink -tracking-[0.02em] mb-3">
        Waiting on a decision
      </h2>
      {pending.length === 0 ? (
        <p className="text-sm text-ink-2 border-t border-rule pt-4">
          Nothing held. Screenings that clear automatically never reach this list.
        </p>
      ) : (
        <div className="border-t border-ink">
          {pending.map((p) => (
            <a key={p.id} href={`/compliance/${p.id}`}
               className="block py-4 border-b border-rule no-underline">
              <div className="flex items-baseline gap-3">
                <span className="text-[16px] text-ink font-semibold">{p.name}</span>
                <span className={cn("font-mono text-[10px] uppercase tracking-[0.1em] px-2 py-0.5 rounded-[3px] border",
                  p.result === "CONFIRMED_MATCH"
                    ? "border-danger text-danger font-semibold"
                    : "border-accent-edge text-accent-type")}>
                  {p.result === "CONFIRMED_MATCH" ? "confirmed" : "possible match"}
                </span>
                <span className="ml-auto font-mono text-[11px] text-ink-3">{p.heldFor}</span>
              </div>
              <p className="text-sm text-ink-2 mt-1.5 max-w-[52ch] leading-snug">
                {p.listName} · matched on {p.matchedOn}
              </p>
            </a>
          ))}
        </div>
      )}

      <h2 className="font-sans font-semibold text-[19px] text-ink -tracking-[0.02em] mt-12 mb-3">
        Reviews due
      </h2>
      {due.length === 0 ? (
        <p className="text-sm text-ink-2 border-t border-rule pt-4">None this month.</p>
      ) : (
        <div className="border-t border-ink">
          {due.map((d) => (
            <div key={d.id} className="flex items-baseline gap-3 py-3.5 border-b border-rule">
              <span className="text-[15px] text-ink">{d.name}</span>
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                {d.rating.toLowerCase()} risk
              </span>
              <span className="ml-auto font-mono text-[11px] text-ink-3">{d.dueIn}</span>
            </div>
          ))}
        </div>
      )}

      <p className="text-sm text-ink-3 mt-10 max-w-[52ch] leading-snug">
        Due diligence records are retained for five years even where the transaction never
        completed. Erasure requests defer against a live KYC file rather than deleting it —
        the retention obligation outranks the request.
      </p>
    </div>
  );
}
