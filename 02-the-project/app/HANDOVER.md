# PotatoFarm.io CRM — where things are

Written for whoever picks this up, including you in three months.

## Start here

**There is no outstanding engineering work blocking the pilot.** That is
the single most important sentence in this document, because the natural
instinct on arriving at a large codebase is to find something to build,
and building is not what this project needs.

The gate is green: `tsc` clean, 268 unit assertions, 25 check suites, 16
audit scripts, all browser suites, and a production build that succeeds.
CI runs the lot on every push.

**What is left is four accounts and a phone call.** They are listed
under *Still needed from the business* at the end of this file, and
`PREFLIGHT_ENV=1 npm run check:preflight` names whichever one is
missing. Run that first; it answers "where are we" in one command.

### Before you believe anything you measure

If you are in a fresh container, do the two-minute check at the top of
`CLAUDE.md` first. A remote container can come back at an older commit
with no error, and it has: six times in one session, twice producing
work built on stale numbers. **The tell is a count that disagrees with
yesterday when nobody changed it.**

It can also happen mid-turn, after a successful push, and then it looks
exactly like lost work — files short of content you remember writing,
HEAD at an old commit. One `git fetch` settles it. **A file that has
lost content is a reset until proven otherwise.**

### Do not "optimise" forOrg()

It looks like the obvious win — a transaction per query to set the
tenant scope — and an independent audit of this project said exactly
that, called it the largest architectural drag, and recommended setting
the scope on connection checkout instead.

**That audit was wrong, and its recommendation was a cross-tenant leak.**
The per-org client cache already exists. It is one batched round trip,
not several — verified by counting the statements Postgres actually
receives. And `set_config(…, true)` is transaction-local *precisely
because* a session-level setting outlives the request: on a
transaction-mode pooler the next request would inherit the previous
brokerage's scope. Measured at 5,000 leads and 40,000 messages, the
pipeline's first page takes 4ms warm.

The full account is in `CLAUDE.md` under *do not undo these*. If anyone
proposes optimising it again, ask for the measurement first.

### If you want engineering work anyway

None of this blocks a pilot, and all of it is honest:

- **Upgrade Next.js** to clear two dependency advisories. Both arrive
  through it, and `sharp`'s is unreachable here because `next/image` is
  never used — but every acquirer's scanner will flag them regardless,
  and arguing reachability during diligence costs more than upgrading.
- **Arabic and RTL — the frame is done, the screens are not.** The
  foundation is in and verified: the document resolves a locale and
  carries `lang`/`dir`, every physical direction class in `src/` is gone
  (`ml-` → `ms-`, and `i18n.py` fails the build if one returns), Arabic
  gets its own line height and no negative letter-spacing, and the
  navigation, shell, command palette and a language switcher are
  translated. **What is left is the other ~330 strings across 43
  screens** — mechanical, screen by screen, following the pattern in
  `components/layout/shell.tsx`.
- **Rebuild the mobile app** on a current Expo SDK — but only once a
  pilot proves agents want one. The responsive web app is verified at
  eight widths and covers a pilot.

## The same class of bug, ten times

The consistency checks have now caught the same failure ten times in
different shapes, which says something about how a long build goes
wrong. Two of the most expensive were found by the board audit, long
after everything "worked".

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

**Ninth time:** a rate-limit rule named `auth.magicLink`, sitting in the
table since the day it was written, invoked by nothing. The sign-in
endpoint took unlimited requests and sent a real email for every one.

**Tenth time:** the alerting system — severity routing, runbooks,
deduplication, closing an alert when its condition cleared — ending in
`log.warn`. A stopped cron raised a PAGE and nobody was ever paged.

The lesson is not about routers. It is that **building fast produces
things that look finished and are not connected**, and no amount of care
inside a file catches it. The later two are worse than the early ones,
because both were *security and reliability* controls that a reviewer
would read as present.

Four questions catch this class, and they are worth asking of anything
new: **what writes the first row? what closes it? who reads it? what
invokes it?**

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

## Reviewed four ways

After the build, four passes that each found real faults:

| Review | Found | Report |
|---|---|---|
| Deep audit | 3 bugs, incl. two money units in one schema | `AUDIT-REPORT.md` |
| Architecture | A cycle, and logging buried in a domain module | `ARCHITECTURE-REVIEW.md` |
| Security | 131 undeclared RLS bypasses, all safe, none announced | `SECURITY-REVIEW.md` |
| Board audit | An unthrottled sign-in endpoint; alerts that never left the process; two checks that had been passing while measuring nothing | this file, `OPERATIONS.md`, and the commit log |

