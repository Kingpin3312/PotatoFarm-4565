"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Recording what a deal pays, and to whom.
 *
 * The preview runs before the record, because a split disagreement
 * discovered after the money moves is a different and much worse
 * conversation.
 *
 * Rate is in basis points throughout — 2% is 200bp. Percentages in a
 * form invite somebody to type 0.02 and be wrong by a factor of a
 * hundred.
 */
export function RecordCommission({ dealId, valueFils }: {
  dealId: string; valueFils: bigint;
}) {
  const [rateBp, setRate] = useState(200);
  const preview = api.commission.preview.useQuery(
    { dealValueFils: valueFils, rateBp },
    { enabled: rateBp > 0 }
  );
  const record = api.commission.record.useMutation();

  if (record.isSuccess) {
    return (
      <p className="text-ui text-success">
        Recorded. It shows on everyone's Mine page from now.
      </p>
    );
  }

  return (
    <div className="border-t border-rule pt-5">
      <label htmlFor="rate" className="block t-label text-ink-3 mb-2">
        Rate
      </label>
      <div className="flex gap-2 items-center flex-wrap">
        <input id="rate" type="number" inputMode="decimal" step="5" value={rateBp}
          onChange={(e) => setRate(Number(e.target.value) || 0)}
          className="w-28 min-h-11 px-4 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)] tabular" />
        <span className="text-ui text-ink-2 tabular">
          basis points — {(rateBp / 100).toFixed(2)}%
        </span>
      </div>

      {/* Shown before recording, not after. A split argument after the
          money moves is a different conversation entirely. */}
      {/* `preview` returns a union — a split that does not total 100% comes
          back as `{ ok: false, error }` rather than throwing, and the
          message is written for the person to act on. Show it. */}
      {preview.data?.ok === false && (
        <p className="text-sm text-danger mt-4 max-w-[46ch] leading-snug">{preview.data.error}</p>
      )}

      {preview.data?.ok && (
        <div className="mt-5 border-t border-ink">
          {preview.data.splits.map((s, i) => (
            <div key={i} className="flex items-baseline gap-3 py-3 border-b border-rule">
              {/* There is no `label` on a split. Who it is, is the named
                  person if there is one, otherwise the role. */}
              <span className="text-ui text-ink">
                {s.externalName ?? s.role.replace(/_/g, " ").toLowerCase()}
              </span>
              <span className="ml-auto text-ui text-ink font-medium tabular">
                {s.amount}
              </span>
            </div>
          ))}
          <div className="flex items-baseline gap-3 py-3">
            <span className="text-ui text-ink-2">Gross</span>
            <span className="ml-auto text-sub text-ink font-medium tabular">
              {preview.data.gross}
            </span>
          </div>
        </div>
      )}

      <Button variant="primary" className="mt-5" loading={record.isPending}
        disabled={rateBp < 1}
        onClick={() => record.mutate({ dealId, rateBp })}>
        Record it
      </Button>
    </div>
  );
}
