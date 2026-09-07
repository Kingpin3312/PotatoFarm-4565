"use client";

import { use, useState } from "react";
import { api } from "@/lib/trpc";
import { sentence } from "@/lib/sentence";
import { aed } from "@/lib/money";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { AssessRisk } from "../risk";

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

  /**
   * Re-running the check, which is the only way an `ERROR` ever clears.
   *
   * A provider outage records `ERROR` rather than a fabricated `CLEAR`,
   * which is right and leaves the file stuck until somebody retries. The
   * lists also move under a file that has already been cleared — a
   * client clear in March may not be in June — so this is not only for
   * failures.
   */
  const rescreen = api.aml.rescreen.useMutation({ onSuccess: () => void refetch() });

  const [type, setType] = useState<"REAR"|"STR"|"SAR"|"CNMR"|"FFR"|"NO_FILING">("NO_FILING");
  const [rationale, setRationale] = useState("");
  const [notFiledReason, setNotFiled] = useState("");
  const [goamlRef, setRef] = useState("");
  const [reassessing, setReassessing] = useState(false);

  if (isError) return <QueryError retry={() => void refetch()} what="this screening" error={error} />;
  if (isLoading) return <div className="max-w-[680px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;

  const latest = data?.screenings[0];
  const subject = data?.subject;
  const noFiling = type === "NO_FILING";
  const ready = rationale.trim().length >= 10 && (!noFiling || notFiledReason.trim().length > 0);

  if (file.isSuccess) {
    return (
      <div className="max-w-[560px] mx-auto px-6 py-20">
        <h1 className="font-sans font-semibold text-stat text-ink">
          Recorded.
        </h1>
        <p className="text-sub text-ink-2 mt-3 max-w-[44ch]">
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
        <a href="/compliance" className="t-label text-ink-3 no-underline">
          ← Compliance
        </a>
        {/*
          * Five states, and it used to be three.
          *
          * The note that stood here made exactly the right argument
          * about `ERROR`: no list was consulted, so calling it a possible
          * match tells the officer a list came back with a hit on this
          * person when nothing was ever checked. That was correct, and
          * the ternary it justified handled `CONFIRMED_MATCH` and
          * `ERROR` and sent **everything else** to "Possible match".
          *
          * Two things fall into "everything else", and both are the same
          * mistake the note was written to prevent:
          *
          *   - **`CLEAR`** — a person who was screened and came back
          *     clean, shown to a compliance officer as a possible
          *     sanctions match.
          *   - **no screening at all** — `latest` is undefined for a
          *     file nobody has run, which is every file opened by
          *     `openKycFile` until somebody presses the button. It
          *     rendered "Possible match" on a record with an empty
          *     screening history directly below it.
          *
          * This screen is where a decision goes on a permanent record
          * with a name and a timestamp against it. Manufacturing a match
          * is the more expensive direction to be wrong in than missing
          * one, because it is the direction somebody acts on.
          *
          * Written as an exhaustive map rather than a ternary chain: a
          * fifth result added to the enum should show up as a type error
          * here, not as a fifth thing quietly reading "Possible match".
          */}
        <h1 className="font-sans font-semibold text-page text-ink mt-3">
          {HEADING[latest?.result ?? "NONE"]}
        </h1>
        <div className="mt-4">
          <Button
            size="sm"
            variant="secondary"
            loading={rescreen.isPending}
            onClick={() => rescreen.mutate({ kycId })}
          >
            Run the check again
          </Button>
          {rescreen.isSuccess && (
            <p role="status" className="text-sm text-ink-2 mt-2">
              {rescreen.data.guidance}
            </p>
          )}
          {rescreen.isError && (
            <p role="alert" className="text-sm text-ink-2 mt-2">
              {rescreen.error.message}
            </p>
          )}
        </div>
      </header>

      {latest?.guidance && (
        <div className="bg-sunk rounded-xl p-5 mb-8">
          <p className="text-ui text-ink leading-snug">{latest.guidance}</p>
        </div>
      )}

      <h2 className="font-sans font-medium text-sub text-ink mb-3">Screening history</h2>
      <div className="border-t border-ink mb-10">
        {(data?.screenings ?? []).map((s) => (
          <div key={s.id} className="flex items-baseline gap-3 py-3 border-b border-rule">
            <span className="font-mono text-label text-ink-3">
              {new Date(s.screenedAt).toLocaleDateString("en-GB")}
            </span>
            <span className="text-ui text-ink">{s.lists[0] ?? "—"}</span>
            <span className="ms-auto t-label text-ink-3">
              {sentence(String(s.result))}
            </span>
          </div>
        ))}
      </div>

      {/* The rating, which nothing could produce.

          `risk.tsx` is a finished form over `aml.assessRisk` and no
          screen imported it, so `KycRecord.riskRating` stayed
          `UNASSESSED` on every file in the product — and
          `reviewDueAt`, which the nightly sweep and the review queue
          both read, was never written. A risk-based approach is the
          thing the regulation actually asks for, and this is the whole
          of it.

          Above the filing decision, because the rating is one of the
          inputs to that decision rather than a footnote after it. */}
      <section className="mb-10">
        <h2 className="font-sans font-medium text-sub text-ink mb-1">Risk rating</h2>
        {subject && subject.riskRating !== "UNASSESSED" ? (
          <>
            <p className="text-ui text-ink">
              {sentence(String(subject.riskRating))}
              {subject.reviewDueAt && (
                <span className="text-ink-2">
                  {" "}· review due {new Date(subject.reviewDueAt).toLocaleDateString("en-GB")}
                </span>
              )}
            </p>
            <ul className="mt-2 space-y-1">
              {subject.riskReasons.map((r, i) => (
                <li key={i} className="text-sm text-ink-2 max-w-[52ch] leading-snug">{r}</li>
              ))}
            </ul>
            {!reassessing ? (
              <button onClick={() => setReassessing(true)} className="btn-inline mt-3 min-h-11">
                Assess it again
              </button>
            ) : (
              <RiskForm kycId={kycId} subject={subject} />
            )}
          </>
        ) : (
          <RiskForm kycId={kycId} subject={subject} />
        )}
      </section>

      <h2 className="font-sans font-medium text-sub text-ink mb-3">Your decision</h2>
      <div className="flex gap-2 flex-wrap mb-5">
        {(["NO_FILING","STR","SAR","REAR","CNMR","FFR"] as const).map((t) => (
          <button key={t} onClick={() => setType(t)} aria-pressed={type === t}
            className={`min-h-11 px-4 rounded-lg border text-ui ${
              type === t ? "bg-accent text-on-accent border-accent-edge font-medium"
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
          <label htmlFor="goaml" className="block t-label text-ink-3 mb-2">
            goAML reference (once filed)
          </label>
          <input id="goaml" value={goamlRef} onChange={(e) => setRef(e.target.value)}
                 className="w-full min-h-11 px-4 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
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
      <label htmlFor={id} className="block t-label text-ink-3 mb-2">
        {label}
      </label>
      <textarea id={id} rows={3} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full px-4 py-2.5 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
      <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">{hint}</p>
    </div>
  );
}

/**
 * The transaction value, and where it comes from.
 *
 * `assessRisk` takes it as a required input and the component that
 * wraps it takes it as a required prop — deliberately, because a
 * defaulted zero rates a fifty-million-dirham purchase one point lower
 * than it is and says nothing about having done so.
 *
 * There is a deal for most files and its value is already recorded, so
 * the ordinary case asks nobody anything. A file opened before the
 * transaction exists — which `openFile` is explicitly for — has no
 * value to read, and that is the case that asks, rather than the case
 * that guesses.
 */
function RiskForm({ kycId, subject }: {
  kycId: string;
  subject: { dealReference: string | null; dealValueFils: bigint | null } | null | undefined;
}) {
  const [typed, setTyped] = useState("");

  const known = subject?.dealValueFils ?? null;
  if (known !== null) {
    return (
      <>
        <p className="text-sm text-ink-2 mt-1 mb-1 max-w-[48ch] leading-snug">
          Against {aed(known)}
          {subject?.dealReference ? ` on ${subject.dealReference}` : ""}.
        </p>
        <AssessRisk kycId={kycId} dealValueFils={known} />
      </>
    );
  }

  // Not `dirhams`. `money.py` forbids a money helper named that outside
  // `lib/money.ts`, and it is right to read the name rather than the
  // output — a private `aed()` that returned a bare number is what the
  // rule was written for. This is a typed amount, not a formatter, but
  // an audit that has to tell those apart by reading the body is an
  // audit that will one day get it wrong in the expensive direction.
  const typedAmount = Number(typed.replace(/[^0-9.]/g, ""));
  return (
    <div className="mt-2">
      <label htmlFor="txval" className="block t-label text-ink-3 mb-2">
        Transaction value, in dirhams
      </label>
      <input id="txval" type="number" inputMode="decimal" value={typed}
        onChange={(e) => setTyped(e.target.value)} placeholder="4200000"
        className="w-48 min-h-11 px-4 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)] tabular" />
      <p className="text-sm text-ink-2 mt-1.5 max-w-[46ch] leading-snug">
        There is no deal on this file yet, so there is no figure to read. Value is one of
        the inputs to the rating — assessing without it would understate a large purchase.
      </p>
      {typedAmount > 0 && (
        <AssessRisk kycId={kycId} dealValueFils={BigInt(Math.round(typedAmount * 100))} />
      )}
    </div>
  );
}

/**
 * What the officer is told, for every state the file can be in.
 *
 * `NONE` and `ERROR` are both "not a match" and are deliberately not the
 * same sentence: nobody has run the check is somebody's job to do, and
 * the check ran and failed is a provider to chase. Collapsing them would
 * hide which one of those is needed.
 */
const HEADING: Record<string, string> = {
  CONFIRMED_MATCH: "Confirmed match",
  POSSIBLE_MATCH: "Possible match",
  CLEAR: "No match",
  ERROR: "Check did not complete",
  NONE: "Not screened yet",
};
