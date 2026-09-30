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

**PotatoFarm is not VAT-registered, so it charges no VAT.** Only a
registered business may charge it — collecting VAT without a
registration is an offence, not a rounding question. So the registration
decides the rate: with no `SUPPLIER_TRN`, every invoice carries 0%, no
supplier TRN, and a line saying "No VAT charged — PotatoFarm is not
VAT-registered", so a brokerage's accountant finds a reason rather than
a gap. On the day the FTA certificate arrives, set `SUPPLIER_TRN` and
every invoice from then on carries 5% on the whole supply, with both
parties' TRNs as they stood on the day. A value that is set but not
fifteen digits refuses every invoice: a typo would be printed on each
one, and reading it as "not registered" would stop charging VAT the
business owes.

This used to refuse every invoice until a TRN was set, on the
assumption that the company was registered and the number merely
unconfigured. Unregistered, that meant nobody could be billed at all.

**Registration stops being optional at AED 375,000.** Once taxable
supplies over the previous twelve months exceed it — or are expected to
in the next thirty days alone — the application is due within thirty
days, and VAT not charged after that date is PotatoFarm's to pay. Nobody
adds that up by hand, so `billing.vat-threshold` does, daily
(`vat-threshold.ts`): turnover is the subtotal of every issued invoice
from the last 365 days, and the thirty-day figure is the paying
brokerages' seats at their price plus last month's overage. It emails
`SALES_INBOX` once at each step up — AED 187,500 (voluntary
registration is possible, and costs VAT-registered customers nothing),
AED 300,000 (start the application), and past AED 375,000 (compulsory,
repeated weekly until the TRN is set). An email the mailer could not
send is not remembered as sent. `check:vat-threshold` runs the real job
against a stand-in mailer.

**Invoice numbers are one gapless series for the supplier** —
`PF-000001`, `PF-000002`, never reset. This used to say the opposite,
and was wrong: the sequence Article 59 of the VAT Executive Regulation
asks for belongs to whoever issues the invoice, which is PotatoFarm —
one company, and one TRN once registered — and a gap in *that* series is what an auditor reads as a supply
left off the return. A customer does not need unbroken numbers; the
supplier does. The series is a counter row incremented inside the
invoice's own transaction (`InvoiceSequence`), so a failed invoice gives
its number back — a Postgres sequence would not.

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

## Decided: charged per person on the team, with no minimum

Sign-up refuses fewer than eight agents, and billing charges only for the
people actually on the team. That is deliberate. The website promises
"pro rata for the days they use" and "no minimum term"; charging for eight
seats a brokerage has not filled would break the first and quietly
become the second. The eight is advice about who the product suits, not
a floor on the bill.

## Not built

- ~~**The invoice itself, as a document.**~~ **Built.** Settings →
  Billing → an invoice → "Open the invoice to print or save" is the
  document a brokerage files, printed or saved as a PDF from the browser
  rather than by a PDF library whose copy could disagree with the screen.
  Both parties' names and addresses are written onto the invoice the day
  it is issued (`supplierName`, `customerAddress`…), like the TRNs, so a
  rename or an office move changes the next invoice and never an old one.
  It reads "Tax invoice" only when it carries PotatoFarm's TRN. An owner
  sets the billing address and TRN on the billing page — the TRN could
  only be given at sign-up before, where it is optional. PotatoFarm's side
  comes from `SUPPLIER_NAME` and `SUPPLIER_ADDRESS`; once registered, the
  boot log names a missing address, which a tax invoice requires.
  `check:billing`.
- ~~**Keeping invoices.**~~ **Done.** `Invoice` cascaded from
  `Subscription`, so removing a subscription row took its invoices with
  it — five years' tax records and a hole in the supplier's series, in
  one statement. The foreign key is `RESTRICT` now
  (`20260930090000_invoice_restrict`) and `check:billing` asserts the
  database refuses.
