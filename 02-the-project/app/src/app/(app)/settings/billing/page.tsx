"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";

/**
 * Billing.
 *
 * The entire billing engine existed server-side — seats, allowance,
 * overage, invoices, card collection, dunning — and **no screen called
 * any of it.** A trial converts when a card is attached and there was
 * nowhere to attach one.
 *
 * That is the same shape as the four unwired modules before it, one
 * level up: not a module nothing imports, but a router nothing renders.
 */
export default function Billing() {
  const { data, isLoading, isError, refetch, error } = api.billing.status.useQuery();
  const { data: invoices } = api.billing.invoices.useQuery();
  const addCard = api.billing.addCard.useMutation();
  const [adding, setAdding] = useState(false);

  if (isError) return <QueryError retry={() => void refetch()} what="your billing" error={error} />;
  if (isLoading) return <Skeleton />;
  if (!data?.subscribed) {
    return (
      <div className="max-w-[680px] mx-auto px-6 pt-12">
        <p className="text-[17px] text-ink">No subscription on this brokerage.</p>
        <p className="text-sm text-ink-2 mt-2">Email hello@potatofarm.io and we&rsquo;ll sort it.</p>
      </div>
    );
  }

  const b = data.breakdown;
  const overAllowance = b.answered > b.included;

  return (
    <div className="max-w-[680px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          This month so far
        </span>
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-accent-type -tracking-[0.026em] leading-none tabular">
          {data.runningTotal.usd}
        </h1>
        <p className="text-sm text-ink-2 mt-2 tabular">
          {data.runningTotal.aed} — what the invoice will say, plus 5% VAT
        </p>
      </header>

      {/* The split. A single number is right and unexplained; two lines
          answer "why has it gone up" before anybody rings to ask. */}
      <div className="border-t border-ink">
        <Row k={`${data.seats} agents`} v={b.seats.usd} />
        <Row
          k={`${b.answered.toLocaleString()} conversations answered`}
          sub={`${b.included.toLocaleString()} included`}
          v={overAllowance ? b.overage.usd : "included"}
          quiet={!overAllowance}
        />
      </div>

      {/* Warned at 80%, not at 100%. Eighty is enough to do something
          about; a hundred is a notification about a decision already
          made for them. */}
      {b.usedPct >= 80 && (
        <div className={cn(
          "mt-5 rounded-xl p-4 border-l-[3px]",
          overAllowance ? "bg-sunk border-l-accent" : "bg-sunk border-l-warning"
        )}>
          <p className="text-[15px] text-ink font-semibold">
            {overAllowance
              ? `You're ${(b.answered - b.included).toLocaleString()} conversations past the allowance.`
              : `${b.usedPct}% of this month's allowance used.`}
          </p>
          <p className="text-sm text-ink-2 mt-1">
            {overAllowance
              ? `The extra is on this month's invoice at the rate in your plan. Nothing stops working.`
              : `Nothing stops at 100% — you'd just start paying per conversation beyond it.`}
          </p>
        </div>
      )}

      <h2 className="font-sans font-semibold text-[19px] text-accent-type -tracking-[0.02em] mt-12 mb-3">
        Payment
      </h2>

      {data.card.hasCard ? (
        <div className="flex items-baseline gap-3 py-3 border-t border-rule">
          <span className="text-[15px] text-ink capitalize">
            {data.card.brand ?? "Card"} ending {data.card.last4 ?? "••••"}
          </span>
          <span className="ml-auto font-mono text-[11px] text-ink-3 uppercase tracking-[0.1em]">
            expires {data.card.expires ?? "—"}
          </span>
        </div>
      ) : (
        <div className="border-t border-rule pt-4">
          <p className="text-[15px] text-ink">
            {data.status === "TRIALING"
              ? `No card yet. Your trial runs to ${fmt(data.trialEndsAt)} — add one before then and nothing interrupts.`
              : "No card on file."}
          </p>
          {/* The honest bit, said before they click rather than after. */}
          <p className="text-sm text-ink-2 mt-1.5">
            We never see the card. It goes straight to our payment provider and we store a
            reference, which is what keeps us out of scope for card-handling rules.
          </p>
          <Button
            variant="primary"
            className="mt-4"
            loading={addCard.isPending || adding}
            onClick={() => {
              setAdding(true);
              addCard.mutate(undefined, {
                onSuccess: (r) => mountCardForm(r.clientSecret),
                onError: () => setAdding(false),
              });
            }}
          >
            Add a card
          </Button>
          {addCard.error && (
            <p role="alert" className="text-sm text-danger-deep mt-3">
              {addCard.error.message} — or email hello@potatofarm.io and we&rsquo;ll take it
              over the phone.
            </p>
          )}
        </div>
      )}

      <h2 className="font-sans font-semibold text-[19px] text-accent-type -tracking-[0.02em] mt-12 mb-3">
        Invoices
      </h2>
      {!invoices?.length ? (
        <p className="text-sm text-ink-2 border-t border-rule pt-4">
          Nothing yet. Your first invoice arrives at the end of the first paid month.
        </p>
      ) : (
        <div className="border-t border-ink">
          {invoices.map((i) => (
            <details key={i.number} className="border-b border-rule">
              <summary className="flex items-baseline gap-3 py-3.5 cursor-pointer min-h-11">
                <span className="font-mono text-[13px] text-ink-3">{i.number}</span>
                <span className="text-sm text-ink-2">{i.period}</span>
                <span className="ml-auto text-[15px] text-ink font-semibold tabular">{i.total}</span>
                <span className={cn(
                  "font-mono text-[10px] uppercase tracking-[0.1em]",
                  i.status === "PAID" ? "text-success" : "text-ink-3"
                )}>{i.status.toLowerCase()}</span>
              </summary>
              {/* The arithmetic, not just the total. A bill you cannot
                  check is a bill you argue about. */}
              <ol className="pb-4 space-y-1">
                {i.lines.map((l, n) => (
                  <li key={n} className="text-sm text-ink-2 pl-4">{l}</li>
                ))}
              </ol>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function Row({ k, sub, v, quiet }: { k: string; sub?: string; v: string; quiet?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 py-3.5 border-b border-rule">
      <div>
        <span className="text-[15px] text-ink">{k}</span>
        {sub && <span className="block text-[13px] text-ink-3">{sub}</span>}
      </div>
      <span className={cn("ml-auto text-[15px] tabular",
        quiet ? "text-ink-3" : "text-ink font-semibold")}>{v}</span>
    </div>
  );
}

const fmt = (d: Date | string | null) =>
  d ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long" }).format(new Date(d)) : "—";

/**
 * Mounts the provider's own card form.
 *
 * Deliberately their iframe and not our fields — no card number, no CVV,
 * no truncated PAN ever reaches this application. That is the whole
 * reason the security page can say what it says.
 */
function mountCardForm(clientSecret: string) {
  window.dispatchEvent(new CustomEvent("card-setup", { detail: { clientSecret } }));
}

function Skeleton() {
  return (
    <div className="max-w-[680px] mx-auto px-6 pt-10" aria-busy>
      <span className="sr-only">Loading your billing</span>
      <div className="h-12 w-48 bg-sunk rounded-sm" />
      <div className="mt-8 space-y-px">
        {[...Array(3)].map((_, i) => <div key={i} className="h-14 bg-sunk rounded-sm" />)}
      </div>
    </div>
  );
}
