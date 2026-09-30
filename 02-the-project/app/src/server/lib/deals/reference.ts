/**
 * A deal's reference: its property's, and a suffix after the first.
 *
 * A deal takes the listing's reference so it is findable by the string an
 * agent already says on the phone, and `Deal` is unique on
 * `(orgId, reference)`. Taken as it came, the *second* deal on a property
 * — the first fell through, the property went back on the market, a new
 * offer was accepted — collided with the first, and accepting that offer
 * answered 500 inside the transaction, so the agent could not accept it
 * at all. Found by CI, where an earlier check had already made a deal on
 * the property the next one used.
 *
 * So the first deal is `MG-202`, the next `MG-202-2`, then `MG-202-3`:
 * still found by searching `MG-202`, and never the same as another.
 * `taken` is every reference in the brokerage that starts with this one.
 */
export function nextDealReference(listingRef: string, taken: Iterable<string>): string {
  const used = new Set(taken);
  if (!used.has(listingRef)) return listingRef;
  for (let n = 2; ; n++) {
    const candidate = `${listingRef}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
}