All twenty-four check suites are green. Read the reports before changing
anything structural — several of the fixes look like preferences and are
not.

**The board audit is the one to read the commits for**, because it found
things the other three could not: the earlier passes all read code, and
its findings needed a running server. The unthrottled endpoint was six
POSTs against a live application; the two decorative checks were caught
by putting a bug back and watching them stay green.

## The shape of it

    prisma/schema.prisma      73 models
    src/server/db/            tenant isolation — read rls.sql first
    src/server/auth/          passwordless, database sessions, permission matrix
    src/server/api/           27 routers, mounted on root.ts
    src/server/assistant/     the model, its guardrails, its off switch
    src/server/lib/           the domain: portals, feeds, scheduling,
                              billing, privacy, notify, health, support
    src/server/jobs/          26 scheduled jobs, advisory-locked
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

And when it is running: **`OPERATIONS.md`**, the two-in-the-morning
document. How a failure is noticed, and how the database comes back.
Read the restore-drill section before you need it, not during.

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

- ~~**Screens: not compiled.**~~ Out of date, and left here as the
  warning it became. All 43 compile, `npm run build` succeeds, and
  `browser:screens` fails the build if one stops rendering.
- ~~**An external heartbeat.**~~ Built by the board audit.
  `health/deliver.ts` pings `HEARTBEAT_URL` after every successful
  sweep, and the external monitor alarms when the ping *stops* — the
  only alarm that survives the outage it reports. **It needs a URL: the
  mechanism is done, the account is not.**
- **The native mobile app cannot build.** No `app.json`, no
  `tsconfig.json`, no babel config; Expo SDK 51 and React Native 0.74,
  roughly two years old; and a sign-in flow expecting a `?session=`
  token the web app cannot issue. Rebuild on a current SDK when a pilot
  proves agents want it — do not upgrade this one. The responsive web
  app is verified at eight widths and genuinely covers a pilot.
- **Portal lead ingestion is a reference shape, not a specification.**
  `portals/property-finder.ts` says so at the top. Signature
  verification is real; the field names are guessed pending a partner
  agreement. Do not describe these integrations as working.
- **Arabic on the screens themselves.** The frame is translated and the
  direction works end to end — `curl -H 'Cookie: pf_locale=ar'` returns
  `<html lang="ar-AE" dir="rtl">` with an Arabic skip link — but the 43
  screens still hold English strings. Three things are deliberately not
  done and should be, in this order:
  **(1) a native speaker has not read `ar.ts`**, which is an hour of
  somebody's time and worth more than any further care in the file;
  **(2) the preference is a cookie, so it does not follow an agent to a
  new device** — syncing it to the user record needs middleware, because
  the root layout cannot write a cookie and also serves the signed-out
  pages; **(3) there is no browser check that renders a screen in Arabic
  and asserts the layout mirrored.** The unit tests and `i18n.py` cover
  the catalogue and the classes; nothing yet looks at a page.
- No on-call rota. Alerts now have somewhere to go and nobody rostered
  to receive them.

## Still needed from the business

None of this is a coding task.

**Unchanged since the website was built:** a published price, three
approved testimonials with numbers attached, client logos with written
permission, the hosting region, and a retention period that matches the
privacy policy.

**Added by the board audit — these block the pilot.** Four accounts, and
`PREFLIGHT_ENV=1 npm run check:preflight` refuses to pass until each is
real and names the one that is missing:

1. **Managed Postgres with point-in-time recovery.** The retention
   window must exceed five years for KYC files; most providers default
   to 7–35 days.
2. **Somewhere for alerts to arrive** — a Slack webhook or PagerDuty.
3. **A dead-man's-switch monitor** — Healthchecks.io or Better Stack,
   free tier.
4. **Vercel Pro.** 25 crons and a 300-second function both exceed Hobby,
   and deploying to Hobby does not fail loudly: the crons simply never
   run, which for a product built on nightly sweeps is the quietest
   possible outage.

Also outstanding, and cheap: **a Stripe test key**, so
`npm run check:billing` can exercise the one step it currently skips.
Everything else on the money path — signup, subscription, invoice with
correct fils arithmetic and VAT, and six signed-webhook assertions over
real HTTP — already passes.
