# Requirement matching

We already capture budget, intent and timeframe in conversation and then
do nothing with it. This turns that into the one thing nobody else in
this market is doing: **messaging a buyer first, on WhatsApp, when
something they actually wanted comes up.**

## Scoring: generous on price, strict on the rest

A buyer who said "around 2.5" will happily look at 2.7. A buyer who said
three bedrooms will not look at one, and sending them one tells them the
system is not listening — which is worse than sending nothing, because it
poisons every message after it.

So bedrooms below the stated number, the wrong purpose, and anything more
than 20% over budget are **hard disqualifications**, not low scores.

Caveats are said out loud. "It's about 8% over what you mentioned" is a
message from somebody paying attention. Hiding it is pointless — they see
the price immediately and then wonder what else was glossed over.

## One match, not five

`best()` returns a single listing, and only above 0.75. Five mediocre
matches is a mailshot, and a buyer who receives one stops reading
everything that follows. One good one is a reason to reply.

## Restraint is the whole product

Done badly, proactive outbound gets your number reported and your
WhatsApp Business account restricted — which takes the entire brokerage's
lead flow with it. That is not theoretical; Meta acts on user reports.
Every rule here protects that number as much as the recipient.

A message is only sent when **all** of these hold:

| Rule | Why |
|---|---|
| Not opted out | Nothing else matters |
| Status is not won, lost or unresponsive | Someone who has already ignored us is not a target |
| Not messaged in 14 days | However good the match |
| They have replied to us at least once | A lead mid-first-conversation is not a target |
| Quiet for under 120 days | Older than that and the basis has gone stale |
| Between 9am and 8pm local | A property alert at 3am is a reason to block a number |

Twelve tests cover those, and they are the tests I would keep if I had to
throw the rest away.

## The 24-hour window, again

A match message almost always goes to somebody who last wrote days ago,
so free-form is accepted by Meta and never delivered. These go as
approved templates, and the template carries the opt-out — which is both
the decent thing and what keeps the number out of trouble.

## Opt-out is a field, not a note

`optedOutOfOutreach` is separate from the conversation on purpose.
Somebody who says stop to property alerts still expects a reply when they
ask a question. Conflating the two means you either keep spamming them or
go silent on a live enquiry, and both are bad.

**"Stop" works on the first message**, honoured in the inbound path
before anything else runs — no confirmation step, no human in between. A
stop that takes a day is not a stop.

## Requirements are a record, not fields on the lead

One person routinely wants two different things — "a two-bed to live in,
or a studio to let out" — and a single set of columns cannot hold that
without lying about one of them. Communities are alternatives: "Marina or
JBR" is one requirement, not two.

Must-haves disqualify; nice-to-haves only move the score. Keeping them
apart is what stops a system sending a one-bed to somebody who said three
and calling it a partial match.

## The trust gate

The rule that links this back to the extraction work:

> **A requirement the assistant guessed does not trigger an outbound
> message.**

The extractor already scores its confidence per field and flags anything
under 0.7. Proactive contact is a higher bar than an internal note,
because getting it wrong means messaging somebody about a property they
never asked for — the exact behaviour that gets a number reported.

So an agent-entered or explicitly-stated requirement can drive outreach.
An inferred one needs **0.85 or a human confirmation**, and until then it
only sits on the lead's file for somebody to look at.

Eight tests cover that gate.

## Requirements expire

Four months for a purchase, two for a rental — shorter than feels
natural, deliberately. Somebody who was looking six months ago has
usually bought, and messaging them then is a message that says nobody
here has been paying attention. Any inbound message refreshes it, because
they are evidently still looking.

## The job

Runs once a day at 10am local, and **only against listings that went live
in the last 24 hours**. Matching against the whole inventory means the
first run messages everybody about everything, which is precisely the
behaviour this whole module exists to avoid.

Not hourly. A buyer does not need to know within the hour, and a job that
can message people should run as seldom as it usefully can.

Sending goes through the normal outbound path, so the template rule, the
usage ledger and the audit trail all apply. **There is no separate
marketing pipe that bypasses them** — that shortcut is how a product ends
up with two sets of rules and only one of them enforced.

## Not built yet

- Reply handling. A buyer who answers "yes book me in" should get a
  viewing held, not a generic assistant turn.
- Preference scoring. `preferences` is stored; nothing reads it yet.
