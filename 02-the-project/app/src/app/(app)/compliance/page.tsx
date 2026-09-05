"use client";

import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";
import { sentence } from "@/lib/sentence";

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
  const { data, isLoading, isError, refetch, error } = api.aml.reports.useQuery();
  const { data: rearData } = api.aml.reportable.useQuery();

  if (isError) return <QueryError retry={() => void refetch()} what="the compliance file" error={error} />;
  if (isLoading) return <div className="max-w-[760px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;

  const rear = rearData?.reportable ?? [];
  const examined = rearData?.dealsWithPayments ?? 0;
  const pending = data?.pending ?? [];
  const due = data?.reviewsDue ?? [];

  return (
    <div className="max-w-[760px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="t-label text-ink-3 block mb-3">
          Compliance
        </span>
        <h1 className="font-sans font-semibold text-page text-ink">
          {pending.length === 0 && due.length === 0
            ? "Nothing waiting on you."
            : `${pending.length + due.length} need a decision.`}
        </h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[52ch]">
          Every brokerage concluding a sale is a DNFBP. Nothing here is auto-cleared — a
          possible match is a person's decision, and the record of who decided is the point.
        </p>
      </header>

      {/*
        The cash-threshold section that stood here was removed once, and
        this is what brought it back.

        The removal note was right: it read from `aml.checkRear`, which is
        a pure calculation over an array of payments, and there was no
        payments model — so nothing could supply the array and the panel
        could only ever have rendered from data that did not exist. It
        named the precondition, "reinstating it needs the payment record
        first", and `DealPayment` is now that record.

        The note's other argument is the one this panel is built around:
        a compliance officer seeing an empty REAR list would reasonably
        conclude there were no reportable transactions, and this is the
        one screen in the product where absence of an alert must not be
        mistaken for an all-clear. So an empty list is never printed on
        its own — it always carries how many transactions were examined
        to reach it. "None of 4 reportable" and "no payments recorded
        anywhere" are very different facts about a brokerage.
      */}
      <h2 className="font-sans font-semibold text-body-lg text-ink mb-3">
        Reportable transactions
      </h2>
      {rear.length > 0 ? (
        <div className="border-t border-ink mb-8">
          {rear.map((r) => (
            <a key={r.dealId} href="/deals"
               className="block border-b border-rule py-3 no-underline">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <span className="font-mono text-label text-ink-3">{r.reference}</span>
                <span className="text-ui text-ink">{r.counterparty ?? "—"}</span>
                <span className="ms-auto t-label text-accent-deep">REAR due</span>
              </div>
              <p className="mt-1 max-w-[56ch] text-note leading-snug text-ink-2">
                {r.rear.reason}
              </p>
            </a>
          ))}
        </div>
      ) : (
        <p className="mb-8 max-w-[52ch] border-t border-rule pt-4 text-sm leading-snug text-ink-2">
          {examined === 0
            ? "No payments have been recorded against any transaction, so nothing has been assessed. This is not an all-clear."
            : `Nothing reportable. ${examined} transaction${examined === 1 ? "" : "s"} with payments recorded ${examined === 1 ? "has" : "have"} been assessed against the AED 55,000 cash threshold.`}
        </p>
      )}

      <h2 className="font-sans font-semibold text-body-lg text-ink mb-3">
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
                <span className="text-control text-ink font-medium">{p.name}</span>
                {/*
                  * Three states, not two. `ERROR` means nothing was
                  * checked — the provider failed or none is configured —
                  * and rendering it as "possible match" would tell a
                  * compliance officer a list came back with a hit when no
                  * list was ever consulted. That is a worse lie than the
                  * empty queue it replaced.
                  */}
                <span className={cn("t-label px-2 py-0.5 rounded-[3px] border",
                  p.result === "CONFIRMED_MATCH"
                    ? "border-danger text-danger font-semibold"
                    : p.result === "ERROR"
                      ? "border-danger text-danger"
                      : "border-accent-edge text-accent-deep")}>
                  {p.result === "CONFIRMED_MATCH" ? "confirmed"
                    : p.result === "ERROR" ? "not checked"
                    : "possible match"}
                </span>
                <span className="ms-auto font-mono text-label text-ink-3">{p.heldFor}</span>
              </div>
              <p className="text-sm text-ink-2 mt-1.5 max-w-[52ch] leading-snug">
                {p.result === "ERROR"
                  ? "No sanctions or PEP list was consulted. This file is unscreened."
                  : `${p.listName} · matched on ${p.matchedOn}`}
              </p>
            </a>
          ))}
        </div>
      )}

      <h2 className="font-sans font-semibold text-body-lg text-ink mt-12 mb-3">
        Reviews due
      </h2>
      {due.length === 0 ? (
        <p className="text-sm text-ink-2 border-t border-rule pt-4">None this month.</p>
      ) : (
        <div className="border-t border-ink">
          {due.map((d) => (
            <div key={d.id} className="flex items-baseline gap-3 py-3.5 border-b border-rule">
              <span className="text-ui text-ink">{d.name}</span>
              <span className="t-label text-ink-3">
                {sentence(d.rating)} risk
              </span>
              <span className="ms-auto font-mono text-label text-ink-3">{d.dueIn}</span>
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
