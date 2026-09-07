# Lead ownership and routing

The argument that happens weekly in every brokerage of any size, and the
one most CRMs handle by pretending it is a technical problem.

## The system cannot decide who is right

Two agents both believe they spoke to this person first, and one of them
is mistaken rather than lying. No amount of software resolves that.

So the job here is not adjudication. It is to make the facts undeniable,
so the argument takes thirty seconds instead of an afternoon, and so a
manager is ruling on a record rather than on who is more insistent.

`summariseDispute()` returns a timeline and what the rule says, and ends
with **"This is what the record shows. The decision is yours."** The
temptation is to have the system declare a winner. Resisting it is the
point: a manager handed a ruling argues with the system, while a manager
handed a timeline makes the call and owns it.

## The protection period

An agent who worked a lead keeps them for 90 days after last contact.
Come back after that and the lead is open again.

Set per brokerage rather than hardcoded, because **the number matters far
less than everybody having agreed it in advance.** A rule written down
before it is needed settles arguments; a rule invented during one does
not.

Two carve-outs, both deliberate:

- **An agent who has left cannot hold a lead.** Otherwise the pipeline
  slowly fills with leads belonging to people who do not work here.
- **No recorded contact means no protection.** Claiming a lead you never
  actually spoke to is the most common form of the dispute.

## Round robin has to be visibly fair

Agents watch this more closely than anything else in the product, and the
belief that somebody is being favoured survives any amount of evidence.

So the rotation is **derived from the ownership record** — longest since
their last lead wins — rather than from a counter. There is no counter to
drift, none to reset on deploy, and nothing anybody can be accused of
adjusting. Verified across a nine-lead run: three each.

An agent who has never been assigned anything sorts first, so a new
joiner gets their first lead on day one rather than at the end of a
cycle.

## Nobody available is a real answer

Availability is checked before any strategy runs: on leave, not accepting
leads, at capacity, wrong language, wrong area.

If nobody qualifies, the lead goes to the **shared pool** rather than to
whoever is least unavailable. Forcing an assignment produces the worst
state in the system — a lead that looks handled and is not — and at least
an unclaimed lead looks unclaimed.

At capacity means skip, not queue, for the same reason.

## One small thing in FASTEST

An agent with no response history sorts **last**, not first. A new joiner
with no data should not win a "fastest to reply" contest by default,
which is what a naive null-sorts-low implementation does.

## Not built yet

- Claiming from the pool, with a first-come rule and a visible record.
- Reassignment on an agent leaving. `AGENT_LEFT` exists as a reason;
  nothing triggers it from the membership removal path yet.
- Ramadan and public holiday hours, which change availability across the
  whole brokerage at once rather than per agent.
