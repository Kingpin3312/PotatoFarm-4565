"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { aedWhole } from "@/lib/money";
import { Button } from "@/components/ui/button";

/**
 * What the client has paid, and whether that makes it reportable.
 *
 * ## The sentence this panel exists to print
 *
 * A UAE brokerage owes the FIU a **Real Estate Activity Report** when a
 * deal settles with AED 55,000 or more in physical cash — one payment or
 * several linked across ninety days — or with any virtual asset at any
 * amount. `assessRear()` has known that since it was written and had no
 * way to be asked: nothing recorded a payment, so nothing could be
 * assessed, and the product held the rule in silence.
 *
 * The linked case is the one worth building a screen for. Three payments
 * of twenty thousand across a week are linked and they trigger it, and
 * nobody adding them up in their head reliably notices. A single figure
 * on a screen does.
 *
 * ## Why an agent is shown this at all
 *
 * `TIPPING_OFF_RULES` says an agent must not see *why* a file is with
 * compliance, and that rule is about suspicion. A REAR is not a
 * suspicion report — it is a threshold in published law, and the agent
 * is the person who has to collect the cheque number and the date. They
 * cannot be kept from the fact and expected to record the facts.
 *
 * What they must not do is discuss it with the client, so the panel says
 * that, in the same words the compliance hold uses.
 */
export function Payments({ dealId }: { dealId: string }) {
  const utils = api.useUtils();
  const { data, isLoading } = api.deals.payments.useQuery({ dealId });
  const [adding, setAdding] = useState(false);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<"CASH" | "TRANSFER" | "CHEQUE" | "VIRTUAL_ASSET">("CASH");
  const [when, setWhen] = useState(() => new Date().toISOString().slice(0, 10));
  const [reference, setReference] = useState("");

  const record = api.deals.recordPayment.useMutation({
    onSuccess: () => {
      setAdding(false); setAmount(""); setReference("");
      void utils.deals.payments.invalidate({ dealId });
    },
  });

  if (isLoading || !data) return null;

  const rear = data.rear;

  return (
    <section className="mt-6 border-t border-rule pt-5">
      <h3 className="t-label text-ink-3 mb-3">Money received</h3>

      {/**
       * The verdict first, and only when there is one.
       *
       * A panel that prints "no report required" on every deal trains
       * people to stop reading it, and the day it changes is the day
       * nobody notices. Silence is the normal state.
       */}
      {rear.required && (
        <div className="mb-4 rounded-md border border-[color:var(--accent-edge)] bg-accent-soft p-4 max-w-[54ch]">
          <p className="text-ui font-semibold text-ink">
            This transaction requires a Real Estate Activity Report.
          </p>
          <p className="mt-1.5 text-note leading-snug text-ink-2">{rear.reason}</p>
          <p className="mt-2.5 text-note leading-snug text-ink-2">
            Your compliance officer files it. Carry on as normal and do not mention it
            to the client.
          </p>
        </div>
      )}

      {data.payments.length === 0 ? (
        <p className="max-w-[48ch] text-sm leading-snug text-ink-2">
          Nothing recorded. Cash at or above AED 55,000 — in one payment or several
          across ninety days — has to be reported, and it is the several that gets
          missed.
        </p>
      ) : (
        <>
          <div className="border-t border-rule">
            {data.payments.map((p) => (
              <div key={p.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-rule py-2.5">
                <span className="min-w-[6.5rem] font-mono text-label tabular text-ink">
                  {aedWhole(p.amountFils)}
                </span>
                <span className="t-label text-ink-3">{LABEL[p.method]}</span>
                <span className="font-mono text-label text-ink-3">
                  {new Date(p.receivedAt).toLocaleDateString("en-GB")}
                </span>
                {p.reference && (
                  <span className="font-mono text-label text-ink-3">{p.reference}</span>
                )}
              </div>
            ))}
          </div>
          <p className="mt-2.5 font-mono text-label tabular text-ink-3">
            {aedWhole(data.totalFils)} recorded
          </p>
        </>
      )}

      {!adding ? (
        <div className="mt-4">
          <Button variant="secondary" onClick={() => setAdding(true)}>Record a payment</Button>
        </div>
      ) : (
        <form
          className="mt-4 max-w-[52ch] rounded-lg border border-rule bg-sunk p-4"
          onSubmit={(e) => {
            e.preventDefault();
            const fils = Math.round(parseFloat(amount || "0") * 100);
            if (!Number.isFinite(fils) || fils <= 0) return;
            record.mutate({
              dealId,
              amountFils: fils,
              method,
              // Midday, so a date typed in Dubai is not yesterday in UTC.
              receivedAt: new Date(`${when}T12:00:00Z`).toISOString(),
              reference: reference.trim() || undefined,
            });
          }}
        >
          <div className="flex flex-wrap gap-3">
            <label className="flex-1 min-w-[9rem]">
              <span className="t-label text-ink-3 mb-1 block">Amount in AED</span>
              <input
                required inputMode="decimal" value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="min-h-11 w-full rounded-md border border-rule bg-raised px-3 text-control text-ink"
              />
            </label>
            <label className="flex-1 min-w-[9rem]">
              <span className="t-label text-ink-3 mb-1 block">How it was paid</span>
              <select
                value={method}
                onChange={(e) => setMethod(e.target.value as typeof method)}
                className="min-h-11 w-full rounded-md border border-rule bg-raised px-3 text-control text-ink"
              >
                <option value="CASH">Cash</option>
                <option value="TRANSFER">Bank transfer</option>
                <option value="CHEQUE">Cheque</option>
                <option value="VIRTUAL_ASSET">Virtual asset</option>
              </select>
            </label>
          </div>
          <div className="mt-3 flex flex-wrap gap-3">
            <label className="flex-1 min-w-[9rem]">
              <span className="t-label text-ink-3 mb-1 block">Date the client paid</span>
              <input
                required type="date" value={when} max={new Date().toISOString().slice(0, 10)}
                onChange={(e) => setWhen(e.target.value)}
                className="min-h-11 w-full rounded-md border border-rule bg-raised px-3 text-control text-ink"
              />
            </label>
            <label className="flex-1 min-w-[9rem]">
              <span className="t-label text-ink-3 mb-1 block">Reference</span>
              <input
                value={reference} onChange={(e) => setReference(e.target.value)}
                placeholder="Cheque or receipt number"
                className="min-h-11 w-full rounded-md border border-rule bg-raised px-3 text-control text-ink"
              />
            </label>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="primary" type="submit" loading={record.isPending}>Record it</Button>
            <Button variant="secondary" type="button" onClick={() => setAdding(false)}>Cancel</Button>
          </div>
          {record.error && (
            <p role="alert" className="mt-3 text-sm text-danger">{record.error.message}</p>
          )}
        </form>
      )}
    </section>
  );
}

const LABEL: Record<string, string> = {
  CASH: "Cash",
  TRANSFER: "Bank transfer",
  CHEQUE: "Cheque",
  VIRTUAL_ASSET: "Virtual asset",
};
