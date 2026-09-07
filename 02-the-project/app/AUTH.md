# Auth layer

## No passwords

Sign-in is a one-time link to a work email address. That is a deliberate
trade, and it is written down here because somebody will eventually ask
for a password field.

**What it buys.** There is no password to store, so there is no hash to
leak, no rotation policy to write, and nothing for a brokerage to reuse
from somebody else's breach. Credential stuffing — the most common attack
on a product like this — has nothing to work with. And the security page
gets to say "we do not store passwords" and mean it literally.

**What it costs.** Sign-in depends on email delivery. Verify the sending
domain properly or this is the whole product failing at the front door.

When a brokerage large enough to demand SAML turns up, add it as another
provider. The session model doesn't change.

## Database sessions, not JWTs

A JWT cannot be revoked before it expires. In a product where an owner
sacks an agent on Tuesday and expects them out of the client list on
Tuesday, that is the wrong default. "Log out everywhere" has to actually
work. Database sessions cost a query per request; here they earn it.

## The rule that matters

**The stored organisation is a preference, never a grant.**

`Session.activeOrgId` records which brokerage you were last looking at.
It is not what authorises anything. `getActiveMembership()` re-reads
Membership on every request, and if the stored org is stale, deleted, or
one you were never in, it falls back rather than trusting it.

The consequence: remove an agent and their *next request* drops out of the
brokerage. Not their next login, not whenever a token happens to expire.

## Six decisions in the code worth knowing about

**Invitation tokens are hashed at rest.** The schema originally stored the
token in plaintext, which means read access to the database is enough to
join any brokerage with a pending invitation. Now SHA-256, with the
plaintext existing only in the email that was sent — never logged, never
returned to the caller who created it.

**Accepting an invitation fails with one message, always.** Distinguishing
"no such invitation" from "expired" from "wrong person" tells an attacker
which addresses have invitations pending. The email comparison is
constant-time for the same reason.

**Re-inviting replaces the token.** The previous link stops working, so a
forwarded invitation isn't a standing key.

**An admin cannot mint an owner.** The invite role is a narrowed enum
rather than a free string. Privilege escalation through an unvalidated
role field is the oldest bug in multi-tenant software.

**The last owner cannot be removed.** An organisation with no owner cannot
be billed, transferred or closed, and recovering from it is a manual
database job.

**Removing an agent unassigns their leads rather than cascading.** Losing
an agent must not lose the pipeline. Their sessions pointing at that
brokerage are cleared at the same time.

**Middleware is a redirect, not a gate.** It checks for a cookie so signed-
out users land on the sign-in page instead of an empty app. Every real
authorisation decision happens in `orgProcedure` and in the database
policies, both of which run on every request. Middleware that pretends to
be the gate is how people end up with an API anyone can call directly.

## One thing I fixed mid-build

`orgRouter.invite` referenced `ctx.orgName`, which `orgProcedure` never
provided. It would have compiled as `undefined` and shipped an invitation
email reading "undefined has added you to PotatoFarm.io". Caught by sweeping every
`ctx.*` reference against what the middleware actually sets — worth adding
to CI as a lint rule rather than relying on someone noticing.

## Next

The inbox. It is the screen agents live in, and it should be built before
anything else gets a UI.
