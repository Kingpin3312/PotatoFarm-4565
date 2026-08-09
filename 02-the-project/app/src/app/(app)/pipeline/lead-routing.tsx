"use client";

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
  const dispute = api.routing.dispute.useMutation();
  const claim = api.routing.claim.useMutation();

  if (!data) return null;

  return (
    <div className="border-t border-rule pt-4 mt-6">
      <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
        How this came to you
      </span>
      <p className="text-[15px] text-ink leading-snug">{data.explanation}</p>

      {data.unclaimed ? (
        <Button variant="primary" className="mt-3" loading={claim.isPending}
          onClick={() => claim.mutate({ leadId })}>
          Claim it
        </Button>
      ) : dispute.isSuccess ? (
        <p className="text-sm text-success mt-3">
          Raised. Your manager sees the routing decision alongside it.
        </p>
      ) : (
        <button className="btn-inline mt-3" onClick={() => dispute.mutate({ leadId })}>
          This should have gone to someone else
        </button>
      )}
    </div>
  );
}
