import { cn } from "@/lib/cn";

/**
 * The four shapes this product draws, and nothing else.
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
            <span className="text-note tabular text-ink font-medium w-8 text-right shrink-0">
              {r.value}
            </span>
            <span className="text-note tabular text-ink-3 w-[86px] text-right shrink-0 hidden sm:block">
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
      <div className="flex items-end gap-[3px] border-b border-ink" style={{ height }}
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
