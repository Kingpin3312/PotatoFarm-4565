# The deal after the handshake

Our pipeline used to end at **Won**, which in this market is roughly the
halfway point. Deals die between agreement and transfer, and the reason
is almost always the same: a step with a two-week lead time started one
week before it was needed.

## This is not a checklist

The Form F carries a **contractual completion date**. Missing it is not
an inconvenience — it can mean forfeiting the deposit. So everything is
planned **backwards** from a date somebody has signed.

Plan forwards and you find out you are late. Plan backwards and you find
out when each thing has to start.

## The numbers, which make the case on their own

Working days, from the lead times in `stages.ts`:

| Deal shape | Working days needed |
|---|---|
| Cash, seller owns outright | **20** |
| Mortgage, seller owns outright | 37 |
| Mortgage, seller has a mortgage | **47** |

A 30-calendar-day completion window is about **22 working days**.

So a 30-day Form F is comfortable on a cash deal and **impossible** on a
mortgage purchase where the seller also has a mortgage — by more than
three weeks. That is agreed at the negotiating table every week in this
city, by people who then spend a month wondering why it is slipping.

`checkProposedDate()` says so before anyone signs, while the date is
still negotiable. That single function may be the most commercially
useful thing in this module.

## The question it exists to answer

`assess()` answers "is the contractual date still achievable", and it
answers bluntly:

> Not achievable. There are 31 working days of steps left and 18 until
> the completion date — short by 13. Agree an extension now rather than
> in the final week.

A deal that quietly becomes impossible three weeks out and is discovered
in the final week costs somebody a deposit. Softening that message helps
nobody.

## Two details from the market, not from a spec

**The seller's liability letter is the most commonly forgotten
dependency.** If the seller has a mortgage to discharge, it adds ten
working days and a bank, and nobody remembers until week four. It is a
first-class stage here rather than a note.

**Outstanding service charges stop the NOC.** Check them the day the Form
F is signed, not the week of transfer. It is in `watchFor` on that stage
so it surfaces where somebody will read it.

## Milestones are rows, not a status field

The useful questions are when a step was done, by whom, and what is
attached to it. A single enum answers none of those. Slippage is kept
after the fact too — a deal that completed late still tells you where
your process is slow, and across fifty deals that is the difference
between an opinion and a number.

## Not built yet

- Document upload against each milestone. The `requires` list is
  declared; nothing enforces it.
- The slippage job. `assess()` runs on demand; nothing yet sweeps every
  live deal each morning and shouts about the ones that have stopped
  being achievable.
