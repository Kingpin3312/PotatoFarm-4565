# Invariants

Each of these was arrived at through a bug, a review, or a decision that
took an argument. Do not undo them without a reason at least as good.

## Safety

- **Replay has no send capability.** You can see exactly what happened
  without it happening again.
- **The kill switch is checked before any model call**, uncached.
- **Per-conversation mute is checked before any model call.** "Stop
  everything" halts the brokerage; "I've got this" is one thread.
- **The audit log has UPDATE and DELETE revoked at the database.** Not a
  policy — a grant.

## Compliance

- **AML erasure defers against a live KYC file.** Five-year retention
  outranks the request; say so and give a date.
- **An agent never sees a sanctions reason.** Tipping off is an offence.
  Enforced by a check across every agent-facing screen.
- **A decision not to file is still a decision** and needs a recorded
  reason.
- Risk rating is **derived from factors**, never picked from a list.

## Data

- **Money is BigInt fils.** One formatter, `src/lib/money.ts`.
- **`crossTenant(reason)`** — no unscoped query without a stated reason.
- A `Conversation` belongs to exactly one party.
- **A dead lead is never messaged.**

## Product

- **Offers rank by strength, not price.** Accepting closes the others
  and returns who needs telling — buyers hear from their agent.
- **A counter creates a row.** Amounts are never overwritten.
- **The leaderboard ranks viewings, not reply speed.** Ranking speed
  makes agents fast rather than useful.
- **Agents get a 24-hour head start** before a lead is redistributed.
- **The blackbook is scoped to the calling agent**, and the private note
  is deliberately **not audited** — an audit row is a record a manager
  can read.

## Build

- **Jobs and `vercel.json` crons must match.** 22 each.
- **PotatoFarm.io everywhere** — never "Potato.ai", never "Kendal".
