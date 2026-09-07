/**
 * Money.
 *
 * **Everything is BigInt fils.** 1 AED = 100 fils. There is one formatter
 * and it lives here.
 *
 * There were five separate formatters before this file existed, two of
 * which assumed the value was already in AED. That is how a board ends up
 * showing a buyer a property at a hundred times its price, and the bug
 * looks like a data problem rather than a formatting one.
 */

/** Full precision. AED 2,500,000.00 */
export function aed(fils: bigint | null | undefined): string {
  if (fils === null || fils === undefined) return "—";
  return `AED ${(Number(fils) / 100).toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

/**
 * Whole dirhams. AED 2,500,000
 *
 * A property price, quoted to a person. Nobody says the fils on a flat,
 * and `.00` on the end of a seven-figure number reads as a system that
 * has not been thought about.
 *
 * It is here rather than inline at the one call site that wanted it,
 * because "inline at the one call site that wanted it" is how there came
 * to be five of these — and two of the five assumed the value was
 * already in AED, which is how a board shows a buyer a flat at a hundred
 * times its price.
 */
export function aedWhole(fils: bigint | null | undefined): string {
  if (fils === null || fils === undefined) return "—";
  return `AED ${(Number(fils) / 100).toLocaleString("en-GB", {
    maximumFractionDigits: 0,
  })}`;
}

/** Compact, for cards and lists. AED 2.5M */
export function aedShort(fils: bigint | null | undefined): string {
  if (fils === null || fils === undefined) return "—";
  const value = Number(fils) / 100;
  if (value >= 1_000_000) return `AED ${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `AED ${Math.round(value / 1_000)}k`;
  return `AED ${value.toFixed(0)}`;
}

/**
 * Whole dirhams as a bare number, for a machine. `2500000`
 *
 * Not for a screen — there is no currency word, no separators and no
 * decimal, because the only readers are portal feeds and exports whose
 * element already declares the currency: `<price currency="AED">`.
 *
 * It lived as a private `function aed()` inside `portals/feed.ts`,
 * which is the hazard rather than the output. That output is correct;
 * the *name* is not. `aed(l.priceFils)` in that file returned
 * "2500000" while the identical call in every other file returns
 * "AED 2,500,000.00", so moving one line between two files silently
 * changed what a portal receives — in the one place where being wrong
 * is invisible, because a feed rejection names only the first offending
 * listing and looks like a quiet market.
 *
 * `money.ts` exists because there were five formatters and two of them
 * assumed AED. A sixth, shadowing the name of the first, is that bug
 * with better manners.
 *
 * Truncates rather than rounds, as the original did: BigInt division
 * discards the fils. A property price is whole dirhams, so the case
 * does not arise, and a portal is better served by a number one dirham
 * low than by a decimal it may not accept.
 */
export function aedPlain(fils: bigint | null | undefined): string {
  if (fils === null || fils === undefined) return "";
  return String(fils / 100n);
}

/** Only at a boundary — an import, or a person typing a number. */
export function aedToFils(aedValue: number): bigint {
  return BigInt(Math.round(aedValue * 100));
}

export function filsToAed(fils: bigint): number {
  return Number(fils) / 100;
}

/**
 * The dollar side.
 *
 * We price in USD and invoice in AED. That is not a fudge — the dirham
 * has been pegged at 3.6725 since 1997, so the two figures are the same
 * number in two hats and neither drifts.
 *
 * The reason the invoice stays AED: UAE VAT is levied in dirhams, and a
 * tax invoice denominated in another currency is one an accountant sends
 * back. The reason the headline is USD: it is the currency a brokerage
 * owner compares software in.
 */
export const AED_PER_USD = 3.6725;

export function usd(fils: bigint | null | undefined): string {
  if (fils === null || fils === undefined) return "—";
  const dollars = Number(fils) / 100 / AED_PER_USD;

  /**
   * Decide "are there cents" on the figure being *shown*, not the raw
   * float, and the difference is not academic.
   *
   * This read `dollars % 1 === 0`. Dividing by the peg almost never
   * lands on a whole number, so the branch was very nearly dead: the
   * product's own price round-tripped through `usdToFils(70)` comes back
   * as 70.00136…, which is not `% 1 === 0`, so "$70" printed as
   * "$70.00". Rounding to the two decimals the formatter is going to
   * show anyway makes the test ask the question the comment claims it
   * asks.
   */
  const shown = Math.round(dollars * 100) / 100;
  return `$${dollars.toLocaleString("en-GB", {
    minimumFractionDigits: shown % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })}`;
}

/** Both, for anywhere a price is quoted rather than charged. */
export function priced(fils: bigint | null | undefined) {
  return { usd: usd(fils), aed: aed(fils) };
}

export const usdToFils = (dollars: number) =>
  BigInt(Math.round(dollars * AED_PER_USD * 100));
