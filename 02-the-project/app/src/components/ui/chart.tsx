"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

/**
 * The shapes this product draws, and nothing else.
 *
 * ## Why these are hand-drawn SVG and not a charting library
 *
 * Three reasons, in order of weight.
 *
 * The **Content-Security-Policy** forbids a CDN and `script-src` runs on
 * a per-request nonce, so a library would have to be bundled; the small
 * ones are 40kB and the good ones are 200kB, to draw four shapes.
 *
 * The **palette** is the product's, and every charting library ships an
 * opinion about colour that has to be overridden token by token. What is
 * left after the overriding is roughly this file.
 *
 * And **the empty case**, which is the one that matters. A library draws
 * an axis with nothing on it, because that is a faithful rendering of no
 * data. The reports screen did exactly that: a row of hour labels under
 * an empty band, on a brokerage whose database holds no messages. It
 * read as broken software rather than as an honest "nothing here yet",
 * and that is the difference between a chart and a picture of a chart.
 *
 * **Every component here takes an `empty` sentence and shows it instead
 * of an axis when there is nothing to plot.** It is a required prop, not
 * an optional one, so the question cannot be skipped.
 *
 * ## Colour
 *
 * A sequential ramp mixed from the one accent, so an ordered series
 * reads as ordered without introducing a second hue. `color-mix` against
 * the ground means the ramp is correct on white and on the panel without
 * a second set of values.
 *
 * Nothing here uses colour as the only signal. Every series carries its
 * label and its number beside it, because roughly one man in twelve
 * cannot separate the top of this ramp from the bottom.
 */

/**
 * ## Why there is no colour ramp here
 *
 * The first version shaded each funnel band from a 22% tint to the full
 * accent. It was wrong twice, and the second fault is the interesting
 * one.
 *
 * **It failed measurement.** Six steps mixed from one hue toward white
 * span too little lightness: adjacent steps came out 0.05 apart in
 * OKLCH L against a 0.06 floor, and the palest band measured 1.24:1
 * against white — a mark you cannot see. Pushing the dark end far
 * enough to pass took the ramp into a muddy brown that is not in this
 * palette. Measured with a validator rather than judged by eye, which
 * is the only way this kind of fault ever surfaces.
 *
 * **And it was encoding nothing.** A funnel already says magnitude with
 * the length of the bar and order with the position of the row. Shading
 * by size spends the one free channel on a fact the chart has already
 * stated twice, and buys a reader nothing for it.
 *
 * So every bar is the one accent, and length does the work.
 */

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-sm text-ink-3 leading-snug max-w-[42ch] py-6">{children}</p>
  );
}

/* ------------------------------------------------------------------ */

export type FunnelRow = { label: string; value: number; note?: string; muted?: boolean };

/**
 * Named categories in a meaningful order, compared by bar length.
 *
 * A column of counts tells you the numbers; the bars tell you the
 * shape, which is the only reason anybody opens either screen that
 * uses this. The width of each band is its share of the widest, so a
 * stage that loses two thirds of what entered it looks like it.
 *
 * Categories with nothing in them are drawn, not skipped — an empty
 * "Won" is information, and a chart that quietly omits its empty rows
 * is one that always looks healthy.
 *
 * ## Two callers, and why it is one component
 *
 * The pipeline draws its stages; the leads screen draws its score
 * bands. They are not the same *thing* — a lead moves through stages
 * and sits in exactly one band — but they are the same picture, and
 * two copies of forty lines to encode a distinction the pixels do not
 * show is how the two come to disagree about a corner case. `caption`
 * exists so the screen reader hears which one it is; everything else
 * is shared.
 *
 * `muted` is the only encoding beyond length, and it is deliberately
 * two-valued rather than a ramp — see the note above on why a ramp
 * from this accent cannot be made to measure up.
 */
