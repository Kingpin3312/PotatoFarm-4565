# Monetisation review

## The finding

The billing module could compute seat-days exactly, raise a VAT-correct
invoice, chase it through a dunning ladder and reconcile against Stripe.

**It could do all of that for a customer no code path was capable of
creating.**

Searched, not assumed:

| | Files |
|---|---|
| Organisation creation | **0** |
| Sign-up | **0** |
| Checkout or card collection | **0** |
| Subscription creation | **0** |
| Trial handling | **0** (schema only) |

A system that can invoice but cannot acquire earns nothing. This was the
largest commercial defect in the product and no previous audit had looked
for it, because every audit had been about correctness rather than
revenue.

## What now exists

**Sign-up in one transaction.** Organisation, owner membership,
subscription and the first seat event together. Separately, each failure
leaves a state you only discover months later — an organisation with no
owner is unreachable, and one with no subscription is invisible to every
billing job and runs free forever.

**A fourteen-day trial, no card.** That is a commercial choice worth
defending: taking a card up front raises conversion on paper and destroys
the pilot. Our entire argument is *"we measure your response times for a
week before switching anything on"*, and a brokerage cannot do that
honestly while worrying about being charged. Fourteen rather than thirty
because a brokerage that has not decided in a fortnight has not adopted
it, and a long trial hides that from both sides.

**Card collection via SetupIntent.** No card data touches this system —
Stripe's iframe collects it and returns two strings. That keeps the
product outside PCI scope, which the security page already claims, so the
code had to make it true. A SetupIntent rather than a PaymentIntent
because during a trial there is nothing to charge yet.

**Confirmation from the webhook, not the browser.** A client saying "it
worked" can be wrong, offline, or closed mid-redirect, and a trial that
converts on that basis is a customer we cannot charge.

**Trials end on a schedule.** Without the sweep, every trial ran forever.
That single missing job was the difference between a business and a free
service.

## Three decisions that will look soft and are not

**A lapsed trial stops the assistant and keeps the data.** They keep the
inbox, every lead, and full export. They lose the thing they were not
paying for. Deleting data or locking someone out of leads they generated
converts a maybe into a never, and is probably unlawful anyway.

**A card added mid-trial does not end the trial early.** They get the
days they were promised. Charging on the day the card arrives is
technically defensible and would be the last time that brokerage
recommended us.

**The running total is shown live**, not at month end. A brokerage that
adds four agents on the 3rd sees the bill move that day. Surprise
invoices are how a good product loses a customer over forty dirhams.

## Refused rather than defaulted

`signup` throws if `SEAT_PRICE_FILS` is not set. **There is no default
price**, because a default is how a brokerage ends up on a number nobody
chose — and the price is still the one decision outstanding since this
project began.

Sign-up is closed until you set it. That is deliberate.

## Now complete

1. **The price.** $70 per agent per month, invoiced in dirhams at
   AED 257.08 plus 5% VAT. `SEAT_PRICE_FILS=25708`.
2. **Rate limiting on `signup`.** Database-backed, not in-memory —
   in-memory means "per serverless instance", which on this platform
   means no limit at all. Two windows: a short one stops a burst, a long
   one stops the patient script somebody writes after hitting the short
   one. Keyed on IP **and** email independently, because an IP alone
   punishes a whole office behind one NAT and an email alone is trivially
   varied.
3. **`setup_intent.succeeded`.** Handled in the webhook rather than the
   browser. Plus `payment_method.detached` — **not** treated as a
   cancellation, because a brokerage whose card expired has not left, and
   the dunning ladder gives them fourteen days and three emails first.
4. **A sign-up page.** Four fields, all of them used. No "how did you
   hear about us", no phone number we will not ring. A form that asks for
   what it does not need tells a brokerage owner what the next two years
   will be like.

Below the minimum seat count it says so **before** the button rather than
after. Being told you are too small at the last step is worse than being
told before you filled anything in.

## Still needed from you

**Stripe live keys**, and the account verified for the UAE. That is the
last thing between this and a payment.
