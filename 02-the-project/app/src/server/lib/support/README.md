# Support access

## The problem

Tenant isolation is enforced by Postgres row-level security, and the
application role has no `BYPASSRLS`. That was deliberate — it is what
makes the security page's claims true rather than aspirational.

Then a brokerage rings at eight in the morning saying leads have stopped
arriving, and somebody has to look.

## Why the obvious answer is wrong

A support role that can read every tenant. One line of SQL, solves the
problem, and undoes the guarantee permanently. From that moment "nobody
outside your brokerage can see your data" is false, and the honest
version of the security page has to say so — including to the enterprise
buyer who reads it.

The hole exists whether or not anyone has a problem. That is what makes
it different from every other trade-off in this codebase.

## What is built instead

1. **The customer grants access** — to a named person, for a stated
   reason, with an expiry. Never a role, never a team. "Support can see
   your data" is not something anyone can meaningfully consent to.
2. **Read only by default.** Writing on a customer's behalf is a separate
   decision, and the error message tells the engineer to explain what
   they intend to change before asking for it.
3. **72 hours maximum, not configurable.** An indefinite grant is a
   backdoor with a nicer name.
4. **Support uses the same RLS path as the customer.** There is no
   privileged connection. Support sees exactly what a member of that
   brokerage sees, because the database enforces it rather than the
   application promising to.
5. **Anyone in the brokerage can revoke; only an admin can grant.** If
   somebody is uncomfortable with an outsider in their data they should
   not have to find a manager first. Re-granting takes ten seconds.

## The logging detail that matters most

Everything support does is recorded **as support**, with the grant and
the staff member's name attached.

The failure this avoids is not a missing log line. It is an audit trail
showing a brokerage's own manager deleting a lead when it was actually
somebody at the vendor. That is not a logging bug — it is a false
accusation sitting inside a record the customer has been told to trust.

Opening a session is logged too. Somebody looking and finding nothing
wrong is still somebody who looked.

## What it costs

A customer with a problem has to press a button before anyone can help.
That is a real cost, it will occasionally be annoying at eight in the
morning, and it is worth paying — because the alternative is a permanent
hole that exists on every other morning as well.

Worth putting on the security page in plain words. "We cannot see your
data unless you let us in, for a reason, for a limited time, and you can
see every time we did" is a stronger claim than most of this market can
make, and it is only worth making because it is true.