export function Funnel({ rows, empty, caption, className }: {
  rows: FunnelRow[];
  empty: React.ReactNode;
  caption: string;
  className?: string;
}) {
  const total = rows.reduce((n, r) => n + r.value, 0);
  if (rows.length === 0 || total === 0) return <Empty>{empty}</Empty>;

  const widest = Math.max(...rows.map((r) => r.value), 1);

  return (
    <div className={cn("flex flex-col gap-1.5", className)} role="img"
         aria-label={`${caption}: ${rows.map((r) => `${r.label} ${r.value}`).join(", ")}`}>
      {rows.map((r) => {
        const w = (r.value / widest) * 100;
        return (
          <div key={r.label} className="flex items-center gap-3">
            {/**
             * The label sits outside the bar, and this is the second
             * version. Inside looked tidier and could not survive real
             * data: at nine in one stage and one in the next, the narrow
             * bands clipped to "Vi…" and "N…", and the three empty
             * stages rendered a coloured sliver with no name on it at
             * all — so the funnel silently stopped saying that "Won" was
             * empty, which is the fact it exists to report.
             */}
            <span className="text-note text-ink w-[104px] shrink-0 truncate">{r.label}</span>
            {/**
             * `bg-sunk`, not `bg-panel`.
             *
             * `--panel` is the token; the Tailwind utility it generates
             * is named after the `@theme` entry, which is
             * `--color-sunk`. `bg-panel` compiles to nothing at all, so
             * the track was invisible and the three empty stages
             * rendered as blank space — which read as deliberate in a
             * screenshot and was not. `design-audit.py` caught it; the
             * eye did not.
             */}
            <div className="flex-1 min-w-0 h-7 bg-sunk rounded-[3px] overflow-hidden">
              {r.value > 0 && (
                <div className="h-full rounded-[3px]"
                     style={{ width: `${Math.max(2, w)}%`,
                              background: r.muted ? "var(--rule-strong)" : "var(--accent)" }} />
              )}
            </div>
            <span className="text-note tabular text-ink font-medium w-8 text-end shrink-0">
              {r.value}
            </span>
            <span className="text-note tabular text-ink-3 w-[86px] text-end shrink-0 hidden sm:block">
              {r.note ?? "—"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ------------------------------------------------------------------ */

export type Bar = { label: string; value: number; muted?: boolean };

/**
 * A series across a fixed axis — hours of a day, days of a week.
 *
 * `axisEvery` labels every nth bar, because 24 hour labels do not fit a
 * phone and dropping them entirely loses the point of the chart.
 */
export function Bars({ bars, empty, format, axisEvery = 6, height = 150 }: {
  bars: Bar[];
  empty: React.ReactNode;
  format: (v: number) => string;
  axisEvery?: number;
  height?: number;
}) {
  const top = Math.max(...bars.map((b) => b.value), 0);
  if (bars.length === 0 || top === 0) return <Empty>{empty}</Empty>;

  const peak = bars.find((b) => b.value === top);

  return (
    <div>
      <div className="flex items-end gap-[3px] border-b border-rule-strong" style={{ height }}
           role="img"
           aria-label={`${bars.length} points. Highest ${format(top)} at ${peak?.label ?? ""}.`}>
        {bars.map((b) => (
          <div key={b.label} className="flex-1 flex flex-col justify-end items-center h-full group relative">
            <span
              className="w-full rounded-t-[2px]"
              style={{
                height: `${Math.max(2, (b.value / top) * 100)}%`,
                background: b.muted ? "var(--rule-strong)" : "var(--accent)",
              }}
            />
          </div>
        ))}
      </div>
      <div className="flex gap-[3px] mt-1.5">
        {bars.map((b, i) => (
          <span key={b.label} className="flex-1 t-label tabular text-ink-3 text-center truncate">
            {i % axisEvery === 0 ? b.label : " "}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */

export type Slice = { label: string; value: number; note?: string };

/**
 * The fills a ring is drawn in, by how many slices it has.
 *
 * The one accent and the product's own greys — `palette.py` allows no
 * other saturated colour, and a tint ramp of the accent was measured and
 * rejected (see above). Measured against the ground, not judged: every
 * fill is at least 3.6:1 against it, and every pair that can sit side by
 * side is at least 11 apart in OKLab ΔE (×100), which is clear of the 8
 * a reader with a colour-vision deficiency needs. Three slices take the
 * light and the dark grey, the widest pair; a fourth takes the middle.
 * Past four there is nothing left that separates, so the ring folds the
 * rest into one slice rather than inventing a fifth colour.
 */
const RING_FILLS: Record<number, string[]> = {
  1: ["var(--accent)"],
  2: ["var(--accent)", "var(--ink-2)"],
  3: ["var(--accent)", "var(--ink-2)", "var(--rule-strong)"],
  4: ["var(--accent)", "var(--ink-2)", "var(--ink-3)", "var(--rule-strong)"],
};

/** "61%", and "under 1%" rather than a zero beside a real count. */
function share(v: number, total: number): string {
  if (v === 0) return "0%";
  const p = (v / total) * 100;
  return p < 1 ? "under 1%" : `${Math.round(p)}%`;
}

/**
 * One whole, split into the parts it is made of.
 *
 * Only for a whole: every item counted belongs to exactly one slice, so
 * the slices add up to something a person would say out loud — "of the
 * drafts somebody decided about", "of the enquiries this month". Anything
 * ordered (stages), across time (months, hours) or not additive (reply
 * times, rates) stays with `Funnel` or `Bars`; a pie of those says
 * something false. The centre carries the one number the ring is for.
 *
 * The legend is the chart's text and it is the accessible version: every
 * slice has its name, its count and its share written beside it, so no
 * reader depends on telling two greys apart. Slices with nothing in them
 * stay in the legend at 0, for the reason `Funnel` draws its empty rows.
 * Past `max` the ring folds the smallest into one "everything else"
 * slice; the legend still lists every one of them, marked with that
 * slice's colour, so folding costs the picture detail and the reader
 * nothing.
 */
export function Donut({ slices, empty, caption, centre, centreLabel, max = 4, otherLabel = "Everything else", noteLabel, one }: {
  slices: Slice[];
  /** Heads the notes column, when the notes are a figure of their own. */
  noteLabel?: string;
  /**
   * What to say when there is only one category, instead of a solid
   * ring. Omit it where a single category is still a real split — three
   * named outcomes of which only one has happened yet are drawn, with
   * the other two at 0.
   */
  one?: (s: Slice) => React.ReactNode;
  empty: React.ReactNode;
  caption: string;
  centre: string;
  centreLabel: string;
  max?: number;
  otherLabel?: string;
}) {
  const [hot, setHot] = useState<number | null>(null);
  const total = slices.reduce((n, s) => n + s.value, 0);
  if (slices.length === 0 || total === 0) return <Empty>{empty}</Empty>;
  // One category is not a split. A solid ring reads as a fault — or as
  // a chart with nothing to say — so say the one thing in words.
  if (slices.length === 1 && one) return <p className="text-sm text-ink-2 leading-snug max-w-[56ch] py-2">{one(slices[0]!)}</p>;

  const cap = Math.min(max, 4);
  const folds = slices.length > cap;
  const ring: Slice[] = folds
    ? [...slices.slice(0, cap - 1),
       { label: otherLabel, value: slices.slice(cap - 1).reduce((n, s) => n + s.value, 0) }]
    : slices;
  const fills = RING_FILLS[ring.length]!;
  /** Which ring slice a legend row belongs to. */
  const slot = (i: number) => (folds && i >= cap - 1 ? cap - 1 : i);

  const R = 50, C = 2 * Math.PI * R;
  // A sliver of ground between slices, so two neighbours never merge
  // into one shape. None when one slice is the whole ring.
  const drawn = ring.filter((s) => s.value > 0).length;
  const gap = drawn > 1 ? 2 : 0;
  let start = 0;

  return (
    <figure className="m-0 flex flex-wrap items-center gap-x-10 gap-y-6" aria-label={caption}>
      <div className="relative w-[148px] h-[148px] shrink-0" onMouseLeave={() => setHot(null)}>
        <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90" aria-hidden="true">
          {ring.map((s, i) => {
            const len = (s.value / total) * C;
            const at = start;
            start += len;
            if (s.value === 0) return null;
            return (
              <circle key={s.label} cx="60" cy="60" r={R} fill="none"
                stroke={fills[i]} strokeWidth="18"
                strokeDasharray={`${Math.max(len - gap, 0.6)} ${C}`}
                strokeDashoffset={-at}
                onMouseEnter={() => setHot(i)}
                className="motion-safe:transition-opacity"
                style={{ opacity: hot === null || hot === i ? 1 : 0.3 }}>
                <title>{`${s.label}: ${s.value.toLocaleString()} (${share(s.value, total)})`}</title>
              </circle>
            );
          })}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
          <span className="font-sans font-semibold text-title leading-none text-ink tabular">{centre}</span>
          <span className="t-label text-ink-3 mt-1.5 max-w-[88px] leading-tight">{centreLabel}</span>
        </div>
      </div>

      <ul className="flex-1 min-w-[240px] max-w-[520px] border-t border-rule-strong">
        {noteLabel && (
          <li aria-hidden="true" className="hidden sm:flex items-center gap-3 py-1.5 px-1 border-b border-rule t-label text-ink-3">
            <span className="w-2.5 shrink-0" />
            <span className="flex-1" />
            <span className="w-10 text-end shrink-0">Count</span>
            <span className="w-[68px] text-end shrink-0">Share</span>
            <span className="w-[96px] text-end shrink-0">{noteLabel}</span>
          </li>
        )}
        {slices.map((s, i) => (
          <li key={s.label}
              onMouseEnter={() => setHot(slot(i))} onMouseLeave={() => setHot(null)}
              className={cn("flex items-center gap-3 py-2.5 px-1 border-b border-rule motion-safe:transition-colors",
                            hot === slot(i) && "bg-sunk")}>
            <span aria-hidden="true" className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                  style={{ background: fills[slot(i)] }} />
            <span className="flex-1 min-w-0">
              <span className="block text-sm text-ink truncate">{s.label}</span>
              {/* On a phone the notes column does not fit; the note goes
                  under the name rather than being dropped. */}
              {s.note !== undefined && (
                <span className="block sm:hidden text-note text-ink-3 tabular">
                  {noteLabel ? `${noteLabel}: ` : ""}{s.note}
                </span>
              )}
            </span>
            <span className="text-note tabular text-ink font-medium w-10 text-end shrink-0">{s.value.toLocaleString()}</span>
            <span className="text-note tabular text-ink-3 w-[68px] text-end shrink-0">{share(s.value, total)}</span>
            {s.note !== undefined && (
              <span className="text-note tabular text-ink-3 w-[96px] text-end shrink-0 hidden sm:block">{s.note}</span>
            )}
          </li>
        ))}
      </ul>
    </figure>
  );
}

/* ------------------------------------------------------------------ */

/**
 * ## What is deliberately not here
 *
 * A sparkline and a stat card were written alongside these two and then
 * deleted, because nothing in the product needed either yet.
 *
 * `Stat` would have duplicated a hero number the reports screen already
 * does better — "under a minute" at 40px is the headline, and a card
 * around it would be a frame on a frame. `Spark` had no series short
 * enough to want it: the score history is five days, which is a fact
 * rather than a trend.
 *
 * Both were tidy, general and about forty lines each. Shipping them
 * would have been two more exports with no caller — the shape this
 * codebase has now found nine times, and the one CLAUDE.md asks about
 * directly: **who reads it?** They are a `git revert` away when a screen
 * genuinely wants one.
 */
