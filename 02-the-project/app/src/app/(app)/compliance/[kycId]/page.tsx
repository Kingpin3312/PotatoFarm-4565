"use client";

import { use, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";

/**
 * One screening, and the decision.
 *
 * The router is explicit that a decision **not** to file is still a
 * decision and still needs a reason — an inspector asks why you did not
 * report as often as why you did. So "no filing" is a first-class
 * button here, not a way of closing the screen.
 */
export default function Screening({ params }: { params: Promise<{ kycId: string }> }) {
  // Next 15 hands `params` to a page as a Promise. This component is
  // a client component, so `use()` is how it is unwrapped — reading
  // `kycId` straight off it yields undefined, and the query
  // below would have run against nothing.
  const { kycId } = use(params);
  const { data, isLoading, isError, refetch, error } =
    api.aml.screeningDetail.useQuery({ kycId: kycId });
  const file = api.aml.file.useMutation({ onSuccess: () => void refetch() });

  const [type, setType] = useState<"REAR"|"STR"|"SAR"|"CNMR"|"FFR"|"NO_FILING">("NO_FILING");
  const [rationale, setRationale] = useState("");
  const [notFiledReason, setNotFiled] = useState("");
  const [goamlRef, setRef] = useState("");

  if (isError) return <QueryError retry={() => void refetch()} what="this screening" error={error} />;
  if (isLoading) return <div className="max-w-[680px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;

  const latest = data?.[0];
  const noFiling = type === "NO_FILING";
  const ready = rationale.trim().length >= 10 && (!noFiling || notFiledReason.trim().length > 0);

  if (file.isSuccess) {
    return (
      <div className="max-w-[560px] mx-auto px-6 py-20">
        <h1 className="font-sans font-semibold text-[30px] text-ink -tracking-[0.026em]">
          Recorded.
        </h1>
        <p className="text-[17px] text-ink-2 mt-3 max-w-[44ch]">
          {noFiling
            ? "The decision not to file is on the record, with your name and the reason against it."
            : "Prepared. File it on goAML — we don't submit on your behalf."}
        </p>
        <a href="/compliance" className="btn-inline mt-6 inline-block">Back</a>
      </div>
    );
  }

  return (
    <div className="max-w-[680px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <a href="/compliance" className="font-mono text-[11px] uppercase tracking-[0.12em] text-ink-3 no-underline">
          ← Compliance
        </a>
        <h1 className="font-sans font-semibold text-[clamp(1.75rem,1.4rem+1.6vw,2.25rem)] text-ink -tracking-[0.026em] leading-tight mt-3">
          {latest?.result === "CONFIRMED_MATCH" ? "Confirmed match" : "Possible match"}
        </h1>
      </header>

      {latest?.guidance && (
        <div className="bg-sunk rounded-xl p-5 mb-8">
          <p className="text-[15px] text-ink leading-snug">{latest.guidance}</p>
        </div>
      )}

      <h2 className="font-sans font-semibold text-[17px] text-ink mb-3">Screening history</h2>
      <div className="border-t border-ink mb-10">
        {(data ?? []).map((s) => (
          <div key={s.id} className="flex items-baseline gap-3 py-3 border-b border-rule">
            <span className="font-mono text-[11px] text-ink-3">
              {new Date(s.screenedAt).toLocaleDateString("en-GB")}
            </span>
            <span className="text-[15px] text-ink">{s.lists[0] ?? "—"}</span>
            <span className="ml-auto font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
              {String(s.result).toLowerCase().replace(/_/g, " ")}
            </span>
          </div>
        ))}
      </div>

      <h2 className="font-sans font-semibold text-[17px] text-ink mb-3">Your decision</h2>
      <div className="flex gap-2 flex-wrap mb-5">
        {(["NO_FILING","STR","SAR","REAR","CNMR","FFR"] as const).map((t) => (
          <button key={t} onClick={() => setType(t)} aria-pressed={type === t}
            className={`min-h-11 px-4 rounded-lg border text-[15px] ${
              type === t ? "bg-accent text-on-accent border-accent-edge font-semibold"
                         : "border-rule text-ink"}`}>
            {t === "NO_FILING" ? "No filing" : t}
          </button>
        ))}
      </div>

      <Area label="Why" value={rationale} onChange={setRationale}
            hint="At least a sentence. This is the part an inspector reads." />

      {noFiling ? (
        <Area label="Why you are not filing" value={notFiledReason} onChange={setNotFiled}
              hint="A decision not to report is still a decision. Without a reason recorded against it, there is nothing to show." />
      ) : (
        <div className="mt-5">
          <label htmlFor="goaml" className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
            goAML reference (once filed)
          </label>
          <input id="goaml" value={goamlRef} onChange={(e) => setRef(e.target.value)}
                 className="w-full min-h-11 px-4 text-[16px] text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
          <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">
            Add it after you submit. We prepare the report; the filing is yours.
          </p>
        </div>
      )}

      {file.error && <p role="alert" className="text-sm text-danger mt-5">{file.error.message}</p>}

      <Button variant="primary" full className="mt-8" loading={file.isPending} disabled={!ready}
        onClick={() => file.mutate({
          type, kycId: kycId, rationale,
          notFiledReason: noFiling ? notFiledReason : undefined,
          goamlRef: goamlRef || undefined,
        })}>
        Record the decision
      </Button>

      <p className="text-sm text-ink-3 mt-5 max-w-[48ch] leading-snug">
        Your name and the time go on this permanently. The audit log cannot be edited or
        deleted — that is enforced at the database, not by policy.
      </p>
    </div>
  );
}

function Area({ label, value, onChange, hint }: {
  label: string; value: string; onChange: (v: string) => void; hint: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div className="mt-5">
      <label htmlFor={id} className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
        {label}
      </label>
      <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 text-[16px] text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
      <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">{hint}</p>
    </div>
  );
}
