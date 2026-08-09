"use client";

import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The KYC state of one buyer, as an agent sees it.
 *
 * The compliance officer's view already exists. This is the other side
 * — and the difference between them is the whole design.
 *
 * **An agent never sees a sanctions reason.** A possible match shows as
 * a neutral hold with no explanation. Telling an agent "possible
 * terrorist financing match" is how somebody gets tipped off, which is
 * itself an offence under UAE AML rules. The router returns a
 * deliberately bland message for exactly this and it is passed through
 * unchanged.
 */
export function KycPanel({ leadId }: { leadId: string }) {
  const { data, isLoading } = api.aml.fileStatus.useQuery({ leadId });
  const { data: wording } = api.aml.requestWording.useQuery({ leadId });

  if (isLoading || !data) return null;

  if (!data.exists) {
    return (
      <div className="border-t border-rule pt-4 mt-6">
        <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
          Identity
        </span>
        <p className="text-[15px] text-ink-2 max-w-[44ch] leading-snug">
          Nothing needed yet. A file opens when this becomes a transaction — every brokerage
          concluding a sale is a DNFBP and the check is the firm's obligation, not yours.
        </p>
      </div>
    );
  }

  const held = data.status === "WITH_COMPLIANCE";

  return (
    <div className="border-t border-rule pt-4 mt-6">
      <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
        Identity
      </span>

      {held ? (
        // Neutral, and deliberately uninformative. The message comes
        // from the router; do not enrich it here.
        <div className="bg-sunk rounded-xl p-4 border-l-[3px] border-l-rule-strong">
          <p className="text-[15px] text-ink">{data.message}</p>
        </div>
      ) : (
        <>
          <p className={cn("text-[16px] font-semibold",
            data.outstanding.length === 0 ? "text-success" : "text-ink")}>
            {data.outstanding.length === 0
              ? "Everything's in."
              : `Waiting on ${data.outstanding.length === 2 ? "both documents" : "one document"}`}
          </p>
          {data.outstanding.length > 0 && (
            <>
              <ul className="mt-2 space-y-1">
                {data.outstanding.map((d) => (
                  <li key={d} className="text-sm text-ink-2">
                    {d === "PASSPORT" ? "Passport" : "Emirates ID"}
                  </li>
                ))}
              </ul>
              {wording?.text && (
                <div className="mt-4">
                  <p className="text-sm text-ink-3 mb-2">Ask them like this:</p>
                  <p className="text-[15px] text-ink bg-sunk rounded-xl p-3 leading-snug">
                    {wording.text}
                  </p>
                  <Button variant="secondary" className="mt-2"
                    onClick={() => void navigator.clipboard?.writeText(wording.text)}>
                    Copy
                  </Button>
                </div>
              )}
            </>
          )}
          {data.unverified > 0 && (
            <p className="text-sm text-ink-2 mt-3 max-w-[44ch] leading-snug">
              {data.unverified} uploaded but not yet checked. Your compliance officer does
              that — nothing is auto-verified.
            </p>
          )}
        </>
      )}
    </div>
  );
}
