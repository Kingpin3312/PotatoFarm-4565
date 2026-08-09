# Documents

## Why this exists as its own module

The same idea had grown in three places: `KycDocument`, the permit fields
on `Listing`, and the `requires` list on a deal milestone. Three
implementations of "a file that expires and somebody needs telling about"
is two too many, and the third one is always the one nobody wired to an
alert — which is exactly what had happened.

`KycDocument` stays separate on purpose. An AML file has its own
retention rules and its own access controls, and folding it in here would
weaken both.

## Three documents stop business when they lapse

And all three fail the same silent way — nothing errors, a transaction
simply cannot proceed, and somebody finds out on the day it matters.

| Document | Consequence |
|---|---|
| Trakheesi permit | Listing pulled, brokerage advertising illegally |
| **RERA broker card** | That agent cannot legally act on a transaction. If it lapses mid-deal, the deal is exposed |
| Brokerage licence | Nobody can transact |

The broker card is the one most likely to catch somebody out, because it
belongs to a person rather than to a property, and nobody is looking at
it.

## Lead times come from renewal turnaround, not round numbers

Warning somebody 30 days before a renewal that takes 45 is warning them
too late while looking helpful.

- **Broker card: 60 days.** Renewal involves training hours and a test
  slot. Sixty is the minimum that leaves room to actually do it.
- **Brokerage licence: 90 days.**
- **Trakheesi permit: 14 days.**
- **NOC: 7 days**, because there is no renewal — you apply again, and the
  transfer has to complete inside the validity.

## Grouped per recipient, not per document

An admin with eleven agents whose cards expire in the same quarter gets
**one** message about eleven cards. Eleven messages is how somebody turns
notifications off, and then misses the twelfth.

The summary leads with the worst item. Opening with a passport when a
broker card has already lapsed buries the thing that matters.

Different documents go to different people — a client's passport is the
compliance officer's problem, a permit is the agent's, a licence is the
owner's. Sending everything to everybody is the same failure as sending
eleven messages.

## Not built yet

- Enforcement. `blocking` is declared; nothing yet stops a deal
  progressing when the agent's card has lapsed. That is the obvious next
  step and the one with teeth.
- Supersede on upload. The field exists so a renewed document replaces
  rather than duplicates; the upload path does not set it.
