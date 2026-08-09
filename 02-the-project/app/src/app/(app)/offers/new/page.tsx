"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Record an offer.
 *
 * The single most important form in the product, and it did not exist —
 * `offers.create` was mounted with nothing calling it. A twenty-two-year
 * agent put it plainly: everything before an offer is admin.
 */
export default function NewOffer({ searchParams }: { searchParams: { listing?: string } }) {
  const create = api.offers.create.useMutation();
  const [f, setF] = useState({
    listingId: searchParams.listing ?? "",
    amountAed: "",
    financing: "UNKNOWN" as "CASH" | "MORTGAGE" | "UNKNOWN",
    preApproved: false,
    sellerHasMortgage: false,
    conditions: "",
    expiresInDays: 3,
  });

  if (create.isSuccess) {
    return (
      <div className="max-w-[560px] mx-auto px-6 py-20">
        <h1 className="font-sans font-semibold text-[30px] text-ink -tracking-[0.026em]">
          Recorded.
        </h1>
        <p className="text-[17px] text-ink-2 mt-3 tabular">{create.data.amount} on the table.</p>
        {create.data.vendorMissing && (
          // Flagged, not blocked. An offer often arrives before the
          // paperwork, and refusing to record it sends the agent back to
          // a WhatsApp group.
          <p className="text-[15px] text-ink-2 mt-4 pl-3 border-l-2 border-l-accent-edge">
            This listing has no owner on file yet. Add one before you present the offer —
            the weekly report and the Form F both need them.
          </p>
        )}
        <a href="/offers" className="btn-inline mt-6 inline-block">Back to offers</a>
      </div>
    );
  }

  return (
    <div className="max-w-[560px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-ink -tracking-[0.026em] leading-none">
          Record an offer
        </h1>
      </header>

      <div className="space-y-5">
        <Field label="Amount in dirhams" value={f.amountAed} type="number" inputMode="decimal"
               onChange={(v) => setF({ ...f, amountAed: v })} />

        <div>
          <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
            How they're paying
          </span>
          <div className="flex gap-2 flex-wrap">
            {(["CASH", "MORTGAGE", "UNKNOWN"] as const).map((k) => (
              <button key={k} onClick={() => setF({ ...f, financing: k })}
                aria-pressed={f.financing === k}
                className={`min-h-11 px-4 rounded-lg border text-[15px] ${
                  f.financing === k
                    ? "bg-accent text-on-accent border-accent-edge font-semibold"
                    : "border-rule text-ink"}`}>
                {k === "UNKNOWN" ? "Not said" : k.toLowerCase()}
              </button>
            ))}
          </div>
        </div>

        {f.financing === "MORTGAGE" && (
          <Check label="Pre-approved" checked={f.preApproved}
                 hint="A pre-approval in principle is not a mortgage. The vendor is entitled to know which buyer can actually complete."
                 onChange={(v) => setF({ ...f, preApproved: v })} />
        )}

        {/* Asked here because this is when the agent finds out, and it
            decides whether the Form F completion date is achievable. */}
        <Check label="The seller has a mortgage on the property"
               checked={f.sellerHasMortgage}
               hint="A mortgaged buyer against a mortgaged seller is roughly 47 working days. A 30-day Form F is about 22."
               onChange={(v) => setF({ ...f, sellerHasMortgage: v })} />

        <Field label="Conditions" value={f.conditions} multiline
               placeholder="Subject to survey, subject to another sale, a fixed completion date…"
               onChange={(v) => setF({ ...f, conditions: v })} />

        <div>
          <Field label="Expires in (days)" value={String(f.expiresInDays)} type="number"
                 onChange={(v) => setF({ ...f, expiresInDays: Number(v) || 3 })} />
          <p className="text-sm text-ink-2 mt-1.5 max-w-[44ch] leading-snug">
            We'll mark it lapsed and tell you. Chasing an acceptance on an offer that ran out
            on Tuesday is a bad afternoon.
          </p>
        </div>
      </div>

      {create.error && (
        <p role="alert" className="text-sm text-danger mt-5">{create.error.message}</p>
      )}

      <Button variant="primary" full className="mt-8"
        loading={create.isPending}
        disabled={!f.listingId || !Number(f.amountAed)}
        onClick={() => create.mutate({
          listingId: f.listingId,
          amountAed: Number(f.amountAed),
          financing: f.financing,
          preApproved: f.preApproved,
          sellerHasMortgage: f.sellerHasMortgage,
          conditions: f.conditions || undefined,
          expiresInDays: f.expiresInDays,
        })}>
        Record it
      </Button>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", multiline, placeholder, inputMode }: {
  label: string; value: string; onChange: (v: string) => void;
  type?: string; multiline?: boolean; placeholder?: string; inputMode?: "decimal";
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  const cls = "w-full min-h-11 px-4 py-2.5 text-[16px] text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]";
  return (
    <div>
      <label htmlFor={id} className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
        {label}
      </label>
      {multiline
        ? <textarea id={id} value={value} rows={3} placeholder={placeholder}
                    onChange={(e) => onChange(e.target.value)} className={cls} />
        : <input id={id} type={type} inputMode={inputMode} value={value} placeholder={placeholder}
                 onChange={(e) => onChange(e.target.value)} className={cls} />}
    </div>
  );
}

function Check({ label, hint, checked, onChange }: {
  label: string; hint: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="flex items-start gap-3 min-h-11 cursor-pointer">
        <input id={id} type="checkbox" checked={checked}
               onChange={(e) => onChange(e.target.checked)}
               className="mt-1 w-5 h-5 accent-[var(--accent)]" />
        <span>
          <span className="text-[16px] text-ink">{label}</span>
          <span className="block text-sm text-ink-2 mt-0.5 max-w-[44ch] leading-snug">{hint}</span>
        </span>
      </label>
    </div>
  );
}
