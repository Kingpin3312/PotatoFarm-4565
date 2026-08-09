# Why the price has two parts

## The problem

Per-seat pricing charges by headcount and delivers value by
conversation, and in this market those two numbers are not correlated.

Modelled against real cost of delivery:

| | Agents | Leads/mo | Revenue | Gross margin |
|---|---|---|---|---|
| Quiet firm | 18 | 300 | $1,260 | **94%** |
| Typical | 18 | 1,200 | $1,260 | **86%** |
| Lead-heavy | 8 | 3,000 | $560 | **31%** |

An eight-agent brokerage running heavy portal and Meta spend consumed
more inference than a forty-agent firm paying five times as much. **The
small customer was being subsidised by the large one**, which is exactly
backwards — and the pitch says *"we answer every enquiry in seconds"*
while the invoice counts desks.

## The fix, and what it deliberately does not do

**The headline stays $70.** It is already published, already in the
signup flow, already quoted. Changing a price you have announced is a
much worse conversation than adding an allowance to it.

    $70 per agent per month
    60 answered conversations included per agent, pooled across the team
    35 fils per conversation beyond that

Result:

| | Old | New | Gross margin |
|---|---|---|---|
| Quiet | $1,260 | $1,260 | 94% |
| Typical | $1,260 | $1,302 | 86% |
| Lead-heavy | $560 | $1,442 | **73%** (was 31%) |
| Large, busy | $2,800 | $4,060 | 82% |

**Nobody's bill goes down and no existing quote is invalidated.** Only
firms past the allowance pay more, and only in proportion to what they
consumed.

## The definitions, which are the whole thing

**A conversation, not a message.** A buyer messaging six times in an
afternoon is one charge. Billing them as six would be indefensible and
the constraint on `(conversationId, day)` makes it impossible rather
than merely discouraged.

**Answered by the assistant, not sent by an agent.** We charge for work
the product did. An agent typing a reply themselves is not billable —
that is hosting a message box, and it is what the seat price covers.

**Delivered, not attempted.** Recorded after the send succeeds. A reply
that failed is a reply the brokerage did not get, and charging for it is
charging for our own failure.

**A nudge nobody answered is free.** Proactive outreach that gets no
response is not a conversation. Charging for it would be charging for
failure a second way.

## Pooled, and warned at 80%

The allowance is per seat but **pooled across the brokerage** — one
agent having a quiet month covers a colleague having a loud one. That is
how a team works and how an owner expects it to be counted.

Warned at **80%**, not at 100%. Eighty is enough to do something about —
pause proactive outreach, or agree the extra spend deliberately. A
hundred is a notification about a decision already made for them.

## The sense check

At the worst case in the table, the brokerage pays **$0.48 to answer an
enquiry**. A 2% commission on an AED 2m sale is AED 40,000.

That is not the number a brokerage owner argues about, and if it ever
becomes one, the conversation is about value rather than price.
