"use client";

import { useState } from "react";

import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Why this lead came to you — and the two things you can do about it.
 *
 * Shown on the lead itself rather than in settings, because that is
 * where the question occurs: an agent looking at a lead they think
 * should have been somebody else's.
 *
 * A dispute carries the routing decision with it, so the manager reads
 * the facts before the argument.
 */
export function LeadRouting({ leadId }: { leadId: string }) {
  const { data } = api.routing.history.useQuery({ leadId });
  /**
   * `routing.dispute` is a query, not a mutation, and deliberately so —
   * ownership.ts is explicit that it returns the facts and what the
   * rule says, and never a verdict. Nothing is filed.
   *
   * So the button reveals the summary rather than claiming to have
   * raised something. It was calling `.mutate()` on a query and then
   * telling the agent "Raised. Your manager sees the routing decision
   * alongside it" — which nothing in the codebase made true.
   */
  const [asking, setAsking] = useState(false);
  const dispute = api.routing.dispute.useQuery({ leadId }, { enabled: asking });
  const claim = api.routing.claim.useMutation();

  if (!data) return null;

  return (
    <div className="border-t border-rule pt-4 mt-6">
      <span className="block t-label text-ink-3 mb-2">
        How this came to you
      </span>
      <p className="text-ui text-ink leading-snug">{data.explanation}</p>

      {data.unclaimed ? (
        <Button variant="primary" className="mt-3" loading={claim.isPending}
          onClick={() => claim.mutate({ leadId })}>
          Claim it
        </Button>
      ) : asking && dispute.data ? (
        <div className="mt-3 bg-sunk rounded-lg p-3">
          <p className="text-sm text-ink">{dispute.data.ruleSays}</p>
          <ul className="mt-2 space-y-1">
            {dispute.data.timeline.map((line, i) => (
              <li key={i} className="text-label text-ink-3">{line}</li>
            ))}
          </ul>
          <p className="text-sm text-ink-2 mt-2 max-w-[46ch] leading-snug">{dispute.data.note}</p>
        </div>
      ) : (
        <button className="btn-inline mt-3" onClick={() => setAsking(true)}>
          This should have gone to someone else
        </button>
      )}
    </div>
  );
}
