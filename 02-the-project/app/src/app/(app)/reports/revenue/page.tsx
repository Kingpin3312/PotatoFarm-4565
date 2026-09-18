"use client";

import { api } from "@/lib/trpc";
import { Bars } from "@/components/ui/chart";
import { QueryError } from "@/components/ui/query-state";
import { aedShort } from "@/lib/money";

/**
 * What the brokerage earned.
 *
 * ## Why this screen did not exist
 *
 * Every money read in the product scoped to the caller. `commission.mine`
 * filters on `userId`; so does `myTier`. That is right for an agent and
 * it left the person who owns the business with **no way to see what the
 * business made** — a brokerage could run this product for a year and
 * never once be told its own revenue by it.
 *
 * Management could already see the pipeline's value, the deals in play,
 * response times against a captured baseline, the lead sources and a
 * team board ranked on viewings booked. All of that is activity. None of
 * it is money.
 *
 * ## One figure, then where things stand
 *
 * The headline is money **received** in the window. Invoiced, forecast
 * and written-off are a separate group underneath, because they are not
 * dated by the window at all — what you are owed is a question about
 * today, whatever year the invoice was raised in. Four tiles in one row
 * would invite somebody to add them up.
 *
 * ## Two different numbers, labelled as two different numbers
 *
 * The headline is **commission the brokerage was paid**. The agent table
 * is **splits**, which are shares of those same commissions. Adding one
 * to the other double-counts a year's earnings, so the table says whose
 * share it is rather than sitting under the total unlabelled.
 *
 * ## What it looks like when nothing has run
 *
 * The first version dated everything by `Deal.completedAt` and would
 * have reported **zero on a brokerage with two paid commissions** — a
 * fee is routinely invoiced and paid before the transfer completes. A
 * screen showing nothing does not read as "this filter excluded
 * everything"; it reads as "we earned nothing", which is the reassuring
 * direction to be wrong in and therefore the dangerous one.
 */
