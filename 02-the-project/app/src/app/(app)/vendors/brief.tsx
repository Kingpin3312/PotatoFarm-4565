"use client";

import { api } from "@/lib/trpc";
import { cn } from "@/lib/cn";

/**
 * What to say when you ring the owner.
 *
 * Not a profile page. An agent about to call needs three things: what
 * has happened since they last spoke, what is on the table, and whether
 * this owner wanted a call at all.
 *
 * The last one is the point. Ringing an OFFERS_ONLY vendor for a chat
 * is the fastest way to lose an instruction, and it is exactly the sort
 * of thing an agent forgets under pressure.
 */
export function VendorBrief({ vendorId }: { vendorId: string }) {
  const { data, isLoading } = api.vendors.brief.useQuery({ vendorId });
  if (isLoading || !data) return null;

  const dontCall = data.prefers === "OFFERS_ONLY";

  return (
    <div className="bg-sunk rounded-xl p-5">
      <div className="flex items-baseline gap-3 flex-wrap">
        <span className="text-[18px] text-ink font-semibold">{data.name}</span>
        {data.actingFor && (
          <span className="text-sm text-ink-2">acting for {data.actingFor}</span>
        )}
        {data.phone && (
          <a href={`tel:${data.phone}`}
             className={cn("ml-auto btn-inline", dontCall && "opacity-60")}>
            Call
          </a>
        )}
      </div>

      {/* Before the number, not after. */}
      {data.callAdvice && (
        <p className={cn("text-[15px] mt-3 pl-3 border-l-2 leading-snug max-w-[46ch]",
          dontCall ? "border-l-accent-edge text-ink" : "border-l-rule text-ink-2")}>
          {data.callAdvice}
        </p>
      )}

      <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-rule">
        <div>
          <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            Since you last spoke
          </span>
          <span className="text-[17px] text-ink font-semibold tabular block mt-1">
            {data.sinceThen.viewings} viewing{data.sinceThen.viewings === 1 ? "" : "s"}
          </span>
        </div>
        <div>
          <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
            On the table
          </span>
          <span className={cn("text-[17px] font-semibold tabular block mt-1",
            data.sinceThen.liveOffers > 0 ? "text-accent-type" : "text-ink")}>
            {data.sinceThen.liveOffers} offer{data.sinceThen.liveOffers === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {data.sinceThen.viewings === 0 && !dontCall && (
        <p className="text-sm text-ink-2 mt-4 max-w-[46ch] leading-snug">
          Nothing this week. Ring them anyway — an owner who hears nothing assumes you have
          stopped trying, and "no viewings, here is what we are changing" is the call that
          keeps an instruction.
        </p>
      )}
    </div>
  );
}
