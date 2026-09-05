# Billing

## The promise that shaped it

The pricing FAQ on the site already says:

> "Pro rata for the days they use, added to the next invoice. Removing
> them works the same way."

That was written before any of this existed. It constrains the design
more than it looks.

Counting seats at month end would overcharge a brokerage that lost three
agents on the 2nd and undercharge one that hired four on the 3rd. Agents
move between agencies constantly here — that is not an edge case, it is
most months.

So seats are an **append-only ledger of changes**, and invoices are
computed from seat-days. Exact, explainable, and it survives somebody
asking why this month is different from last.

Verified against six hand-computed cases including churn in both
directions within one period, and a February that is 28 days rather than
an assumed 30. Deriving the daily rate from 30 means February is quietly
more expensive per day than March, and somebody eventually notices.

## Two things specific to selling here

**UAE VAT is 5%, and a valid tax invoice needs both parties' TRN.** A
brokerage that cannot reclaim the VAT because the invoice was malformed
will ask for it to be reissued, every month, forever.

**Invoice numbers are sequential per brokerage and gapless.** A tax
authority expects them not to skip. A random id, or a global counter,
leaves every customer's sequence full of holes — which is a conversation
nobody wants during an audit.

Everything is in fils. Money in a floating point number is how a customer
ends up with a bill for 0.30000000000000004.

## When a payment fails

The principle the whole dunning ladder is built on:

> **A brokerage's own customers must never be able to tell there is a
> billing problem.**

A buyer messaging at eleven at night should not hit silence because a
card expired. If they do, the brokerage loses a deal worth many multiples
of the invoice, and they will remember that far longer than they remember
paying us.

Cutting off lead handling to force payment is the cheapest short-term
lever available and the most expensive long-term one.

So degradation runs **inwards**. What stops first is what only the
brokerage sees:

| Overdue | What stops | What still works |
|---|---|---|
| Day 0 | Nothing | Everything |
| Day 7 | Adding agents | Everything else |
| Day 14 | Publishing to portals, reporting | Inbox, assistant, replies |
| Day 30 | The assistant | Enquiries still arrive, agents still reply |

The assistant is last because it is the only restriction a lead can
notice. Thirty days is long enough that it is a decision rather than an
accident, and by then somebody has spoken to them.

Nothing on this ladder deletes data, blocks the inbox, or stops an agent
replying by hand. Those are never on the table.

## Exports are restricted, never removed

A brokerage in a billing dispute is exactly the brokerage most likely to
want their data out. Holding it hostage over an invoice is indefensible,
and under most data protection regimes unlawful. Bulk export moves behind
a support request rather than disappearing — slower, still guaranteed.

## One detail in `settle`

Paying an invoice only restarts the assistant if **billing** was what
paused it. A brokerage that stopped it themselves last Tuesday because it
quoted a wrong price must not have it silently restarted by an unrelated
payment going through.

## Taking the money

**No card data ever reaches this system.** Not the number, not the CVV,
not a truncated PAN. The provider holds the card and gives us a token.
That keeps the whole product outside PCI scope, which is the difference
between an annual questionnaire and an audit.

Stripe first because it works in the UAE and the tooling is good. Telr,
PayTabs and Network International are the local alternatives and some
brokerages will prefer one — which is why everything provider-specific
sits behind one interface and nothing above it knows which is in use.

### Three things the webhook gets right

**Signature verified against the raw body.** Parse first and it will
never match, because JSON round-tripping changes bytes. An unverified
payment webhook lets anyone who finds the URL mark invoices paid.

**Events are processed once.** The provider's event id is a unique
column, so a redelivery inserts nothing and does nothing.

**A declined card is not retried.** Retrying a decline adds records to
the customer's bank statement and can get the card flagged by their bank.
Network failures are retried; declines are reported.

### Reconciliation is the part most systems skip

Webhooks get lost. An endpoint has a bad minute, a deploy drops a
request, a provider gives up after its retries.

If the webhook is the only path, **a customer who paid stays restricted**
— they paid and got punished for it, and they find out by ringing you.
That is the worst failure this system can produce and it is entirely
preventable.

So the provider is asked directly, daily, about everything we still
believe is unpaid. It is cheap, and it is the difference between a
billing system that mostly works and one that can be trusted.

It runs one way only: it can mark something **paid**, never unpaid.
Marking a settled invoice back on the strength of a confused API response
would restrict a customer who owes nothing.

Invoices marked paid with no provider reference are counted and reported,
never corrected. A wrongly-paid invoice is a conversation, not a job's
decision.

## Still yours to decide

The seat price. `seatPriceFils` is stored on the subscription rather than
looked up from a price list, so a future price change never silently
reprices an existing customer — but the first number has to come from
you, and it is the same number that has to go on the pricing page.
