# Working on PotatoFarm.io CRM

Read this before changing anything. It is the context that does not
survive a file transfer, and several things in this codebase look wrong
until you know why they are that way.

## What this is

A WhatsApp-first CRM for UAE real estate brokerages. An assistant answers
property enquiries within seconds, qualifies the lead, books a viewing,
and hands to a human at the right moment.

Next.js App Router · tRPC · Prisma · Postgres · Expo for mobile.

## If you have just arrived in a fresh container

Two minutes, and skipping it has cost real work twice.

**1. Confirm you are looking at the real code.** A remote container can
come back at an older commit with no warning and no error. It happened
six times in one session; twice it produced work built on stale
measurements — once "fixing" a bug that was already fixed upstream, once
nearly rewriting documentation from counts taken off old code.

**It can also happen in the middle of a turn, after a successful push.**
The sixth reset landed between `git push` and the next command. What it
looked like from inside: CLAUDE.md was suddenly 253 lines instead of
489, the fresh-container section was gone, `sentence.ts` and `chart.tsx`
did not exist, and `git log` put HEAD at the old commit — a perfectly
coherent picture of work that had been lost. None of it was. `git fetch`
showed origin holding the pushed commit and a `reset --hard` brought
everything back.

So the rule is not only *check on arrival*. **A file that has lost
content you remember writing is a reset until proven otherwise**, and
the proof is one fetch. Concluding "this was never committed" from a
tree you have not re-verified is the same mistake as trusting a stale
count, one step further along.

    git fetch origin claude/project-audit-assessment-yr66hc
    git rev-parse --short HEAD
    git rev-parse --short origin/claude/project-audit-assessment-yr66hc
    # differ? git reset --hard origin/claude/project-audit-assessment-yr66hc

**The tell is a number that disagrees with yesterday.** If a count you
measured before has changed and nobody changed it, resync before
believing anything else.

**2. The database rolls back with it.** Empty screens or a 401 on every
tRPC call usually means the migrations and the seed are gone, not that
something is broken:

    pg_ctlcluster 16 main start
    npx prisma generate                 # a stale client throws on missing columns
    npx prisma migrate deploy           # needs DATABASE_URL_DIRECT = the OWNING role
    npm run db:seed                     # idempotent; adopts the existing brokerage
    npm run dev

`prisma migrate deploy` fails with "must be owner of table" if
`DATABASE_URL_DIRECT` points at `potato_app`. It has to be
`potato_owner`. `.env` is gitignored, so this is a local-only fix.

**3. Two traps in this container specifically.**

`pkill -f "next dev"` kills your own tool-call shell, because the string
you typed is in that shell's command line. It exits 144 and takes the
dev server's parent with it.

**`pkill -f "node .*/next"` was the advice here and it fails exactly the
same way** — that pattern is also a literal in the shell's command line,
so the shell matches its own `pkill`. Any pattern you can type is a
pattern that describes the process typing it. Break the literal with a
character class, which matches the server but not the command:

    pgrep -af 'ne[x]t-server'      # find it
    kill <pid>                     # kill that, nothing else

Capturing the PID up front (`npm run dev & echo $! > /tmp/dev.pid`) is
still worth doing, but note it records the `npm` wrapper rather than the
server, so the `pgrep` above is what actually ends it.

`npm run verify` now exceeds a ten-minute tool timeout. Run it in parts,
or let CI run it.

## Honest state

~~**This has never been compiled or run.**~~ **It has now, and the
production path specifically.** The line above was true for most of this
project's life and is kept because it explains the shape of what is
here: it was written as a design and architecture exercise, module by
module, with logic verified by standalone tests rather than by a build.

What is verified today, measured rather than assumed:

- `npm run build` exits 0 with no warnings — the production build, not a
  dev server.
- 55 routes, **every one of them `ƒ` (dynamic) and none prerendered**,
  which is the `force-dynamic`/CSP-nonce invariant below holding rather
  than having quietly drifted. A static route in that list is the tell
  that somebody removed the line.
- `npm run start` serves `/sign-in` in about two seconds and
  `/api/health` returns `200 {"ok":true}` against a real Postgres.
- The boot log names every unconfigured service with its consequence —
  six of them in a bare development environment.
- 279 assertions in 14 files, 25 check suites, 16 audits, all green.

Type errors on a fresh checkout are no longer expected. If you get one,
it is new.

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

**`forOrg()`'s transaction-per-query is not the inefficiency it looks
like, and an independent audit got this wrong.** The audit called it
"2+ round trips and the single largest architectural drag" and
recommended caching a client per org and setting the scope on
**connection checkout**. Checked against the code and measured against a
running database, nearly all of that was false:

