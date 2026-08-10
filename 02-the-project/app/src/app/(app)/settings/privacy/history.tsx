"use client";

import { api } from "@/lib/trpc";

/**
 * Past erasure requests.
 *
 * Kept because an inspector asks what you did with requests, not only
 * whether you honoured them — and a deferred request needs to show that
 * it was deferred for a reason rather than ignored.
 */
export function ErasureHistory() {
  const { data } = api.privacy.erasureHistory.useQuery();
  if (!data?.requests.length) return null;

  return (
    <section className="mt-12">
      <h2 className="font-sans font-semibold text-[17px] text-accent-type mb-3">Past requests</h2>
      <div className="border-t border-ink">
        {data.requests.map((r) => (
          <div key={r.id} className="py-3 border-b border-rule">
            <div className="flex items-baseline gap-3">
              <span className="text-[15px] text-ink">{r.subject}</span>
              <span className="ml-auto font-mono text-[11px] text-ink-3">
                {new Date(r.requestedAt).toLocaleDateString("en-GB")}
              </span>
            </div>
            <p className="text-sm text-ink-2 mt-1 max-w-[48ch] leading-snug">
              {r.state === "DEFERRED"
                ? `Deferred — a live KYC file exists. Due ${new Date(r.dueAt!).toLocaleDateString("en-GB")}.`
                : r.state === "DONE" ? "Scrubbed. The audit trail was kept."
                : "Pending."}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
}
