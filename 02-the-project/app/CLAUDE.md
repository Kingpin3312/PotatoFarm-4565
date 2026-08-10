# Working on PotatoFarm.io CRM

Read this before changing anything. It is the context that does not
survive a file transfer, and several things in this codebase look wrong
until you know why they are that way.

## What this is

A WhatsApp-first CRM for UAE real estate brokerages. An assistant answers
property enquiries within seconds, qualifies the lead, books a viewing,
and hands to a human at the right moment.

Next.js App Router · tRPC · Prisma · Postgres · Expo for mobile.

## Honest state

**This has never been compiled or run.** It was written as a design and
architecture exercise, module by module, with logic verified by
standalone tests rather than by a build. Expect real type errors on the
first `npm run typecheck`, and expect them to be genuine mistakes rather
than configuration problems.

Do not assume a file is correct because it is thorough. Do assume the
*decisions* in the comments were made deliberately — those are the part
worth keeping.

## Do not undo these without asking

Each of these looks like a bug or an inefficiency and is neither. If you
think one should change, say so rather than changing it.

**`force-dynamic` in the root layout is load-bearing, not a leftover.**
`script-src` uses a per-request nonce instead of `'unsafe-inline'`, and
Next can only stamp that nonce onto its scripts if the document renders
per request. Removing the line while the nonce policy is live serves a
blank page with a perfect-looking security header — sixteen scripts
refused, fifteen characters rendered, no hydration. If you want the
static pages back, put `'unsafe-inline'` back in `src/lib/csp.ts` in the
same commit.

**The kill switch is not cached.** `assistant/controls.ts` does one
database read per assistant turn on purpose. A five-minute cache means
five more minutes of messaging customers after somebody pressed stop.

**`set_config('app.current_org', ..., true)`** — the third argument makes
it transaction-local. Session-level on a pooled connection means the next
request inherits the previous tenant's scope. That single argument is the
tenant boundary.

**The audit log has `REVOKE UPDATE, DELETE`.** Erasure scrubs rows rather
than deleting them. `privacy/README.md` explains how both can be true.

**Erasure defers when a KYC file exists.** UAE AML law requires five-year
retention and it overrides a right-to-erasure request.

**`replay.ts` must never import the WhatsApp client or the credential
store.** The audit asserts this. It is what guarantees a prompt test
cannot message a real customer.

**Never use `rootDb` directly. Use `crossTenant(reason)`.** `rootDb`
bypasses row-level security. A review found 131 unscoped uses and every
one was safe — but safe by argument, not by construction, and nothing
announced which was which. Every bypass now declares itself as one of
four reasons and `crm-audit.py` fails the build on a bare `rootDb`.

**Logging lives in `src/lib/log.ts`, not in a domain module.** It was
inside `lib/health` until the portal ingest needed it, which closed a
cycle. Use `log()` from there and never `console` — it scrubs personal
data and carries the tenant.

**All money is `BigInt` fils, formatted only by `lib/money.ts`.** There
were five formatters and two assumed AED. `Lead.budgetMax` and
`Listing.price` were `Decimal` AED while everything else was fils; the
first thing to join them would have shown a buyer a property at a
hundred times their budget.

**Card ordering is a Postgres NUMERIC, not a string key.** The clever
base-62 version was written first, tested, and was wrong.
`lib/ordering.md` has the account.

**`AUTO_CLEAR_THRESHOLD` in AML screening is `null` on purpose.** Nothing
is auto-cleared. Name matching is fuzzy and a threshold will one day
dismiss the one that mattered.

**Compliance reports are invisible to admins.** Not an oversight —
telling a client a report was filed is an offence, and separating the
roles is why the appointment is a legal requirement.

## The seller side

Added on day one of a twenty-two-year agent, who found three things
missing that no audit had looked for.

**A conversation is with a party, and a party is a buyer or an owner.**
`Conversation.leadId` used to be required and unique, so half of an
agent's talking happened outside the system. `rls.sql` carries a check
constraint enforcing exactly one of `leadId` / `vendorId` — Prisma
cannot express it and a conversation belonging to nobody is invisible in
every list and impossible to reach.

**The reply window applies to owners too.** Meta's rule is about the
number on the other end, not about how we filed them. Owners go quiet for
longer than buyers, so they hit it more often.

**An offer is never edited.** A counter creates an `OfferResponse` row.
Overwriting the amount would erase the negotiation, which is the record
both sides argue about later and the one an agent needs when a commission
is disputed.