export default function Revenue() {
  const { data, isLoading, isError, refetch, error } = api.commission.brokerage.useQuery();

  if (isError) {
    return <QueryError retry={() => void refetch()} what="what the brokerage earned" error={error} />;
  }
  if (isLoading) {
    return (
      <div className="max-w-[860px] mx-auto px-6 pt-10" aria-busy>
        <span className="sr-only">Loading the brokerage&rsquo;s revenue</span>
        <div className="h-10 w-64 bg-sunk rounded-sm" />
        <div className="grid grid-cols-3 gap-px mt-8">
          {[0, 1, 2].map((i) => <div key={i} className="h-24 bg-sunk rounded-sm" />)}
        </div>
      </div>
    );
  }
  if (!data) return null;

  const months = data.byMonth;
  const earning = months.filter((m) => m.fils > 0n).length;

  return (
    <div className="max-w-[860px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-2">
        <span className="t-label text-ink-3 block mb-3">
          Reports &middot; the last twelve months
        </span>
        <h1 className="font-sans text-page text-ink">What the brokerage earned</h1>
        <p className="mt-3 max-w-[56ch] text-ink-2">
          Commission the brokerage has actually been paid, dated by when the money arrived
          rather than by when somebody got round to recording it.
        </p>
      </header>

      {/* Money in, over the window. One figure and not a row of three,
          because it is the answer and the rest is context. */}
      <div className="border-t border-ink mt-8 pt-6">
        <div className="font-sans font-semibold text-stat leading-none text-ink tabular">
          {data.received}
        </div>
        <p className="t-label text-ink-3 mt-2.5">Received in the last twelve months</p>
        <p className="mt-3 t-label text-ink-3">
          {data.deals} {data.deals === 1 ? "commission" : "commissions"} &middot;{" "}
          {data.transacted} of property transacted &middot; {data.vat} VAT
        </p>
        {/* A received commission with no date on it cannot appear in a
            windowed total, and dropping it silently is how money goes
            missing from a report that still looks complete. */}
        {data.undated > 0 && (
          <p className="mt-3 text-sm text-ink-2 max-w-[52ch] leading-snug">
            {data.undated} received {data.undated === 1 ? "commission has" : "commissions have"} no
            payment date recorded, so {data.undated === 1 ? "it is" : "they are"} not in that
            figure. Add the date and {data.undated === 1 ? "it appears" : "they appear"} here.
          </p>
        )}
      </div>

      {/* Where the brokerage stands today. Deliberately a separate group
          from the figure above: these are not dated by the window, and
          putting all four in one row invites somebody to add them up. */}
      <h2 className="font-sans font-semibold text-section text-ink mt-12 mb-1">Where it stands today</h2>
      <p className="text-sm text-ink-3 max-w-[60ch]">
        Not restricted to the window above &mdash; what you are owed is a question about now,
        whatever year the invoice was raised in.
      </p>
      <div className="grid grid-cols-3 max-[640px]:grid-cols-1 border-t border-ink mt-5">
        <Figure label="Invoiced, not yet paid" value={data.invoiced}
                note={countNote(data.invoicedCount)} highlight />
        <Figure label="Forecast" value={data.forecast}
                note={countNote(data.forecastCount)} muted />
        <Figure label="Written off" value={data.writtenOff}
                note={countNote(data.writtenOffCount)} muted />
      </div>
      {data.writtenOffCount > 0 && (
        <p className="mt-4 text-sm text-ink-2 max-w-[56ch] leading-snug ps-3 border-s-2 border-s-accent-edge">
          A write-off is in none of the other figures on this page. Worth knowing why before it
          becomes a habit.
        </p>
      )}

      <h2 className="font-sans font-semibold text-section text-ink mt-12 mb-1">By month</h2>
      <p className="text-sm text-ink-3 max-w-[60ch]">
        Dated by when the money arrived. Every month in the window is shown, including the ones that earned nothing &mdash; a chart
        drawn only from the months with revenue in them draws a smooth line through a quiet
        quarter, which is the shape most worth seeing.
      </p>
      <div className="mt-5">
        <Bars
          bars={months.map((m) => ({
            label: m.month.slice(2).replace("-", "/"),
            value: Number(m.fils),
          }))}
          // `aedShort` from lib/money, not a template string. `money.py`
          // caught the hand-built one, correctly: two formatters agreeing
          // today is not the same as one formatter. `Bars` hands back the
          // numeric value it was given, which is fils.
          format={(v) => aedShort(BigInt(Math.round(v)))}
          empty="No commission has been paid in the last twelve months. A month fills in when a fee is marked received against a deal."
        />
      </div>
      {earning > 0 && earning < months.length && (
        <p className="mt-3 t-label text-ink-3">
          {earning} of {months.length} months earned something
        </p>
      )}

      <h2 className="font-sans font-semibold text-section text-ink mt-12 mb-1">Who earned it</h2>
      <p className="text-sm text-ink-3 max-w-[60ch]">
        Each person&rsquo;s <em>share</em> of the fees above, not a second set of fees &mdash;
        these add up to the commission, they do not add to it. Only fees the brokerage has actually been
        paid for are attributed to anybody.
      </p>
      <div className="border-t border-ink mt-5">
        {data.byAgent.length === 0 ? (
          <p className="py-6 text-sm text-ink-3 max-w-[52ch]">
            Nobody has been credited yet. A person appears here once a commission they have a
            share of is marked received.
          </p>
        ) : (
          data.byAgent.map((a) => (
            <div key={a.key} className="flex gap-4 items-baseline py-4 border-b border-rule flex-wrap">
              <span className="text-control text-ink">
                {a.name}
                {a.kind !== "user" && (
                  <span className="t-label text-ink-3 border border-rule rounded-[3px] px-1.5 py-0.5 ms-2">
                    {a.kind === "brokerage" ? "the house" : "referrer"}
                  </span>
                )}
              </span>
              <span className="font-mono text-note text-ink-3">
                {a.deals} {a.deals === 1 ? "deal" : "deals"}
              </span>
              {a.unpaid && (
                <span className="t-label text-ink-3">{a.unpaid} not yet paid out</span>
              )}
              <span className="ms-auto text-ui text-ink font-medium tabular">{a.earned}</span>
            </div>
          ))
        )}
      </div>

      <p className="mt-8 text-sm text-ink-3 max-w-[56ch] leading-snug">
        An agent sees their own figures on Mine without needing permission for this screen.
        This one needs it, and a compliance officer deliberately does not have it &mdash; they
        see every client file in the brokerage, and what the firm bills is a separate matter.
      </p>
    </div>
  );
}

/** How many rows a figure is the sum of. Empty rather than "0 deals". */
const countNote = (n: number) => (n === 0 ? null : `${n} ${n === 1 ? "deal" : "deals"}`);

function Figure({ label, value, note, highlight, muted }: {
  label: string; value: string; note?: string | null; highlight?: boolean; muted?: boolean;
}) {
  return (
    <div className="px-5 py-5 border-e border-b border-rule last:border-e-0 max-[640px]:border-e-0">
      <div
        className={`font-sans font-semibold text-title leading-none tabular ${
          highlight ? "text-accent-deep" : muted ? "text-ink-3" : "text-ink"
        }`}
      >
        {value}
      </div>
      <div className="t-label text-ink-3 mt-2">{label}</div>
      {note && <div className="t-label text-ink-3 mt-1">{note}</div>}
    </div>
  );
}
