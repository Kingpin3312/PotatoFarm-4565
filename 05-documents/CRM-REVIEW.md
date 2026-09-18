# CRM — the honest position before deployment

You said we deploy today. **The CRM cannot deploy today, and I would be
useless to you if I let that pass.**

## Why not

It has never been compiled. Not once. `npm run typecheck` has not been
run against it, because there has been no machine to run it on. It is a
complete, carefully reviewed design written in code, and the first
command anyone runs against it will produce real errors — `PRE-FLIGHT.md`
lists what I know about and there will be more.

Between here and a deployment sit, at minimum:

- A first compile — a few hours, tedious, mechanical
- A database with row-level security applied and **proven** by test
- One route working end to end
- Stripe keys, a verified UAE account, and a price

Realistically that is a week with a competent developer, not a day. Any
other answer is one I would be giving you to be agreeable.

## What the review found, and it is the important part

**The product could not take money from anyone.**

Not a bug in billing — billing was excellent. There was no way for a
customer to exist. No organisation creation, no sign-up, no subscription,
no trial, no card. Zero files for each.

Every previous audit had asked *is this correct*. None had asked *can
this earn*. That is the gap in the review process as much as in the code,
and it is worth remembering: seven scripts checking correctness will
never tell you the business model is unimplemented.

That is now built —
`src/server/lib/billing/MONETISATION.md` has the detail.

## What deploys today

**The website.** Finished, ten pages, zero failures across three audits,
share cards, icons, a 404. It is the thing that starts conversations, and
conversations are what you actually need this week.

## What I would do with the next seven days

**Today.** Deploy the site. Set the price — it is one number and it is
the last thing blocking sign-up.

**Tomorrow.** Send the repo to your contractor with `CLAUDE.md`,
`PRE-FLIGHT.md` and the three review documents. Ask for one thing: a
clean typecheck and one working route. Not features.

**This week.** Ring brokerage owners. The site is now good enough that it
will not be why any of them says no.

**Next week.** Whichever owner says yes goes on a trial. The fourteen
days start the moment the CRM runs, and the baseline week is the demo.

## The one number that matters

Everything in this project now waits on the same thing it has waited on
for a fortnight: **one brokerage using it.**

The code is as good as review can make it. Seven audit scripts, three
formal reviews, and today a fourth that found the business model missing.
The next real defect will be found by an agent in a car park, and no
amount of scrutiny from me substitutes for that.
