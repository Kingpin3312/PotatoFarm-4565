"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Buyers' picks waiting for the agent.
 *
 * A buyer chose one of the times they were offered on WhatsApp; the slot
 * is held and nothing is booked until the agent answers here — the
 * owner's decision that the agent always confirms. Confirm books it and
 * tells the buyer; "Can't make it" frees the slot and tells them new
 * times will follow. Either way the buyer hears it from this tap, and
 * from nowhere else.
 */
export function ViewingRequests({ onChanged }: { onChanged?: () => void }) {
  const utils = api.useUtils();
  const { data } = api.viewings.requests.useQuery();
  const [said, setSaid] = useState<string | null>(null);
  const done = (msg: string) => {
    setSaid(msg);
    void utils.viewings.requests.invalidate();
    onChanged?.();
  };
  const confirm = api.viewings.confirmRequest.useMutation({
    onSuccess: (r) => done(r.told ? "Booked, and they have been told." : "Booked. WhatsApp's 24 hours have passed, so ring them to say so."),
    onError: (e) => setSaid(e.message),
  });
  const decline = api.viewings.declineRequest.useMutation({
    onSuccess: (r) => done(r.told ? "Freed, and they know other times are coming." : "Freed. Ring them with other times — WhatsApp's 24 hours have passed."),
    onError: (e) => setSaid(e.message),
  });
  if (!data?.length) return said ? <p role="status" className="text-sm text-ink-2 mb-6">{said}</p> : null;

  return (
    <section aria-labelledby="requests-h" className="mb-10">
      <h2 id="requests-h" className="t-label text-accent-deep mb-2">Waiting for you to confirm</h2>
      {said && <p role="status" className="text-sm text-ink-2 mb-2">{said}</p>}
      <div className="border-t border-rule-strong">
        {data.map((r) => (
          <article key={r.id} data-request={r.id} className="border-b border-rule py-4">
            <p className="text-ui text-ink font-medium">{r.lead.name ?? r.lead.phone}</p>
            <p className="text-sm text-ink-2">
              {r.label}{r.listing ? ` · ${r.listing.title ?? r.listing.reference}` : ""}
            </p>
            <p className="text-sm text-ink-3">They picked this from the times they were offered.</p>
            <div className="flex flex-wrap gap-2 mt-3">
              <Button size="sm" variant="primary" loading={confirm.isPending && confirm.variables?.viewingId === r.id}
                onClick={() => confirm.mutate({ viewingId: r.id })}>Confirm</Button>
              <Button size="sm" variant="secondary" loading={decline.isPending && decline.variables?.viewingId === r.id}
                onClick={() => decline.mutate({ viewingId: r.id })}>Can&rsquo;t make it</Button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