- The per-org cache **already exists**, bounded, with a check asserting
  two brokerages never share a client.
- It is **one** round trip. Postgres receives `BEGIN → set_config →
  query → COMMIT` as a single batched transaction — verified by turning
  on `log_statement` and counting what arrived.
- **Scoping on connection checkout would be a cross-tenant leak**, for
  the reason stated directly above. The recommendation would have undone
  the control it was meant to optimise.
- Widening it to one interactive transaction per request holds a
  connection across the Anthropic, Stripe and Meta calls these
  procedures make mid-flight, which exhausts the pool far faster than
  the round trips ever cost.

Measured at 5,000 leads and 40,000 messages: pipeline first page 4ms
warm, search 32ms. **There is nothing to reclaim here.** The lever is a
pooler in front of Postgres, which `check:preflight` enforces. If
somebody proposes optimising this again, ask them for the measurement
first.

**`ms-`, `ps-`, `border-s-` and `text-start` are not typos for `ml-`,
`pl-`, `border-l-` and `text-left`.** They are the logical spellings and
they follow the `dir` the root layout sets from the resolved locale.
There are none of the physical ones left in `src/`, and
`04-audit-scripts/i18n.py` fails the build if one comes back — the
failure it prevents is invisible in English, because the text flows
right-to-left while the spacing stays put, so every screen is slightly
wrong and no screen is obviously broken.

Two smaller pieces of the same rule. `[dir="rtl"]` in `globals.css`
resets letter-spacing to zero: the scale is tightened at every size
above 13px, which is right for the Latin system faces it was tuned
against and pulls the joins of a **connected** script into each other.
And `formattingLocale()` returns `ar-AE-u-nu-latn` to pin Western
digits — the comment there records that `ar-AE` already defaults that
way and `ar-EG` does not, so it is a guarantee, not a fix.

**The audit log has `REVOKE UPDATE, DELETE`.** Erasure scrubs rows rather
than deleting them. `privacy/README.md` explains how both can be true.

**Erasure defers when a KYC file exists.** UAE AML law requires five-year
retention and it overrides a right-to-erasure request.

**`replay.ts` must never import the WhatsApp client or the credential
store.** The audit asserts this. It is what guarantees a prompt test
cannot message a real customer.

**Tokens are encrypted, not absent.** `lib/secrets.ts` opens by saying
tokens never go into Postgres. They still do not: what is stored is
ciphertext sealed with `SECRETS_KEY`, which lives only in the
environment, so a database dump carries nothing able to message a
customer's clients. Before the vault existed the rule was enforced by
having nowhere to put a token at all — which meant connecting a
brokerage's WhatsApp number required setting an environment variable and
redeploying, per brokerage, per channel. `readSecret` is still the only
reader, and swapping in Vault or Secrets Manager touches that one file.

**Never use `rootDb` directly. Use `crossTenant(reason)`.** `rootDb`
bypasses row-level security. A review found 131 unscoped uses and every
one was safe — but safe by argument, not by construction, and nothing
announced which was which. Every bypass now declares itself as one of
four reasons and `crm-audit.py` fails the build on a bare `rootDb`.

**The nav lists live in `components/layout/nav.ts`, not in the shell.**
Moving them back into `shell.tsx` closes a cycle: the shell renders the
command palette and the palette reads the same lists, so the palette's
module-scope read of `NAV` throws "Cannot access 'NAV' before
initialization" — a 500 with no dialog anywhere in the DOM and nothing
in the type-check to warn you. `nav.ts` imports nothing on purpose, so
it cannot be the link in a future cycle. The general rule it came from:
a component is the wrong home for a constant another component needs.

**Logging lives in `src/lib/log.ts`, not in a domain module.** It was
inside `lib/health` until the portal ingest needed it, which closed a
cycle. Use `log()` from there and never `console` — it scrubs personal
data and carries the tenant.

**`cn()` must know every custom `text-*` size.** `tailwind-merge`
assumes an unrecognised `text-<word>` is a colour, so `cn("text-title",
"text-ink-3")` put a size and a colour in one conflict group and
returned only the colour — fourteen call sites rendered at the
inherited 16px with the class sitting right there in the source. The
scale's names are declared in `src/lib/cn.ts`; a new step goes in that
list and in `globals.css`, and `browser:type` fails if the two drift.

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

Eleven times a complete, tested, documented module has turned out to have
nothing that starts it — and the sixth is the product itself:

