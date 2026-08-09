# Migration

The last item from the Reapit read, and the one with the most commercial
weight. They quote **six weeks, a named customer success manager and
regular check-ins** — and that is not a feature list, it is a recognition
that migration is what actually decides whether somebody switches.

Our onboarding assumed a brokerage starts from nothing. Every real
customer is coming off something else.

## What they are actually frightened of

Not losing records. **Losing their position.**

A brokerage switching mid-month has live transactions in flight. A deal
sitting at NOC stage that arrives here as a new lead has lost six weeks
of work — and, more to the point, the agent no longer trusts the system
on day one. Everything after that is uphill.

So open deals are treated as the hard case, not contacts.

## Nobody has clean data

Every export contains duplicate contacts, dead numbers, leads owned by
agents who left two years ago, and one column somebody used for three
different things.

There are two ways to get this wrong and most migrations pick one:

- **Import it faithfully** and you have reproduced the mess, and they now
  blame your system for it.
- **Clean it silently** and they cannot trust anything, because they do
  not know what you changed.

So everything is surfaced and nothing is silently fixed. Duplicates are
flagged with a suggestion, not merged. An unknown owner — usually someone
who has left, and the reason a migrated pipeline looks like nobody owns
anything — waits for a person.

Seven tests, including the one that earns its place: **the same number in
four different formats is one person**, and gets flagged as a duplicate
rather than imported four times.

## The step that matters is the boring one

`RECONCILED` has one exit criterion that is worth more than the rest put
together:

> Someone at the brokerage has opened ten leads they know well and
> confirmed them.

**Nobody signs off on a total.** "4,182 contacts imported" means nothing
to an owner. Ten records they personally remember, checked and correct,
is what makes them believe the other four thousand.

## Both systems will be live for a fortnight

Nobody switches on Tuesday and forgets the old system on Wednesday. During
that fortnight every portal enquiry arrives twice, and if that is not
planned for, the first week on the new system is a week of duplicates and
they conclude it does not work.

Suppression is keyed on the source's own identifier where there is one,
and on phone plus listing plus day where there is not — which is not
perfect, and is stated as such rather than presented as certainty.

## Rollback, answered properly

The question every brokerage asks and most migrations answer with a
shrug. The answer here is deliberately boring: the export is archived,
the old system was never switched off, and **cutover deletes nothing
anywhere**.

Going back is therefore a decision rather than a recovery — which is the
point, because a rollback that needs a recovery is one nobody will risk
asking for.

## What the tool does, and what it does not

Stated in `HONEST_SCOPE`, because implying a button does this is how the
second week goes badly.

**The tool**: reads the export, maps the obvious fields, finds the
duplicates and dead numbers and unknown owners and unmapped stages,
stages everything, counts it against what the source claimed, and
suppresses duplicates during parallel running.

**A person**: decides the mappings the tool cannot, sits with the
brokerage while they check ten leads they know, agrees what happens to
the leads of departed agents, and is on the phone in the first week.

Realistically two to three weeks for a few thousand contacts — **most of
it waiting on decisions rather than on the import.**

## Not built yet

- Source adapters. The inspection works on generic rows; nothing yet
  knows the shape of a PropSpace or Goyzer export specifically.
- Conversation history. Notes and call logs can come across. WhatsApp
  history from another system largely cannot, and saying so early is
  better than discovering it at cutover.
