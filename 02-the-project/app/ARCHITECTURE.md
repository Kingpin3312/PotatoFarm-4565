# PotatoFarm.io CRM — architecture

Scope note, stated plainly: this is the spine, not the finished platform.
Thirty modules do not get built in an afternoon and anyone telling you
otherwise is selling something. What is here is the part that is expensive
to get wrong and cheap to get right at the start — tenancy, permissions,
the data model and the audit trail. Everything else is built on top of it,
and none of it is built well if this is wrong.

## Stack

| | | Why |
|---|---|---|
| Next.js App Router | Web | Same framework as the marketing site. One repo, one deploy, one design system, and the marketing pages can link straight into the app. |
| tRPC | API | End-to-end types with no code generation step. `trpc-openapi` emits an OpenAPI document for the mobile client and for partners, so "API-first" is satisfied without hand-writing a second surface. |
| Prisma + Postgres | Data | Postgres because row-level security is the thing this product needs most, and it is the only mainstream database where that is properly mature. |
| Expo | Mobile | Consumes the same tRPC router. Agents live in the car between viewings; a responsive web app is not the same as an app. |

## The two decisions that matter

### Tenancy is enforced in the database, not the application

Every tenant-owned row carries `orgId`, and Postgres row-level security
enforces it. The application connects as a role that does not own the
tables and does not have `BYPASSRLS`.

The argument is simple. A missing `where orgId` clause is one forgotten
line, it looks exactly like working code in review, and the consequence is
serving one brokerage another brokerage's client list. With RLS on, the
same forgotten line returns nothing instead of returning everything. The
failure mode becomes a bug report rather than a breach.

One detail in `client.ts` is doing more work than it looks like:

```ts
SELECT set_config('app.current_org', ${orgId}, true)
```

That third argument makes the setting transaction-local. Set it at session
level instead and, on a pooled connection, it outlives the request — and
the next request on that connection inherits the previous tenant's scope.
That is the specific bug that turns row-level security into a false sense
of safety, and it is easy to write by accident.

`FORCE ROW LEVEL SECURITY` matters too. Without it the policy does not
apply to the table owner, so anything connecting as owner silently sees
everything.

### The audit log is append-only at the database level

`REVOKE UPDATE, DELETE ON "AuditLog"`. Not a convention, not a code review
rule. An audit log a developer can quietly edit is not an audit log, and
the security page you are about to publish makes claims that this is what
backs up.

It is written inside the same transaction as the change it records. If the
change commits the log commits; if it rolls back so does the log. Logging
afterwards leaves a gap where a change exists that nobody can account for,
which is exactly what an auditor asks about.

## Domain decisions worth knowing

**WhatsApp is not email.** Meta's Business Platform only permits free-form
messages within 24 hours of the customer's last inbound message. Outside
that window you need a pre-approved template. `Conversation.lastInboundAt`
exists so every send path can check it, rather than the team discovering in
production that follow-ups silently stopped delivering.

**A lead's identity is a phone number,** not an email. `@@unique([orgId,
phone])` — the same person enquiring with two agencies is two leads;
enquiring twice with one agency is one lead with two enquiries.

**Users are global, memberships are scoped.** Agents move between agencies
constantly in this market. A model that assumes one organisation per user
forces them to keep two logins and makes handover painful.

**Qualification profiles are versioned.** Changing the questions
mid-campaign otherwise rewrites history, and last quarter's leads appear to
have answered questions that did not exist.

**Answers carry a confidence score.** Anything low gets flagged for an
agent rather than written into the pipeline as fact. An assistant that
guesses a budget confidently is worse than one that admits it did not get
one.

**Permissions, not roles, are what the code checks.** One table in
`rbac.ts`. Every `if (role === "ADMIN")` scattered through a codebase is a
place the rules drift apart.

## What is built

    prisma/schema.prisma      Full data model, 14 entities
    src/server/db/rls.sql     Tenant isolation policies
    src/server/db/client.ts   Transaction-scoped tenant handle
    src/server/auth/rbac.ts   Permission matrix, five roles
    src/server/lib/audit.ts   Append-only logging with redaction
    src/server/api/trpc.ts    Auth and permission middleware
    src/server/api/routers/   Leads router as the reference implementation

## What is next, in order

1. **Auth** — sessions, org switching, invitations. Everything else waits
   on it.
2. **The inbox** — conversation list and thread view. This is the screen
   agents live in, and it should be built before anything else has a UI.
3. **The webhook** — inbound WhatsApp, idempotent on `externalId` because
   Meta redelivers.
4. **The pipeline board.**
5. **Portal ingestion** — Property Finder, Bayut, Dubizzle.
6. **Reporting.**

## Two things to decide before step one

**Where the database lives.** The security page you are about to publish
answers this question in public. Pick the region first and write the page
to match, rather than the other way round.

**Retention.** How long a departed brokerage's data is recoverable before
the scheduled hard delete. Soft deletes are already in the model; the
number is a business decision and it belongs in the privacy policy.
