# Task plans

Taken from Reapit, where it is called Task Plans and flagged as
CRM-exclusive — which tells you they consider it a differentiator.

## The gap it fills

A lead who says *"we're looking in about six months"* was, until now, a
note in a field. Notes do nothing.

In this market a meaningful share of enquiries are six to twelve months
out, and the agency still politely in touch at month five wins them. That
is not a CRM feature, it is the whole business, and we had no way to
express it.

## Ours can be better than theirs, for one reason

Their prompts nudge an **agent** to do something. Ours can just do it, in
the conversation that is already open.

That is also what makes it most likely to become obnoxious, so three
rules matter more than the sequencing does.

### 1. A reply pauses the plan. It does not advance it.

Somebody who has written back is now in a conversation with a person, and
a sequence continuing underneath that conversation is how a brokerage
sends "just checking in!" to a buyer who is mid-negotiation.

Restarting is a deliberate act by an agent. Never automatic.

### 2. Plans use the same outbound rules as everything else

Same frequency cap, quiet hours, opt-out and template requirement as a
match alert. A sequence with its own sending rules is spam on a schedule,
and two sets of rules means only one of them stays enforced.

### 3. `CHECK_MATCHES` only sends when something actually fits

This is the step that makes it ours rather than a copy. It runs the
matcher and sends **only if there is a genuine match**. A scheduled
message that arrives whether or not there is anything to say is the
definition of a nurture sequence nobody reads.

If nothing fits, it stays quiet and waits for the next step. Silence is a
valid outcome.

## The worked example

`LONG_HORIZON_BUYER` — six touches across five months for somebody who
said "around six months". None of them are "just checking in": three are
property matches that only go if there is a property, one is a market
note, one is a prompt for an agent to actually phone them at the point
they said, and the last asks whether this is still worth running.

The shape is the argument. A sequence made of six identical nudges is
worse than no sequence at all, because it teaches the recipient to ignore
the sender.

## Running to completion is usually a bad sign

`endedReason` records why a plan stopped, and **"they replied" is the
good ending.** A plan that runs all six steps and finishes generally
means nobody engaged with any of it — which is information worth having
about the sequence, not just about the lead.

## Not built yet

- ~~The step actions themselves.~~ Each due step now puts a task on the
  lead's agent's list — a `MESSAGE` names the template, a
  `CHECK_MATCHES` carries the property and a draft, or says nothing when
  nothing fits — and the step is taken only in the same transaction.
  Nothing sends by itself: `intelligence/autonomy.ts` stops every
  message to a client at a person pressing send.
- ~~Creating a plan at all.~~ `plans.create` from Settings → Nurture
  plans, and `plans.subscribe` / `resume` / `stop` from the person's
  page. A resume records `resumedAt`, so the reply that paused a plan
  does not pause it again — rule one says restarting is the agent's
  decision, and without it the decision did nothing.
- ~~Auto-subscription.~~ Suggested rather than automatic: the nightly
  sweep raises `START_PLAN` for somebody whose timeframe reads as three
  months or more (`timeframe.ts`), who is not on a plan, has not opted
  out, and whose brokerage has a plan in use. The agent picks the plan
  from the person's page; subscribing closes the suggestion.
- Per-step reporting — which step loses people. That is the number that
  makes a sequence better over time.
