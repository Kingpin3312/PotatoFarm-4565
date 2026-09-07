# Listing copy

Taken from Reapit — "create market-ready property descriptions at the
click of a button, customise attributes and adjectives to match the way
you write."

Cheap, obvious, and entirely on-brand for us: we already run a model that
has been taught a brokerage's tone. Writing a description in that voice
is a smaller problem than the one we have already solved.

## The same rule as the assistant

**Only facts that are on the record.**

A description is an advertisement, the Trakheesi permit ties that
advertisement to the brokerage, and a claim that cannot be substantiated
is a misrepresentation rather than a bit of enthusiasm.

So the facts are rendered as an explicit block, exactly as for the
assistant, and the prompt says plainly: an adjective you cannot point at
in the facts is a claim. The model cannot decide the kitchen is "recently
refurbished" because that is the sort of thing kitchens are.

Agent notes are treated as fact, because a person who has actually stood
in the property is a better source than a database row.

## Portal rules are rejections, not style preferences

No contact details, no URLs, no block capitals, no guaranteed returns, no
comparisons to named competitors. A listing that breaks them is refused —
and, as with everything else in this product, **the rejection is silent
from the brokerage's side**. The listing simply never appears.

Nine tests cover the checks, including one that matters more than it
looks: **a legitimate acronym survives.** A shouting detector that flags
"DIFC" is a detector somebody switches off.

## The loop that was not designed on purpose

The feedback module counts `NOT_AS_ADVERTISED` as a reason a viewing
failed, and two of those produces a listing signal in the vendor report.

So the system that writes the copy is measured by the system that
collects what buyers thought of it. A description that oversells shows up
within a fortnight as "the listing is overselling it — worth reshooting
the photos and rewriting the description", without anybody having to
notice.

Those two modules were built a day apart for unrelated reasons. Worth
keeping, because it is the only feedback loop in the product that catches
the model being flattering rather than wrong.

## Never published automatically

Same position as KYC collection: **the model drafts, a person
publishes.** A description that goes live without anybody reading it is
an advertisement nobody checked, attached to a permit in the brokerage's
name.

## Not built yet

- Arabic. The prompt takes a language and the portals reward having both;
  nothing yet generates the pair.
- Learning the house tone from listings the brokerage already wrote,
  rather than from a tone field somebody filled in once.
