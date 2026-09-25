"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/cn";
import { Button } from "@/components/ui/button";

/**
 * Commissions still in motion, and the buttons that move them.
 *
 * ## Why this exists
 *
 * Nothing in the product could move a commission past FORECAST or mark
 * an agent's share paid. Every figure on this page that depends on money
 * arriving — the headline, the months, who earned it — read zero for
 * every brokerage, and every agent's "owed to you" read zero with it.
 * The page was complete and could never show anything.
 *
 * The buttons appear only for somebody who may settle (`commission:settle`,
 * owners and admins). A sales manager sees the same list without them:
 * reading the book and moving money are different jobs.
 */
export function ToSettle() {
  const utils = api.useUtils();
  const { data } = api.commission.ledger.useQuery();
  const [error, setError] = useState<string | null>(null);
  const done = {
    onSuccess: () => {
      setError(null);
      void utils.commission.ledger.invalidate();
      void utils.commission.brokerage.invalidate();
    },
    onError: (e: { message: string }) => setError(e.message),
  };
  const setStatus = api.commission.setStatus.useMutation(done);
  const markPaid = api.commission.markPaid.useMutation(done);
  const busy = setStatus.isPending || markPaid.isPending;

  if (!data) return null;
  const { rows, canSettle } = data;

  return (
    <section className="mt-12" aria-labelledby="settle-heading">
      <h2 id="settle-heading" className="font-sans font-semibold text-section text-ink mb-1">To settle</h2>
      <p className="text-sm text-ink-3 max-w-[60ch]">
        {rows.length === 0
          ? "Nothing outstanding. A commission appears here when it is recorded against a deal, and leaves once it is received and everybody's share is paid."
          : canSettle
            ? "Mark a fee invoiced when you bill it and received when the money arrives. Each agent's share can be paid once it has."
            : "Where each fee has got to. Moving one along is for an owner or an admin."}
      </p>
      {error && <p role="alert" className="mt-3 text-sm text-danger">{error}</p>}

      <ul className="border-t border-rule-strong mt-5">
        {rows.map((c) => (
          <li key={c.id} className="border-b border-rule py-4">
            <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
              <span className="font-mono text-note text-ink-3 min-w-[110px]">{c.deal}</span>
              <span className="text-ui text-ink font-medium tabular">{c.gross}</span>
              <span className={cn("t-label", c.status === "RECEIVED" ? "text-ink-2" : "text-ink-3")}>
                {label(c.status, c.invoicedAt, c.receivedAt)}
              </span>
              {canSettle && (
                <span className="ms-auto flex flex-wrap gap-2">
                  {c.status !== "RECEIVED" && (
                    <Received disabled={busy} onConfirm={(at) => setStatus.mutate({ id: c.id, to: "RECEIVED", at })} />
                  )}
                  {c.status === "FORECAST" && (
                    <button type="button" className="btn-inline" disabled={busy}
                      onClick={() => setStatus.mutate({ id: c.id, to: "INVOICED" })}>
                      Mark invoiced
                    </button>
                  )}
                  {c.status !== "RECEIVED" && (
                    <button type="button" className="btn-inline text-ink-3" disabled={busy}
                      onClick={() => setStatus.mutate({ id: c.id, to: "WRITTEN_OFF" })}>
                      Write off
                    </button>
                  )}
                  {c.status === "RECEIVED" && c.splits.every((s) => !s.paidAt) && (
                    <button type="button" className="btn-inline text-ink-3" disabled={busy}
                      onClick={() => setStatus.mutate({ id: c.id, to: "INVOICED" })}>
                      Not received after all
                    </button>
                  )}
                </span>
              )}
            </div>

            {/* The shares, once the money is in — the only time paying
                one out is allowed. Before that they are a forecast of a
                forecast, and listing them invites somebody to pay early. */}
            {c.status === "RECEIVED" && (
              <ul className="mt-3 ps-[126px] max-[640px]:ps-0 grid gap-2">
                {c.splits.filter((s) => s.payable).map((s) => (
                  <li key={s.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="text-sm text-ink">{s.who}</span>
                    <span className="text-sm text-ink-2 tabular">{s.amount}</span>
                    {s.paidAt ? (
                      <span className="ms-auto t-label text-ink-3">
                        paid {new Date(s.paidAt).toLocaleDateString("en-GB")}{s.paidRef ? ` · ${s.paidRef}` : ""}
                      </span>
                    ) : canSettle ? (
                      <Pay disabled={busy} who={s.who} onConfirm={(reference) => markPaid.mutate({ splitId: s.id, reference })} />
                    ) : (
                      <span className="ms-auto t-label text-accent-type">owed</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

function label(status: string, invoicedAt: Date | null, receivedAt: Date | null) {
  const d = (x: Date | null) => (x ? ` ${new Date(x).toLocaleDateString("en-GB")}` : "");
  if (status === "INVOICED") return `invoiced${d(invoicedAt)}`;
  if (status === "RECEIVED") return `received${d(receivedAt)}`;
  if (status === "WRITTEN_OFF") return "written off";
  return "forecast";
}

/**
 * Received, with the date it arrived.
 *
 * The page above dates revenue "by when the money arrived rather than by
 * when somebody got round to recording it" — which is only true if the
 * person recording it can say when that was. Defaults to today.
 */
function Received({ disabled, onConfirm }: { disabled: boolean; onConfirm: (at: Date) => void }) {
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(() => new Date().toISOString().slice(0, 10));
  if (!open) {
    return (
      <button type="button" className="btn-inline" disabled={disabled} onClick={() => setOpen(true)}>
        Mark received
      </button>
    );
  }
  return (
    <span className="flex items-center gap-2">
      <label className="sr-only" htmlFor="received-on">Received on</label>
      <input id="received-on" type="date" value={day} max={new Date().toISOString().slice(0, 10)}
        onChange={(e) => setDay(e.target.value)}
        className="min-h-11 px-3 text-control text-ink bg-sunk border border-rule rounded-lg" />
      <Button variant="primary" disabled={disabled || !day}
        onClick={() => { onConfirm(new Date(`${day}T12:00:00`)); setOpen(false); }}>
        Received
      </Button>
      <button type="button" className="btn-inline text-ink-3" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}

/** Paid, with the transfer reference so the payment can be found again. */
function Pay({ disabled, who, onConfirm }: { disabled: boolean; who: string; onConfirm: (reference?: string) => void }) {
  const [open, setOpen] = useState(false);
  const [ref, setRef] = useState("");
  if (!open) {
    return (
      <button type="button" className="ms-auto btn-inline" disabled={disabled} onClick={() => setOpen(true)}>
        Mark paid
      </button>
    );
  }
  return (
    <span className="ms-auto flex items-center gap-2">
      <label className="sr-only" htmlFor={`ref-${who}`}>Transfer reference for {who}</label>
      <input id={`ref-${who}`} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="Transfer reference"
        maxLength={80}
        className="min-h-11 px-3 text-control text-ink bg-sunk border border-rule rounded-lg w-[180px]" />
      <Button variant="primary" disabled={disabled}
        onClick={() => { onConfirm(ref.trim() || undefined); setOpen(false); setRef(""); }}>
        Paid
      </Button>
      <button type="button" className="btn-inline text-ink-3" onClick={() => setOpen(false)}>Cancel</button>
    </span>
  );
}
