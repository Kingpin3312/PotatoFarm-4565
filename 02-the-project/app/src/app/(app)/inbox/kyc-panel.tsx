"use client";

import { useState } from "react";
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
  const utils = api.useUtils();
  const [failed, setFailed] = useState<string | null>(null);

  /**
   * Opening one by hand.
   *
   * A file opens on its own when an offer is accepted. This is for
   * before that — a buyer who mentions cash over the reporting
   * threshold, or a corporate buyer whose beneficial owners will take a
   * fortnight to establish. Starting late is the failure mode, and the
   * only cure is making it possible to start early.
   */
  const open = api.aml.openFile.useMutation({
    onSuccess: () => { setFailed(null); void utils.aml.fileStatus.invalidate({ leadId }); },
    onError: (e) => setFailed(e.message),
  });

  /**
   * Wording for the document actually outstanding.
   *
   * `requestWording` takes a `docType` — the message differs between
   * asking for a passport and asking for an Emirates ID — and was being
   * passed a `leadId`, which it has no input for. It also returns
   * `body`, not `text`.
   */
  const needs = data?.outstanding?.[0];
  const { data: wording } = api.aml.requestWording.useQuery(
    { docType: needs as "PASSPORT" | "EMIRATES_ID" | "TRADE_LICENCE" },
    { enabled: Boolean(needs) }
  );

  if (isLoading || !data) return null;

  if (!data.exists) {
    return (
      <div className="border-t border-rule pt-4 mt-6">
        <span className="block t-label text-ink-3 mb-2">
          Identity
        </span>
        <p className="text-ui text-ink-2 max-w-[44ch] leading-snug">
          Nothing needed yet. A file opens on its own when an offer is accepted — every
          brokerage concluding a sale is a DNFBP and the check is the firm&rsquo;s
          obligation, not yours.
        </p>

        {failed && (
          <p role="alert" className="mt-3 text-sm text-danger max-w-[44ch]">{failed}</p>
        )}

        {/* The sentence above used to be the whole panel, and it
            described something that never happened: nothing in the
            product could create a file, so "a file opens when this
            becomes a transaction" was a promise with nothing behind it.
            Early is the only direction this ever needs to move. */}
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          loading={open.isPending}
          onClick={() => open.mutate({ leadId })}
        >
          Start one now
        </Button>
      </div>
    );
  }

  const held = data.status === "WITH_COMPLIANCE";

  return (
    <div className="border-t border-rule pt-4 mt-6">
      <span className="block t-label text-ink-3 mb-2">
        Identity
      </span>

      {held ? (
        // Neutral, and deliberately uninformative. The message comes
        // from the router; do not enrich it here.
        <div className="bg-sunk rounded-xl p-4 border-s-[3px] border-s-rule-strong">
          <p className="text-ui text-ink">{data.message}</p>
        </div>
      ) : (
        <>
          <p className={cn("text-control font-medium",
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
              {wording?.body && (
                <div className="mt-4">
                  <p className="text-sm text-ink-3 mb-2">Ask them like this:</p>
                  <p className="text-ui text-ink bg-sunk rounded-xl p-3 leading-snug">
                    {wording.body}
                  </p>
                  <Button variant="secondary" className="mt-2"
                    onClick={() => void navigator.clipboard?.writeText(wording.body)}>
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
