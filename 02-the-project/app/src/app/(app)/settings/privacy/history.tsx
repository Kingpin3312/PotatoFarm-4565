"use client";

import { api } from "@/lib/trpc";

/**
 * Past privacy requests.
 *
 * Kept because an inspector asks what you did with requests, not only
 * whether you honoured them — and a deferred request needs to show that
 * it was deferred for a reason rather than ignored.
 *
 * ## Both kinds, said apart
 *
 * `erasureHistory` returns subject-access requests as well as erasures —
 * correctly, because they are the two things a person can ask for and an
 * inspector asks about both. This read only `state`, so a subject-access
 * request, which is never deferred, fell to the `DONE` branch and was
 * described to the officer as **"Scrubbed. The audit trail was kept."**
 * Somebody who asked for a copy of their file was recorded on this
 * screen as having been deleted.
 *
 * It was invisible for the same reason as everything else in this
 * ratchet: nothing imported the component, so the sentence had never
 * been rendered against a real row.
 *
 * `by` is shown for the same reason. The question is what was done and
 * who did it; a list of dates answers half of it.
 */
export function ErasureHistory() {
  const { data } = api.privacy.erasureHistory.useQuery();
  if (!data?.requests.length) return null;

  return (
    <section className="mt-12">
      <h2 className="font-sans font-medium text-sub text-ink mb-3">Past requests</h2>
      <p className="text-sm text-ink-2 mb-3 max-w-[48ch] leading-snug">
        Everything asked for and what was done about it. An inspector asks about the
        requests you refused or deferred, not only the ones you honoured.
      </p>
      <div className="border-t border-ink">
        {data.requests.map((r) => (
          <div key={r.id} className="py-3 border-b border-rule">
            <div className="flex items-baseline gap-3">
              <span className="text-ui text-ink">{r.subject}</span>
              <span className="t-label text-ink-3 border border-rule rounded-[3px] px-1.5 py-0.5">
                {r.kind === "ACCESS" ? "access" : "erasure"}
              </span>
              <span className="ms-auto font-mono text-label text-ink-3">
                {new Date(r.requestedAt).toLocaleDateString("en-GB")}
              </span>
            </div>
            <p className="text-sm text-ink-2 mt-1 max-w-[48ch] leading-snug">
              {r.kind === "ACCESS"
                ? "Asked for a copy of their file. Built and read."
                : r.state === "DEFERRED"
                ? `Deferred — a live KYC file exists. Due ${new Date(r.dueAt!).toLocaleDateString("en-GB")}.`
                : "Scrubbed. The audit trail was kept."}
              {r.by && <span className="text-ink-3"> · {r.by}</span>}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
