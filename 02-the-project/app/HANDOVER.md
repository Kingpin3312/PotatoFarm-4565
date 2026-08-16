# PotatoFarm.io CRM — where things are

Written for whoever picks this up, including you in three months.

## The same class of bug, twice

The consistency check has now caught the same failure twice in different
shapes, which says something about how a long build goes wrong.

**First time:** eleven routers written, every one correct, none mounted.
The API did not exist as far as any client was concerned.

**Second time:** five domain modules — commission, AML, listing copy,
migration and lead routing — fully built, tested and documented, with **no
router, no job and no webhook reaching any of them.** Code that runs
nowhere. Every one passed every other check, because each file was fine on
its own.

Both were invisible in review and both took one question asked across the
whole codebase. The check now asks "is every module reachable from
somewhere" as well as "is every router mounted", and both belong in CI.

The lesson is not about routers. It is that **building fast produces
things that look finished and are not connected**, and no amount of care
inside a file catches it.

## What the audit found before this was written

I ran a consistency check across the whole codebase, because a long build
is exactly when drift appears. It found two things, both now fixed, and
both worth recording because they are the shape of what goes wrong here.

**Eleven routers, none mounted.** Every one correct in isolation, and the
API did not exist as far as any client was concerned. Nothing was wrong
with any individual file, so nothing looked wrong. Only a question asked
across the whole codebase finds that.

**Eight environment variables read in code and documented nowhere** —
`ANTHROPIC_API_KEY`, `STRIPE_WEBHOOK_SECRET`, `WHATSAPP_APP_SECRET`,
`CRON_SECRET` among them. Every one a silent runtime failure on deploy,
and two of them security controls that fail open-ish rather than loudly.

`04-audit-scripts/crm-audit.py` is that check. Put it in CI — or the
whole suite, with `04-audit-scripts/run-all.sh`.

## Reviewed three ways

After the build, three passes that each found real faults:

| Review | Found | Report |
|---|---|---|
| Deep audit | 3 bugs, incl. two money units in one schema | `AUDIT-REPORT.md` |
| Architecture | A cycle, and logging buried in a domain module | `ARCHITECTURE-REVIEW.md` |
| Security | 131 undeclared RLS bypasses, all safe, none announced | `SECURITY-REVIEW.md` |

All twenty-one check suites are now green. Read the three reports before changing
anything structural — several of the fixes look like preferences and are
not.

## The shape of it

    prisma/schema.prisma      73 models
    src/server/db/            tenant isolation — read rls.sql first
    src/server/auth/          passwordless, database sessions, permission matrix
    src/server/api/           27 routers, mounted on root.ts
    src/server/assistant/     the model, its guardrails, its off switch
    src/server/lib/           the domain: portals, feeds, scheduling,
                              billing, privacy, notify, health, support
    src/server/jobs/          25 scheduled jobs, advisory-locked
    src/app/                  43 screens, every one opened by browser:screens
    mobile/                   push, offline policy, auth — does not build

**These numbers said 34 models, 11 routers and 11 scheduled jobs until <!-- counts: ignore -->
`counts.py` was written.** They were right when typed and the codebase
roughly tripled underneath them, which made the first thing a new
reader saw about "the shape of it" wrong by more than half. Nobody
writes a wrong number on purpose; they just stop being true. The audit
checks this paragraph now, along with the same claims in
`PROJECT_CONTEXT.md` and `README.md`, which had drifted to three
different answers.

## Read these five, in this order

1. **`ARCHITECTURE.md`** — why tenancy is enforced in Postgres and not in
   application code. Everything else assumes you have read it.
2. **`src/server/assistant/README.md`** — what the assistant is stopped
   from doing, and why those rules live in code rather than in a prompt.
3. **`src/server/lib/billing/README.md`** — the dunning ladder. The
   principle that a brokerage's customers must never be able to tell
   there is a billing problem.
4. **`src/server/lib/support/README.md`** — how support sees customer
   data without a backdoor existing.
5. **`PILOT.md`** — what to do next, which is not more building.

## The pattern that runs through all of it

**The failures in this product are silent.**

A portal feed stops delivering. A WhatsApp token expires. A cron stops
firing. An assistant is switched off. A push token dies. In every case
nothing errors — things simply stop happening, and everyone assumes it
has been a quiet week.

So the same shape appears everywhere: watch for **absence**, not for
errors. `portals/health.ts` alarms on silence. `jobsHealth()` alarms on a
job that has not run. `health/tenant.ts` asks whether a customer's system
is working rather than whether the servers are up. `push.ts` marks dead
tokens instead of retrying into nothing.

If you add a module, ask what its silent failure looks like and who finds
out.

## Decisions that will look wrong until you know why

- **The kill switch is not cached.** One database read per assistant turn.
  A five-minute cache means five more minutes of messaging customers after
  somebody pressed stop.
- **Card ordering is a Postgres NUMERIC, not a clever string key.** I
  wrote the clever version first, tested it, and it was wrong —
  `src/server/lib/ordering.md` has the account.
- **The audit log cannot be updated or deleted, and erasure scrubs it
  rather than deleting rows.** `privacy/README.md` explains how both can
  be true.
- **Support access expires in 72 hours and is not configurable.** An
  indefinite grant is a backdoor with a nicer name.
- **Alerts page only for things a human can fix at 3am.** A WhatsApp
  token needs the customer, so it is a ticket, not a page.

## Not built

- **Screens: built.** Inbox, pipeline, listings, settings and commission
  are real React against the typed router. None of it has been compiled —
  that is the first job in Claude Code, not a design question.
- The React Native screens. Same position — `mobile/` has the parts that
  are expensive to get wrong.
- An external heartbeat. The alerting cannot report its own absence, and
  that has to live outside this system. Ten minutes of setup, and it is
  the single cheapest piece of resilience on this list.
- Arabic and RTL. The assistant handles Arabic; the interface does not.

## Still needed from the business

Unchanged since the website was built, and none of it is a coding task:
a published price, three approved testimonials with numbers attached,
client logos with written permission, the hosting region, and a retention
period that matches the privacy policy.