**Offers are ranked by strength, not by price.** Cash with no conditions
beats a higher mortgage offer nobody has pre-approved. Sorting by the
biggest number invites somebody to get that wrong in front of an owner.
If you "fix" the sort, you have broken the feature.

**A vendor's contact preference is an instruction, not a nicety.**
`OFFERS_ONLY` means do not ring them for a chat. `CALL` means the report
is prepared and put on an agent's list rather than sent — pretending we
can automate a phone call is how an owner gets a text they explicitly did
not want.

## The shape that keeps recurring

Four times a complete, tested, documented module has turned out to have
nothing that starts it:

1. **Billing** could invoice a customer no code path could create.
2. **sendFile** could send an attachment nothing could upload.
3. **deals/** could plan a transfer no accepted offer ever began.
4. **The vendor report** had no vendor to send to.

`architecture.py` catches a module nothing *imports*. `reachability.py`
catches the subtler one — a module that is imported, called correctly,
and whose entry condition never occurs. **A light switch wired to
nothing.**

The question to ask of anything new: **what writes the first row?**

## The pattern that runs through everything

**The failures in this product are silent.** A portal feed stops
delivering. A WhatsApp token expires. A cron stops firing. A push token
dies. Nothing errors — things stop happening and everyone assumes it has
been a quiet week.

So the same shape recurs: watch for **absence**, not errors.
`portals/health.ts` alarms on silence. `jobsHealth()` alarms on a job
that has not run. `health/tenant.ts` asks whether a customer's system is
working rather than whether servers are up.

**If you add a module, ask what its silent failure looks like and who
finds out.**

## The 24-hour window

Meta only allows free-form WhatsApp messages within 24 hours of the
customer's last inbound message. Outside it you need an approved
template.

Get this wrong and messages do not bounce — they are accepted and never
delivered, so a brokerage keeps working a pipeline that has gone quiet.
`messagingWindow()` is the single source of truth and both the UI and the
send path read it.

## Run the audits

There are **thirteen**, in `04-audit-scripts/` at the repository root.
All thirteen are green and all of them belong in CI.

    pip install -r ../../04-audit-scripts/requirements.txt
    ../../04-audit-scripts/run-all.sh

**Use the runner, not the individual scripts.** They do not all take the
same argument — six want the application, four want the website,
`claims.py` wants both in that order, and `consistency.py` wants the
repository root because its job is comparing surfaces to each other.
Passing one path to all thirteen is what somebody does, and the ones
pointed at the wrong tree then read nothing and exit 0. That is how
`audit.py` came to check a single generated preview file instead of ten
pages, and how `consistency.py` reported perfect consistency across four
surfaces it could not open.

Between them they have caught, every one invisible in code review:

1. Eleven routers written and never mounted.
2. Five domain modules built and documented with nothing able to reach them.
3. Two money units in one schema, joined nowhere yet.
4. A pipeline that could not reorder.
5. A permission check that broke the entire header.
6. A circular dependency between jobs, billing and health.
7. A dead "Log in" link on all fourteen website pages.

**One warning about the tooling.** It has produced nine false positives
across these reviews, and once I acted on one and added a `signal` option
to a Prisma query — the tool caused the fault it exists to prevent.

The pattern is exact: checks phrased *"confirm this"* have been right
every time. Checks phrased *"this is broken"* have been wrong nine times.
**Verify before you fix.**

## Conventions

- Money is `BigInt` fils. Never a float, never a Decimal in application
  code.
- Every tenant-owned model has `orgId` and an RLS policy. No exceptions.
- Permissions are checked with `requirePermission`, never
  `if (role === ...)`.
- Comments explain *why*, not what. If a decision was hard, the reasoning
  is in the file.
- UK English throughout, including in user-facing copy.

## Where to start

1. `ARCHITECTURE.md` — tenancy, and why it is in the database.
2. `assistant/README.md` — what the assistant is stopped from doing.
3. `HANDOVER.md` — current state and what is not built.
4. `PILOT.md` — what to do next, which is not more building.

## What is not built

- Most React screens. `preview-*.html` shows layout and interaction; only
  the inbox thread is real.
- The Expo screens. `mobile/` has push, offline policy and auth.
- Screening provider, goAML submission, image quality checks.
- Migration source adapters.
- An external heartbeat — the alerting cannot report its own absence.
