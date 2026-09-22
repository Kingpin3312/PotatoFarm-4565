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
        {/*
          * An h1, because this screen's subject is the owner.
          *
          * It was a span, so `/vendors/<id>` was one of the few screens
          * in the product with no heading at all — invisible to a
          * screen reader's document outline, and the reason the screen
          * gallery listed it with a blank title.
          */}
        <h1 className="text-sub text-ink font-medium">{data.name}</h1>
        {data.actingFor && (
          <span className="text-sm text-ink-2">acting for {data.actingFor}</span>
        )}
        {data.phone && (
          <a href={`tel:${data.phone}`}
             className={cn("ms-auto btn-inline", dontCall && "opacity-60")}>
            Call
          </a>
        )}
      </div>

      {/* Before the number, not after. */}
      {data.callAdvice && (
        <p className={cn("text-ui mt-3 ps-3 border-s-2 leading-snug max-w-[46ch]",
          dontCall ? "border-s-accent-edge text-ink" : "border-s-rule text-ink-2")}>
          {data.callAdvice}
        </p>
      )}

      {/*
        * Which property, and it was being fetched and thrown away.
        *
        * `vendors.brief` has returned `listings` since it was written
        * and this component read `name`, `phone`, `prefers`,
        * `actingFor`, `sinceThen` and `callAdvice` — never the
        * properties. So the screen an agent opens before ringing an
        * owner could not name what they were ringing about, and the
        * owner's own reference — the thing they say on the phone —
        * was one query away and invisible.
        */}
      {data.listings.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {data.listings.map((l) => (
            <a key={l.id} href={`/offers/${l.id}`}
               className="text-sm text-ink-2 bg-paper border border-rule rounded-sm px-2 py-1 hover:text-ink">
              <span className="font-mono">{l.reference}</span>
              <span className="text-ink-3"> · {l.status.toLowerCase().replace(/_/g, " ")}</span>
            </a>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4 mt-5 pt-4 border-t border-rule">
        <div>
          <span className="block t-label text-ink-3">
            Since you last spoke
          </span>
          <span className="text-sub text-ink font-medium tabular block mt-1">
            {data.sinceThen.viewings} viewing{data.sinceThen.viewings === 1 ? "" : "s"}
          </span>
        </div>
        <div>
          <span className="block t-label text-ink-3">
            On the table
          </span>
          <span className={cn("text-sub font-medium tabular block mt-1",
            data.sinceThen.liveOffers > 0 ? "text-accent-deep" : "text-ink")}>
            {data.sinceThen.liveOffers} offer{data.sinceThen.liveOffers === 1 ? "" : "s"}
          </span>
        </div>
      </div>

      {/*
        * What the offers actually are.
        *
        * "1 offer" was the whole of it, and the first thing an owner
        * asks is how much — so the agent went looking on another screen
        * mid-call. Ranked by strength rather than price, because cash
        * with no conditions beats a higher mortgage nobody has
        * pre-approved, and the line beneath each one says which it is
        * so the agent can explain the ranking rather than assert it.
        */}
      {data.strongest.length > 0 && (
        <>
        {/*
          * Labelled, and the label names the ordering rather than the
          * contents. "1 offer" above already says how many; what an
          * agent needs to know before repeating it to an owner is that
          * the top one is the *strongest* and not merely the biggest.
          */}
        <span className="block t-label text-ink-3 mt-5">
          Strongest first, not highest
        </span>
        <ul className="mt-2 space-y-2">
          {data.strongest.map((o, i) => (
            <li key={i} className="flex items-baseline gap-2 flex-wrap text-ui">
              <span className="text-ink font-medium tabular">{o.current}</span>
              <span className="text-sm text-ink-2">
                {o.financing === "CASH"
                  ? "cash"
                  : o.preApproved
                    ? "mortgage, pre-approved"
                    : "mortgage, not pre-approved"}
                {o.hasConditions ? ", with conditions" : ", no conditions"}
                {/* A buyer who has come up twice has room. One who
                    opened and stood still has not. */}
                {o.moves > 0 && `, moved ${o.moves === 1 ? "once" : `${o.moves} times`}`}
              </span>
            </li>
          ))}
        </ul>
        </>
      )}

      {/*
        * When this owner was last told anything.
        *
        * `lastReportedAt` was returned by the procedure and read by
        * nothing, on a screen whose entire premise is what to say when
        * you ring them. An agent who does not know what the owner has
        * already been told either repeats last week's update or assumes
        * they know something they do not.
        *
        * "Never" is stated plainly. `feedback.vendor-report` runs on
        * Monday mornings, so an owner with no report is one who has
        * been instructed within the week — or one the job has silently
        * missed, and that is worth an agent noticing.
        */}
      <p className="text-sm text-ink-3 mt-4">
        {data.lastReportedAt
          ? `Last updated ${new Date(data.lastReportedAt).toLocaleDateString("en-GB", {
              day: "numeric", month: "long",
            })}.`
          : "They have not been sent an update yet."}
      </p>

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