1. **Billing** could invoice a customer no code path could create.
2. **sendFile** could send an attachment nothing could upload.
3. **deals/** could plan a transfer no accepted offer ever began.
4. **The vendor report** had no vendor to send to.
5. **documents/** swept for expiring broker cards every night, and
   nothing could file one.
6. **The assistant** read an active `QualificationProfile` and handed
   over to a human when there was none. Nothing had ever created one, so
   it had never answered a single enquiry, for anybody. The product's
   one-line promise, never once executed — and invisible, because a
   handover means a person replies and a person replying looks like a
   working inbox.
7. **Quiet hours.** Nothing wrote a `NotificationPrefs` row, so
   `inQuietHours` was asked about a null window every time and said no
   every time — every notification pushed at any hour, on any day,
   including the ones `rules.ts` calls `digest`. The tell was `urgency`:
   a field read in exactly one place, to decide whether an urgent
   message may override quiet hours, and therefore inert. **A declared
   field that changes no behaviour is the same shape as a module nothing
   calls** — worth checking for directly. That one is worth reading in full, because it
   is the shape at its most convincing: renewal lead times researched
   per document type, warnings grouped per recipient, a README arguing
   why the broker card is the one that catches people out — and the
   nightly job reported success every morning for finding nothing.
8. **Lead scoring**, and it is the variation worth knowing about,
   because everything above it was *not running*. This was. The nightly
   sweep computed a 0–100 score from four components, wrote
   `Lead.score`, wrote a `LeadScoreEvent` with a plain-English driver
   list, and compared each lead against its own value six days ago to
   say "warming — up 12 points this week". Every night, correctly, for
   every lead. **No screen had ever displayed any of it.** There was no
   entry condition to fail and no first row to write — `reachability.py`
   is looking for a model nothing writes, and this model was written to
   nightly. The gap was on the way out, not the way in.

   So the third diagnostic question below has a fourth beside it: **who
   reads it?** A column with a writer and no reader costs a query per
   lead per night to produce a number nobody has ever seen.

9. **The rate limit on the front door.** `ratelimit.ts` carried a rule
   named `auth.magicLink` — five attempts in fifteen minutes — from the
   day it was written, and **nothing ever invoked it**. Five other
   actions called `limitAll`; the one guarding sign-in did not. The
   endpoint accepted unlimited requests and sent a real email through
   Resend for every one, from the verified sending domain. Worse than
   the eight above it, because a reviewer reading `ratelimit.ts` sees
   the rule and concludes the door is locked.
10. **The alerting.** Severity routing, runbooks, deduplication, closing
   an alert when its condition clears — all of it correct, and
   `notify()` ended in `log.warn` beneath a comment reading "PagerDuty,
   Opsgenie or a Slack channel goes here". A stopped cron raised a PAGE
   into a log file nothing was shipping. **Nobody was ever paged.**

   These two produced the fifth diagnostic question: **what invokes
   it?** `check:limits` asks it of every rate-limit rule, in both
   directions — because `limit()` returns *allowed* for an unknown
   action, so a typo'd name reads as a wired limit and enforces
   nothing.
11. **Sanctions screening**, and it is the one with legal consequences.
   `aml/screening.ts` had the provider interface, the UAE list names,
   `interpret()` with its freeze-the-funds guidance, and
   `AUTO_CLEAR_THRESHOLD = null` with a paragraph on why nothing may
   auto-clear. **No code path reached any of it, and `Screening` had
   never had a row.**

   What made it dangerous rather than merely absent was the screen.
   `aml.reports` selects screenings that are `POSSIBLE_MATCH` or
   `CONFIRMED_MATCH` and renders them as *pending*, so the compliance
   officer's desk was permanently empty — and an empty compliance queue
   does not read as "nobody has ever been screened". **It reads as a
   clean shop.** The absence was the reassurance.

   Two decisions in the fix are worth keeping. A missing provider
   records `ERROR`, never `CLEAR`, because a fabricated clear is worse
   than no screening at all: it turns a missing control into positive
   evidence that a check happened, timestamped, in the file an inspector
   reads. And `ERROR` had to be added to that queue's filter — it was
   excluded, so a screening that failed was invisible on the one screen
   meant to catch it.

   This produced a sixth question, which is really the fourth turned
   around: **what does this screen look like when the thing behind it
   has never run?** If the answer is "the same as when everything is
   fine", the screen is not a control.

`architecture.py` catches a module nothing *imports*. `reachability.py`
catches the subtler one — a module that is imported, called correctly,
and whose entry condition never occurs. **A light switch wired to
nothing.** It now scans every model in the schema against a
`KNOWN_UNWRITTEN` ratchet, so the remaining three are visible and a new
one is a build failure.

The question to ask of anything new: **what writes the first row?** And
then the second, which found the missing half of the register: **what
closes it?** And a third, which team visibility produced: **if this
setting were ignored, what would look different?** The head start was
computed, exported, documented and applied to the wrong thing — a
manager saw today's figures under yesterday's date — and no test that
compared timestamps rather than numbers could have told. A row that nothing supersedes, completes or expires
alarms for ever, and an alarm that never stops is one somebody switches
off. And the fourth, which lead scoring produced: **who reads it?**

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

## Run the tests

    npm test          # 279 assertions, pure functions, no database
    npm run verify    # tsc, the tests, 25 check suites, 16 audits

**The gate is now green end to end, including the two things that used
to skip.** `verify` reports what it did not run rather than counting a
skip as a pass, and for a long time it reported two:

- **`check:load` had never been run.** It has now: 5,000 leads, 1,200
  listings, 6,500 requirements, 40,000 messages, built in 8s. Every
  query an agent waits on is inside budget — the pipeline's first page
  at 5ms warm, search at 46–65ms, "who wants this property" at 67ms. The
  slowest *first* call was 108ms and it is the first query in the
  process, so that is connection setup rather than the query, which is
  the measurement behind "a pooler in front of Postgres is not
  optional". Run it with `npm run verify --load`; it takes minutes.
- **`check:whatsapp-inbound` needs `WHATSAPP_APP_SECRET`.** Any value
  works locally — it is the HMAC key the check signs its own fake
  webhook with. Without it the one end-to-end proof that an inbound
  message becomes a lead, a conversation, a stage and a 24-hour window
  simply did not run.

`npm test` was declared from day one with no test files behind it, so it
exited 1 and said "No test files found". There are eleven files now, and
they cover the pure logic where being wrong is silent: the fils unit, the
24-hour window on both sides of the boundary, Dubai sending hours, the
search parser's plural intents and budget bands, lead scoring, deal
risk, and the assistant's guardrails.

The guardrails file is the one to read first. It is the last code
between a language model and a customer's WhatsApp, and it fails in two
directions: too permissive lets an invented price reach a buyer, too
strict refuses an ordinary enquiry and hands it to a person — which is
invisible, because a person answers it. The second is the one that
actually happened.

Each was checked by breaking the thing it guards and confirming the suite
goes red — a test that cannot fail is decoration.

`passWithNoTests: false` is set deliberately. A run that finds nothing is
a failure, not a pass — that is the hole that let the command sit broken.

They do not replace the check suites. Those need a real Postgres because
tenant isolation cannot be proved against a mock.

## Run the audits

There are **fifteen**, in `04-audit-scripts/` at the repository root.
All fifteen are green and all of them belong in CI.

    pip install -r ../../04-audit-scripts/requirements.txt
    ../../04-audit-scripts/run-all.sh

**Use the runner, not the individual scripts.** They do not all take the
same argument — six want the application, four want the website,
`claims.py` wants both in that order, and `consistency.py` wants the
repository root because its job is comparing surfaces to each other.
Passing one path to all fifteen is what somebody does, and the ones
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
8. Three documents describing this codebase, disagreeing with it and
   with each other. `HANDOVER.md` previously said 34 models, 11 routers and 11
   scheduled jobs against a real 73, 27 and 25 — under a heading that
   reads "The shape of it", which is the first thing a new reader sees.
   Nobody types a wrong number on purpose; they were right once and the
   code moved. `counts.py` checks them now, the same argument
   `ratios.py` makes about contrast ratios written in comments.

**One warning about the tooling.** It has produced nine false positives
across these reviews, and once I acted on one and added a `signal` option
to a Prisma query — the tool caused the fault it exists to prevent.

The pattern is exact: checks phrased *"confirm this"* have been right
every time. Checks phrased *"this is broken"* have been wrong ten times.
**Verify before you fix.** The tenth: a sweep found `COMPLIANCE_OFFICER`
rendering on `/team` and it was a *user's name* in the dev database
(`Test COMPLIANCE_OFFICER`), with a correct `Compliance officer` chip
beside it.

**A check that cannot fail is decoration, and `browser:roles` was.** It
reported PASS with the dev server switched off. Three faults, any one
enough: `goto(...).catch(() => {})` swallowed the connection refusal;
Chrome's "site can't be reached" page is longer than its 60-character
blank threshold; and it never asserted a permission at all — `denied`
was computed, printed and never checked, so a VIEWER shown the full deal
book would have passed. It now carries a ratchet of what each role meets
on each screen, in the spirit of `KNOWN_UNWRITTEN`. **Prove a new check
red at the exact call site before trusting it green** — put the bug
back, watch it fail, put it right. Doing that is what found this, and
what found the next one.

**A browser check must wait for the data, not for the heading.** Every
assertion in `browser:type` waited 700ms after the `h1` — and on
`/leads` the `h1` is the lead count, which paints while the list is
still in flight. The whole suite had been measuring empty pages, and
what found it was doing what this file asks of a new test: the bug it
was written for was put back on purpose, and the check stayed green.
Waiting for the rendered text to stop changing is *also* wrong — a page
waiting on a query sits perfectly still. `open()` counts in-flight
`fetch` calls, wrapped from `addInitScript` so the counter exists before
the page's scripts run; wrapping it afterwards misses the requests being
waited for. `networkidle` hangs, because `/inbox` polls.

**And network-quiet alone is not enough either.** The shell's own
queries satisfy "a request has been made" and finish early, so there is
a quiet, stable window *before* the screen's query is issued. Three runs
of `browser:roles` disagreed with each other about which screens were
refused, from identical code against identical data, until it waited a
minimum dwell as well as for quiet. This app has no single "finished"
signal; the honest description of what these checks do is a heuristic
with an empirical floor under it.

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

- ~~Most React screens.~~ **Out of date and left here as a warning.**
  There are 41, every one of them opens in a browser, and
  `browser:screens` fails the build if one stops rendering or starts a
  refetch loop. This line survived the screens being built, which is the
  same drift the audit scripts exist to catch — in the file that warns
  about it.
- The Expo screens. `mobile/` has push, offline policy and auth, and
  cannot build: no `app.json`, no `tsconfig.json`, no `babel.config.js`,
  no assets, an Expo SDK two years old, and a sign-in flow expecting a
  `?session=` token the web app cannot issue.
- **A screening provider.** The write path exists now — `aml/screen.ts`,
  the nightly `aml.screening` sweep and `aml.rescreen` — and there is no
  vendor behind the `Screener` interface, because Dow Jones, Refinitiv
  and LexisNexis all need a commercial agreement. Until one is
  registered, every file records `ERROR` with `provider: "none"` and
  appears on the compliance desk as *not checked*. **That is the
  designed behaviour, not a bug to tidy away**: the alternative is a
  stub returning no hits, which writes `CLEAR` and states in the record
  that a check happened.
- **Drafting listing copy.** `copy.draftListing` builds the prompt and
  never calls the model — the line was `const draft = ""`. It now throws
  `NOT_IMPLEMENTED` rather than returning `{ draft: "", problems: [],
  publishable: true }`, which is what it did: **an empty advertisement
  marked fit to publish**, because `check("")` finds nothing wrong with
  an empty string.

  Its screen, `listings/draft-copy.tsx`, was mounted by nothing and is
  deleted — recover it from `327f11b` when the model call is wired.
  Worth knowing it existed: the UI is written, so finishing this is the
  generation call and re-adding one component, not a feature.

  `copy.checkCopy` is unaffected and genuinely works. It needs no model,
  and checking copy an agent typed against the portal rules is the half
  of this that is finished.
- goAML submission, image quality checks. Nothing produces a
  `QualityIssue`; `collect.ts` says so at the definition.
- Migration source adapters.
- **Connecting a mailbox.** `email/sync.ts` is written and
  `EmailAccount` has never had a row, because there is no OAuth flow
  against Google or Microsoft — that needs an app registration with
  each, which cannot be obtained from inside this repository. Tokens
  now have somewhere to go (`lib/secrets/vault.ts`); the handshake that
  produces one does not exist. The Gmail half of `normalise` is also
  unwritten and **throws** rather than returning zero messages, because
  a mailbox that syncs nothing is indistinguishable from a quiet one.
- ~~An external heartbeat — the alerting cannot report its own absence.~~
  **Built.** `health/deliver.ts` has `heartbeat()` and `alert.ts` calls
  it on a successful evaluation, so silence at the far end is the alarm.
  Left struck through rather than deleted because this line was read as
  current by an audit *after* the thing was built, and the wrong answer
  was given to the person who asked. A stale "not built" list is the
  same defect as a stale count, and it fails in the more expensive
  direction: it invites somebody to build a second one.
