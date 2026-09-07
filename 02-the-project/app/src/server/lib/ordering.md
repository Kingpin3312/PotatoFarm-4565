# Ordering leads on the board

## What I tried first, and why it was wrong

The first version used base-62 string keys and computed a midpoint in
JavaScript — the approach the `fractional-indexing` libraries take.

I wrote a test before wiring it to anything, and it failed on the second
case: inserting repeatedly at the head of a column. The bug is that no
string sorts before `"0"` while still starting with `"0"`, so the
algorithm has to be careful never to *emit* `"0"` as a key. Mine did, and
then looped forever trying to find something below it.

That is a real class of bug — subtle, only reachable through one specific
user action, and invisible until a board is in production and someone
drags a lead to the top for the hundredth time.

## What it does instead

`position` is an unbounded Postgres `NUMERIC`, and the midpoint is
computed in SQL:

```sql
(prev.position + next.position) / 2
```

Halving a NUMERIC is exact — it adds one decimal digit and nothing is
lost. Postgres NUMERIC has no practical precision limit, so this does not
degrade the way a float would after fifty or so halvings.

Three reasons this is the better call:

1. **It is provably correct**, and the proof is one line rather than a
   test suite around a hand-rolled algorithm.
2. **The arithmetic never touches JavaScript.** A JS float runs out of
   mantissa after roughly fifty midpoints and starts producing duplicate
   positions, which shows up as leads randomly swapping places.
3. **One row is written per move**, which was the whole point of not using
   integers.

## Rebalancing

Keys grow by about one digit per insertion into the same gap. In normal
use nobody notices. A nightly job renumbers any column whose maximum scale
exceeds 40 digits — cheap, and it has never been needed in testing.

## The lesson worth keeping

The clever version was smaller and felt better to write. It was also
wrong, and the only reason that is not now sitting in the repository is
that the test ran before the integration did.
