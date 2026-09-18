# Observability

## Health is per tenant, not per service

Ordinary monitoring tells you the servers are up. It does not tell you
that Marina Properties' WhatsApp token expired three hours ago and nobody
has answered a lead since.

Every dashboard green, the product entirely broken for one customer, and
the first you hear of it is a phone call. In a multi-tenant product the
unit of failure is the tenant, so health is composed per brokerage out of
the detectors already built elsewhere.

`allTenants()` sorts worst-first. That is the morning check.

Each result answers one question: **is this customer's system actually
working right now.** And each failing check carries an `action` written
for a support engineer — what to do about it, not what the code saw.

## The check that matters most

`backlogCheck` is the only one that measures the symptom rather than a
cause. Everything else — token expired, feed silent, assistant stopped —
is a reason. This one counts people who have been waiting over an hour
for a human reply and nobody has answered.

It also separates out the ones past the 24-hour WhatsApp window, because
those are not merely late. They cannot be messaged at all without a
template, so the advice is different: a template or a phone call, not
"reply sooner".

## "Off on purpose" is not a fault

The assistant being deliberately stopped shows as degraded with the
reason attached, and the action distinguishes billing from somebody
having pressed stop on Tuesday. Reporting an intentional state as a fault
is how a health page trains people to ignore it.

## Logging

Two rules, and the first is not negotiable.

**Nothing personal reaches a log.** This system handles buyers' phone
numbers, budgets and private messages. Logs get shipped to third parties,
kept for months, and read by people with no business reading a buyer's
conversation. A phone number in a log line is a data breach with a long
fuse.

Scrubbing works on field names *and* on patterns inside free text,
because the number that escapes is never the one in the field called
`phone` — it is the one somebody pasted into an error message. Tested
against seven cases including a number inside a sentence, an email inside
a note, and a card-length digit string.

**Every line carries the tenant.** The useful question during an incident
is never "what happened", it is "what happened to this customer". A log
you cannot filter to one brokerage is a log you read once and give up on.

## The liveness endpoint is deliberately shallow

`/api/health` checks that this instance can reach the database and
nothing else. A health check that tests every downstream dependency fails
whenever a third party has a bad minute, the load balancer pulls healthy
instances out of rotation, and somebody else's small outage becomes a
full one here.

Tenant health is a different question, on a different endpoint, and it is
authenticated because it contains customer names.

## Still missing

- **Alerting.** The checks exist; nothing yet pages anyone at 3am. Wire
  `allTenants()` to whatever you use, and alert on `broken` only —
  alerting on `degraded` will produce noise within a week.
- **Trace ids across the request.** `requestId` is in the log context but
  nothing populates it yet.
- **Queue depth**, once there is a queue.

## Alerting

The rule that decides severity, and it is not the obvious one:

> **Page only for things a human can actually fix at three in the
> morning.**

A brokerage's WhatsApp token expiring at 11pm on a Saturday is genuinely
costing them money right now. Waking an engineer does not help — the fix
is the *customer* re-authorising the number, and nobody is going to ring
a brokerage owner at midnight to ask. So it is a ticket and a phone call
at eight.

A database that is unreachable is a page, because somebody can do
something about it in the next ten minutes. A cron that has stopped is a
page, because everything downstream of it is silently not happening.

Getting this wrong is worse than it sounds. An on-call rota woken three
times a week for things they cannot fix stops reading the pages, and then
the one that mattered goes unanswered too.

### Three things that keep it usable

**Two consecutive detections before anyone is told.** A check that runs
every five minutes must not produce an alarm every five minutes, and a
blip that resolves itself should never have woken anybody.

**Alerts close themselves and say so.** A system that opens alerts but
never closes them teaches people that a long list is normal, which is the
same as having no list.

**Every alert carries a runbook line** written for whoever is holding the
phone at the time — what to do, not what the check saw. The WhatsApp one
says explicitly not to attempt the fix on the customer's behalf without a
support grant.

### The gap that cannot be closed from inside

If the alerting job itself stops running, nothing here will say so. A
monitor cannot report its own absence. That needs an external heartbeat —
a third-party check that expects a ping every five minutes and shouts
when it stops arriving. It is the one piece of monitoring that has to
live outside this system, and it is about ten minutes of setup.
