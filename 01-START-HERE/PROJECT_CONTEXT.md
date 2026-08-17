# PROJECT_CONTEXT.md

Everything needed to continue PotatoFarm.io. Written to be read first,
before any file is opened.

Anything genuinely not known is marked **UNKNOWN** rather than guessed.
Every number here was counted from the code on the day it was written,
not carried forward from the last version of this document — which is
how the previous one came to describe folders that did not exist.

---

## 1. What this is

**PotatoFarm.io** — a WhatsApp-native lead qualification CRM for UAE
real estate brokerages.

- **Price:** $70 per agent per month (AED 257 + 5% VAT), 60 pooled
  conversations per agent, 35 fils per conversation beyond that
- **Owner:** Christopher Simon, COO of EDM Holdings, Dubai
- **Core promise:** an enquiry is answered in ~90 seconds, day or night,
  because portal leads go to four agencies at once and the first to
  reply usually gets the viewing

**State:** it compiles, it builds, it runs, and tenant isolation has been
tested against a real Postgres. **No customer has ever used it and no
message has ever been sent to a real phone number.** Nothing is deployed.

---

## 2. The folders

Numbered, because roughly seventy documents refer to each other by path
and renaming them all at once buys nothing.

| Folder | What it is |
|---|---|
| `01-START-HERE/` | This file and the GitHub setup notes |
| `02-the-project/app/` | **The application.** Next.js, 190 source files |
| `02-the-project/website/` | The marketing site. 10 static pages |
| `03-brand/` | Logo files, brand spec, design-system reference pages |
| `04-audit-scripts/` | **13** Python checks |
| `05-documents/` | Reviews, investor memos, competitive analysis |
| `06-skills/` | Packaged skills and project knowledge |

Two folders that used to be here and are not:

- **`99-superseded/`** — 1.4MB of abandoned designs carrying the wrong
  palette and the wrong pricing copy. Committed once so git keeps it,
  then deleted. `git log` will find it.
- **`02-the-project/website-api/`** — see section 6.

`preview-*.html` files in the website folder are **generated** and
git-ignored — they inline the CSS and JS so a page can be opened without
a server. Do not edit them and do not deploy them.

---

## 3. Technology

### The website
Plain **HTML, CSS and JavaScript**. No framework, no build step, no
`npm install`. Ten pages. Open a file in a browser and it works.

### The application

| | Version |
|---|---|
| Next.js | ^15.1.0 (App Router) |
| React | ^19.0.0 |
| TypeScript | ^5.7.0, `strict` **and** `noUncheckedIndexedAccess` |
| Prisma | ^6.1.0 |
| tRPC | ^11.0.0 |
| NextAuth | ^5.0.0-beta.25 |
| Zod | ^3.24.1 |
| Tailwind | v4, `@theme inline` in `src/styles/globals.css` |

**Database: PostgreSQL.**

**The AI layer**, added after the S.MPLE audit — see
`05-documents/SMPLE-GAP-ANALYSIS.md`:

| | |
|---|---|
| `lib/requests/intake.ts` | One sentence → structured fields, with a confidence gate |
| `lib/requests/apply-intake.ts` | Those fields → lead, requirement, facts, follow-up, match |
| `lib/intelligence/score.ts` | Four components out of 25, rules not a model |
| `lib/intelligence/next-action.ts` | One action per person, ordered by urgency |
| `lib/intelligence/sweep.ts` | Nightly, in the jobs layer, never in a request |
| `api/routers/today.ts` | The briefing the command centre reads |
| `lib/deals/risk.ts` | Deal health — timeline, silence, blockers, money |
| `lib/intelligence/autonomy.ts` | What may run unattended, and what never may |
| `api/routers/activity.ts` | What the assistant did, and undo |
| `ClientFact` | Memory the CRM has no columns for |
| `lib/voice/transcribe.ts` | Speech to text, any OpenAI-compatible provider |
| `lib/record.ts` | Browser recording, including Safari's mp4-only path |

There is also `mobile/` — an Expo shell carrying push, offline policy and
auth. **It cannot build.** No `app.json`, no `tsconfig.json`, no
`babel.config.js`, no assets, and it targets Expo SDK 51 / React Native
0.74. Its sign-in flow expects the web app to hand back a `?session=`
token, which the web app cannot do. Treat it as a design sketch.

---

## 4. What is built

**73 database models · 60 enums · 27 API routers · 149 procedures ·
43 screens · 26 scheduled jobs · 15 audit scripts · 24 check suites.**

**Eight procedures have no screen.** Seven are deliberate:
`migration.abandon`, `aml.updateFile`, `aml.checkRear`,
`aml.visibilityPolicy`, `onboarding.previewImport`, `leads.assign` and
`org.switch`. `reachability.py` prints them by name every run.

The eighth, `copy.draftListing`, is **not** deliberate — it is
unfinished. It built its prompt and never called the model, returning an
empty description marked publishable. It throws `NOT_IMPLEMENTED` now.
Its sibling `copy.checkCopy` works, needs no model, and has a screen.

`listings.update` was on this list and was **not** deliberate: a
property could be added and then never changed — not the price, not the
status, not the permit number that arrives a week later. A price
reduction is the most common edit there is in this market. It has an
edit dialog now.

Stated as a count rather than a ratio on purpose — `reachability.py`
counts procedures per router and `counts.py` counts them across the
schema, and a ratio built from two different measurements is a number
that looks precise and is not. Every figure in this paragraph is
checked by `counts.py`, which is the reason they are now right: all
three documents describing this codebase disagreed with it and with
each other.

Working areas: the WhatsApp assistant and its stop controls; the inbox;
pipeline and leads; listings with Trakheesi permit tracking; viewings
(book, reschedule, outcomes); offers (record, present, counter, accept);
vendors and weekly owner reports; deals through to DLD transfer;
commission; AML and compliance; the agent blackbook; email sync; billing
with a conversation allowance; Meta lead ads; reports with a baseline
chart; spoken requests ("Ask").

### What has been proved, not assumed

- `npx tsc --noEmit` exits 0. It began at **352 errors**.
- `npm run build` succeeds. Every route compiles: 38 pages and 11 API
  routes. **None of the 38 is prerendered, and that is deliberate** —
  the nonce in `script-src` requires per-request rendering. See the
  security note in section 13. It costs little here: every page is
  behind sign-in and fetches through tRPC on the client, so what used to
  be prerendered was an empty shell.
- Seven migrations exist and apply cleanly to an empty database.
- **Row-level security was tested with two brokerages in one database.**
  The second cannot see the first's leads. This is the whole security
  promise of the product and it is the one thing worth re-testing after
  any change to `src/server/db/`.
- Sign-in works end to end from a cold browser.
- The website's demo form and its four guide forms were submitted in
  Chromium, at 1280px and on an iPhone 13, against a real database.
- All 15 audit scripts exit 0.
- **Object storage works against any S3-compatible provider** — AWS, R2,
  B2, Spaces, MinIO — with request signing done in-repo rather than by an
  SDK. Verified against the signature AWS publishes in its own
  documentation, and round-tripped through a local S3-shaped server that
  checks the signature independently.

- **The AI layer is real, not a column.** `Lead.score` is written nightly
  with its four components and its history; every assigned lead gets at
  most one recommended action with a stated reason; and one spoken
  sentence creates the person, the requirement, the facts, the follow-up
  and a match.

### One command before you deploy

```bash
npm run verify
```

That is `tsc --noEmit`, then the 233 unit tests, then the check suites,
then every audit script — one run, and it reports every failure rather
than stopping at the first. It exists because the alternative was a
long ritual in a particular order, and the thing about a long ritual is
that somebody eventually runs all but one of the steps, and it is never
the same one.

**A machine runs it now.** `.github/workflows/verify.yml` runs the whole
gate on every push and weekly, with Postgres as a service container and
a second job that installs Chromium and drives the browser suites
against a real server. Until the board audit nothing ran any of this
automatically, and the entire quality argument rested on a person
remembering — which is exactly the condition under which two suites were
found to have been passing while measuring nothing at all.

The unit tests run **before** the check suites deliberately: if the
window arithmetic or the money formatter is wrong there is no point
spending two minutes seeding Postgres to find out.

**Twelve of them need Postgres, and `verify` fails without it rather
than skipping.** That is deliberate and it is the same principle
as everything else here: one of those seven is the tenant-isolation
check, and a green result that silently did not test tenancy is worse
than no command, because somebody deploys on the strength of it. **A
check that reads nothing must not be able to look like a pass.**

For the laptop case there is `VERIFY_ALLOW_NO_DB=1 npm run verify`,
which runs the ones that need nothing and prints — in the summary, not
just at the top — exactly which did not run.

### The twenty-four things you can re-run

```bash
npm run check:tenancy       # two brokerages, one database, no leakage
npm run check:intake        # one sentence → client, requirement, match
npm run check:intelligence  # scoring, next-best-action, the nightly sweep
npm run check:voice         # speech to text, including the iPhone path
npm run check:deals         # deal risk, and the reason it gives
npm run check:autonomy      # the ceiling holds at every mode
npm run check:buyers        # who wants this property, and who may be told
npm run check:search        # one sentence → people and properties
npm run check:qualification # the assistant has a script, and follows it
npm run check:quiet         # quiet hours actually hold anything back
npm run check:migration     # an import can be started, not just inspected
npm run check:vault         # a credential can be written and read back
npm run check:visibility    # what a manager may see, and when
npm run check:bands         # where Hot begins, in one place only
npm run check:sigv4         # request signing vs AWS's published vector
npm run check:storage       # upload, read back byte-for-byte, delete
npm run check:load          # 5,000 leads, and where it gets slow

# Added by the board audit, and each exists because something was wrong
npm run check:limits        # every rate-limit rule is invoked, every call has a rule
npm run check:preflight     # alerting wired; pooler, secrets and plan present
npm run check:billing       # signup → invoice → signed webhook, over real HTTP
npm run check:whatsapp-inbound  # an inbound message becomes a lead
npm run check:routing       # who a new enquiry goes to
npm run check:availability  # and whether they are actually available
npm run check:blocking      # nothing holds a request open that should not
```

These are not unit tests and are not trying to be. They need a real
Postgres because what they prove — tenant isolation above all — cannot be
proved against a mock. Each was verified by deliberately breaking the
thing it checks and confirming it fails.

### The unit tests

```bash
npm test                    # 242 assertions, no database, ~3 seconds
```

`package.json` declared `"test": "vitest run"` from the beginning with no
test files and no config behind it, so the command exited 1 and said "No
test files found" — a command claiming to run tests that could not, which
is the same shape as a button that does not do what it says.

Seven files, and the selection is not "whatever was easy to test". Every
case is a bug that actually happened here or a rule whose failure would
be silent:

| | |
|---|---|
| `lib/money.test.ts` | The unit is fils. The 100× bug, in assertions |
| `server/lib/whatsapp.window.test.ts` | The 24-hour window, including both sides of the boundary |
| `server/lib/matching/sendable.test.ts` | Dubai hours, and the 23:38 bug |
| `server/lib/search/parse.test.ts` | Plural intents, budget bands, people vs properties |
| `server/lib/intelligence/score.test.ts` | Recency decay, the book-band bug, the two overriding statuses |
| `server/lib/deals/risk.test.ts` | Blockers, silence thresholds, one action or none |
| `server/assistant/guardrails.test.ts` | What reaches a customer, and what is refused |
| `server/lib/calendar/ics.test.ts` | The feed a phone subscribes to — folding, escaping, UIDs |

**They were checked against deliberate breakage, not just run.** Setting
a new lead's recency back to zero, moving the silence threshold from 7
days to 70, and downgrading a recorded blocker from AT_RISK to WATCH each
turned the suite red. A test that cannot fail is decoration.

`vitest.config.ts` sets `passWithNoTests: false`, because a run that
finds nothing is a failure and not a pass — that is the exact hole that
let the command sit broken.

**Writing them found a real bug.** `usd()` decided whether to print cents
with `dollars % 1 === 0` on the raw quotient. Dividing by the peg almost
never lands on a whole number, so the product's own price — round-tripped
through `usdToFils(70)` — came back as 70.00136… and printed "$70.00" on
a page whose headline says $70.

### The browser checks

Eighteen of them. They need a browser and a running server, so most are
a separate step rather than a silent skip inside the gate — `verify`
runs `browser:type` and `browser:screens` and names the rest.

**Until the board audit they could only run on one machine.** Every one
imported Playwright from `/opt/node22/lib/node_modules/playwright/index.js`,
an absolute path, and Playwright was not a declared dependency. That is
much of why they were never in CI. They are ordinary imports now.

```bash
npm run dev &                 # they drive the real thing, not a mock
npm run browser:a11y          # keyboard only, screen reader, 200% zoom, dialogs
npm run browser:roles         # VIEWER / COMPLIANCE / MANAGER see a sentence, not a crash
npm run browser:palette       # 21 screens: no colour outside the brand family
npm run browser:chaos         # bad ids, triple submit, forged cookie, headers
npm run browser:optimistic    # the row leaves early — and comes back if it fails
npm run browser:installable   # manifest, worker, and what it put on the device
```

They find a different class of problem from the eleven suites — the
eleven prove the logic, these prove what a person actually meets. Each
has caught something the others could not: a VIEWER told "that didn't
load" when the server had correctly refused, a dialog that ran off an
iPhone with its Close button unreachable, and search results announced
to nobody.

**`browser:installable` needs the server stopped for its second half,
and that is the only honest way to test it.** Playwright's `setOffline`
and CDP's `emulateNetworkConditions` both govern the *page's* requests
and leave the service worker's own `fetch` going to the real network —
so an "offline" navigation quietly succeeded, returned the sign-in page,
and the check would have passed while proving nothing. Build, start,
run phase 1, stop the server, then `OFFLINE=1`.

**`browser:optimistic` tests the half everybody skips.** Holding the
mutation for 2.5 seconds and asserting the row is gone in under half of
one proves the speed; forcing the same call to 500 and asserting the row
**comes back and something says so** proves it is safe. An optimistic
update that silently reverts is worse than a spinner — the row reappears
and the agent cannot tell whether the work was recorded.

**`browser:palette` refuses to report a clean sweep on a page that
redirected to sign-in.** It counts what it scanned and prints that
number, because the first version of it "passed" 21 screens that were
all the sign-in page.

**`check:load` is the odd one and is not in `verify`'s critical path in
the way the others are.** It seeds a database, which takes minutes and
leaves rows behind, so it is for before a release rather than before a
commit. It also reports **cold and warm timings separately**, on purpose:
they need opposite fixes, and averaging them once hid a 415ms figure that
was entirely cold start behind a query that actually took 5ms. Two
findings came out of it and both are now migrations — trigram indexes for
search, and an `ANALYZE` after bulk insert without which a message-history
read took **50 seconds**.

---

## 5. What is NOT finished

### Blocked on you, not on code

Nothing can be deployed until these exist. They cost money and need
your name on them:

1. **A Postgres database** with two roles — one that owns the tables and
   one that does not. `DATABASE_URL` must be the second, or row-level
   security enforces nothing. See `src/server/db/rls.sql`.
2. **A Resend account with a verified sending domain.** Sign-in is a
   one-time link to a work email, so **email delivery is the only way
   into the product**. An unverified sender puts every sign-in link in a
   junk folder and the failure looks like the application being broken.
3. **Vercel Pro, about $20/month.** 26 cron jobs and `maxDuration = 300`
   both require it; Hobby allows 2 crons once a day at 60 seconds.
4. Anthropic, WhatsApp Business, Meta and Stripe credentials, as and when
   each feature is wanted. The application boots without them and says in
   the log exactly what stops working — see `src/instrumentation.ts`.
5. **Somewhere for alerts to arrive** (`ALERT_WEBHOOK_URL`) and **a
   dead-man's-switch monitor** (`HEARTBEAT_URL`). Added by the board
   audit and not optional: every health check in this product runs
   inside the application, so if the deployment is down the code that
   would notice is down too. Healthchecks.io or Better Stack, free tier,
   five minutes.
6. **Point-in-time recovery on the database.** The retention window must
   exceed **five years for KYC files** — UAE AML law requires it, and it
   is why erasure defers when one exists. Most providers default to 7–35
   days, which is not enough for the documents that matter.

`PREFLIGHT_ENV=1 npm run check:preflight` refuses to pass until these
are real, and names the one that is missing. It also refuses a
`DATABASE_URL` that is not pooled, a `SECRETS_KEY` that is not 32 bytes,
and any secret still carrying a development placeholder.

### Five procedures have no screen, all deliberately

| | Why |
|---|---|
| `aml.checkRear` | Internal check; no cash panel to call it from — see section 6 |
| `aml.visibilityPolicy` | Read by other code, not by people |
| `onboarding.previewImport` | Superseded by `migration.inspect` |
| `org.switch` | Multi-brokerage accounts do not exist yet |
| `leads.assign` | Single-lead assign; the screen uses `pipeline.bulkAssign` |

`requests.mine` used to be a sixth and was the only one the audit called
genuinely missing rather than deliberate. It has a screen now, under
Ask — an agent can see what they asked for earlier and what came back.

### Not built at all

- **A secrets provider.** `readSecret(ref)` resolves `SECRET_<ref>` from
  the environment and that is the whole implementation. Fine for a pilot
  with one brokerage; not fine for ten.
- **Vendor-side conversations.** `Conversation.vendorId` exists in the
  schema and 17 call sites still read `conversation.lead`. Owner
  conversations are therefore half-wired.
- **Voice recipes** `BOOK_VIEWING` and `COMPARABLES` return a follow-up
  question rather than completing in one step. Deliberate, but the second
  step is not wired to the booking screen.
- **Unit tests cover ten modules, not the codebase.** 242 assertions
  across money, the 24-hour window, Dubai sending hours, the search
  parser, lead scoring, deal risk and the assistant's guardrails — the
  pure logic where being wrong is expensive and silent. Everything
  stateful is still covered only by the twenty-four check suites and the
  eighteen browser checks, which is not the same thing as a test suite. What is
  left untested in `assistant/` is everything that needs a model:
  `run.ts`, `prompt.ts` and `extract.ts` are exercised only through
  `check:autonomy` and by replaying real transcripts.
- **The Expo app.** See section 3.

---

## 6. Things that were removed rather than faked

Each of these was a control on a screen that could not do what it
appeared to do. A button that looks like it works and does not is worse
than no button, because somebody relies on it.

**The REAR cash panel.** The compliance screen offered to record a cash
payment against a deal. There is no payments model — nowhere for the
amount to go. `aml.checkRear` still exists for whoever builds one.

**"Import contacts".** The button existed; no import runner did.

**The "dispute raised" confirmation.** `routing.dispute` is a read-only
query. The screen told an agent their dispute had been logged and nothing
had been.

**`website-api/`.** A second Next project with no `package.json`, no
`next.config` and two conflicting app directories. It could not be
deployed, so the marketing site's only conversion path posted to a URL
nothing served. Its two endpoints — `/api/demo` and `/api/subscribe` —
now live in the application at `app/src/app/api/`, and the website posts
cross-origin to `app.potatofarm.io`. **Deploy the application before the
website**, or the forms are live and dead.

**Cloudflare Turnstile.** Configured, imported, called — and no Turnstile
widget was ever put on the page, so no token was ever sent, so the check
read a key that was not set and returned true every time.

---

## 7. Bugs found and fixed

The three the previous version of this document listed as fixed were
fixed. These are the ones found since, kept because the *pattern* is what
generalises.

**The front door had no lock.** `ratelimit.ts` carried a rule called
`auth.magicLink` — five attempts in fifteen minutes — from the day it
was written, and **nothing ever invoked it**. Five other actions called
`limitAll`; the one guarding sign-in did not. So the endpoint accepted
unlimited requests and sent a real email through Resend for every one,
from the verified sending domain: anyone could fill a competitor's inbox
with our sign-in links, at our cost, until the domain was blocklisted —
at which point invoices and vendor reports stop arriving too. Six POSTs,
six successes, verified against a running server.

**And the obvious fix was an outage.** Keying one tight rule on both the
address and the caller IP locked a brokerage out of its own product: an
office shares one NAT address, so five sign-ins in fifteen minutes
spends the window for everybody. Two budgets now — tight on the address,
six times looser on the caller. `check:limits` asserts every rule is
invoked and every invocation has a rule, because `limit()` returns
*allowed* for an unknown action, so a single typo would read as a wired
limit and enforce nothing.

**Nobody was ever paged.** The alerting system was complete —
classifying every incident PAGE / TICKET / LOG, attaching runbooks,
deduplicating, closing alerts when their condition cleared — and its
last step was `log.warn`, under a comment reading "PagerDuty, Opsgenie
or a Slack channel goes here". A stopped cron raised a PAGE into a log
file nothing was shipping. Alerts leave the process now, and a
dead-man's-switch heartbeat closes the loop the audit named: *the
alerting cannot report its own absence*.

**Two checks were decoration.** `browser:roles` reported PASS with the
dev server switched off — navigation errors swallowed, a blank-page
threshold shorter than Chrome's error page, and no permission asserted
anywhere. The typography suite had been measuring *empty pages*, waiting
on a heading that paints before data arrives. Both repaired, and both
proved red before being trusted green. **A passing check is not evidence
until it has been shown capable of failing.**

**The assistant refused to discuss Arabian Ranches.** `PROTECTED_TOPICS`
was matched with `includes()`, and substrings of those words are
everywhere in property English: "Arabian Ranches" contains `arab`,
"single storey" contains `single`, "terrace" and "Meydan Racecourse"
contain `race`. Every such enquiry was handed to a human as a protected
attribute, and the assistant's own drafts naming the community were
discarded on the way out. Arabian Ranches is one of the largest
communities in Dubai and a canonical entry in this product's own
`places.ts`.

The failure was invisible by construction. The message went to a person,
the person answered it, and the only symptom was that the assistant
seemed not to handle very much — against a product whose entire promise
is a reply in ninety seconds. Now matched on word boundaries, with bare
`single` removed and the discriminatory phrasings ("singles only", "no
bachelors") listed instead.

**Then the same probe found the rest of `screenInbound` doing it too.**
Running fifteen realistic Dubai enquiries through the handover rules,
**ten** were sent to a person:

| Enquiry | Matched | Rule |
|---|---|---|
| "which is the lowest floor available?" | `lowest` | negotiation |
| "the traffic on SZR is terrible" | `terrible` | complaint |
| "do I call the concierge or the agent for access?" | `call … agent` | explicit_request |

`lowest` now needs money beside it and explicitly not a floor or a unit;
`terrible` alone is gone and the complaint words are about *us*
("terrible service", both word orders); and the explicit-request pattern
no longer lets `.*` span the whole message — the verb and the person have
to sit together, with "call me" kept because a callback request is
exactly that.

**`mortgage` and `tax` were deliberately left wide.** A factual question
about the seller's existing mortgage still goes to a person. The downside
is asymmetric — a false handover costs ninety seconds, a wrong word about
UAE mortgage or tax treatment from an unlicensed source costs more — so
narrowing those two is a decision for somebody who knows the licensing
position, not for a regex. It is pinned in a test so it reads as a choice.

**Three separate 100× money errors.** `Lead.budgetMax` and
`Listing.price` were `Decimal` AED while everything else was `BigInt`
fils. The first thing to join them would have shown a buyer a property at
a hundred times their budget.

**The assistant's price guardrail rejected every correct reply.** It
compared a figure in fils against a budget in AED, so any accurate price
looked ungrounded and the conversation went to a human. The safety
feature would have disabled the product.

**`forOrg()` scoped the wrong connection.** It ran
`set_config('app.current_org', …)` and the query as two separate
statements on a pooled client, so they could land on different
connections. Every screen came back empty under RLS. Now one array-form
`$transaction`, which is the only way to guarantee both run on the same
connection.

**RLS covered 12 of 59 tenant tables** — and simultaneously made sign-in
impossible, because sign-in must read `Membership` before any tenant is
known. `rls.sql` now discovers tenant tables from
`information_schema.columns` rather than a hand-written list, and
`crossTenant(reason)` uses a separate privileged connection.

**Middleware had never run.** It sat at the repository root; Next only
reads it from `src/` when a `src/` directory exists. It also protected
`/app`, a route *group* that never appears in a URL.

**Two Tailwind tokens used 42 times generated no CSS.**
`--color-accent-type` and `--color-accent-edge` were missing from
`@theme inline`, so `text-accent-type` was a class with no rule.

**The anti-spam honeypot named itself.** `website: z.string().max(0)`
failed validation before the honeypot check could run, returning a 422
that named the trap field.

**Sign-up could never insert a row.** The NextAuth Prisma adapter
requires a fixed `User` shape; the schema had `name` non-null and an
`avatarUrl` column with no `image` mapping.

**Meta lead ads could never be connected.** `META_LEAD_ADS` was missing
from both `ChannelType` and `LeadSource`.

**A rate limiter that was no limit at all.** The website forms used a
module-level `Map`, which on serverless is per-instance.

**The recurring shape, and the question that catches it:** four times, a
complete, tested, documented module turned out to have nothing that
started it. Billing could invoice a customer no code path could create.
`sendFile` could send an attachment nothing could upload. `deals/` could
plan a transfer no accepted offer ever began. The vendor report had no
vendor to send to. **Ask of anything new: what writes the first row?**

---

## 8. Design — colours

Ground `#F4F3F0`. Panel `#EBEAE6`.

**`app/src/styles/tokens.css` is the only source of truth**, imported by
`globals.css`. The palette is declared in four places — that file, the
website's `assets/site.css`, and inline in each of the two reference
pages in `03-brand/design-system/` — and **`consistency.py` now compares
all four hex by hex** and fails on any drift. That check did not exist
until a fourth, stale copy turned up in `03-brand/design-system/` with a
visibly different orange (`#FF6E00`) in the folder a designer opens
first. Nothing imported it, so nothing caught it. It is deleted.

`PALETTE-V4.md` carries the *reasoning* — why the ground is warm, why
there are two oranges — and its hexes are historical. It says so at the
top.

| Use | Hex | Contrast on ground |
|---|---|---|
| **Headings, tabs, links, accents, `.io`** | `#FF6B35` | 2.56:1 — see below |
| **Button fills** | `#FF6B35` | label stays ink at 6.14:1 |
| Body | `#4A4A4A` | 8.34:1 |
| Captions, small orange type | `#A84015` | 5.55:1 |
| Muted | `#6B6B6B` | 5.86:1 |
| Ink — button labels, figures, tables | `#1A1A1A` | 16.94:1 |
| **Wordmark — "PotatoFarm", and nothing else** | `#12202E` | 14.88:1 |
| Rim / border on every orange fill | `#CC4E1D` | 3.73:1 on panel |
| Logo eyes | `#3B2416` | — |

### Two colours in the interface, three in the brand

**The product is `#FF6B35` and black.** Every heading, every tab, every
link, every accent and the `.io` take the orange; everything else is
ink. There is no third hue in the interface — the green and the red are
gone.

**The brand has one more, and it is confined to the logo.** The supplied
artwork sets "PotatoFarm" in a deep navy rather than the neutral ink
beside it — sampled at `#0E1822` off the flat interior of the thick
strokes, with blue leading red by eleven points, which is a decision and
not compression noise. It ships as `--brand-navy: #12202E`.

It dresses the wordmark and nothing else. Repainting `--ink` navy would
have recoloured every heading, table and caption in the product because
a logo arrived, and moved thirty measured contrast ratios at once. On
the dark band it remaps to the light type exactly as `--ink` does, since
navy on charcoal is 1.3:1.

### Rebuilding the brand

Two commands, in this order:

    python3 03-brand/logo/mark.py --apply   # the 41 inlined copies
    node    03-brand/logo/build.mjs         # icons, favicon, OG, masters

`mark.py` owns the potato's geometry *and* the wordmark colour — it used
to own only the geometry, which is how nine SVG lockups went navy while
the app header and the website nav stayed on neutral ink. `build.mjs`
shells out to it, so the bitmaps always draw what the markup has just
been given. `03-brand/logo/README.md` says which file is for what, and
why eighteen of them are referenced by no code and should stay.

Two things this document used to say are now false, and are corrected
rather than left to send somebody looking for a bug: headings are not
`#1A1A1A`, and colour does not carry state.

The honest accounting, because it is a real trade and not a free one:

```
#FF6B35 on the ground   2.56:1   fails AA for text (needs 4.5)
#FF6B35 on the panel    2.36:1   fails
#FF6B35 on charcoal     5.18:1   passes comfortably
#1A1A1A on #FF6B35      6.14:1   passes — why buttons keep ink labels
#FFFFFF on #FF6B35      2.84:1   fails — never put white on it
```

Three mitigations, all in place and all checked:

1. **A label on an orange fill stays ink** (`--on-accent`), never white.
2. **Every orange fill carries `--accent-edge`**, so the shape is defined
   by its border on either surface rather than by the colour.
3. **Small orange type is `--accent-deep` `#A84015` at 5.55:1.** Captions
   and inline links do not take the brand orange. A 40px heading nobody
   reads word by word is a different thing from a caption.

`contrast.py` handles the headings with an allow-list that **pins the
measured value**: headings, `.brand .tld` and `.display` are permitted at
2.56:1 and **fail if the ratio drops below it**. It is an exception for a
known figure, not a switch that turns the check off — proved by setting
the orange to `#FF9977` and watching all three fail at 1.88:1.

Never merge `--accent` and `--accent-deep`. They are the same instruction
applied honestly: what was asked for is orange, and what was not asked
for stays readable.

### Removing the state colours was the risky half

`--success` was green and `--danger` was red. Both are gone. The check
that made this safe was run **before** the change, not after: all 32
places that used them already carried the word beside the colour —
"Sent.", "PAID", "Reply window closed", or the error sentence itself
inside a `role="alert"`.

**Two did not**, and they are the reason this has its own heading: a
status dot in the kill switch, and the dot in the 24-hour reply-window
badge. In both, hue was the entire difference between two states — and
the reply window is the one piece of state in this product whose failure
is silent. They are **filled versus hollow** now, which survives this
palette, the next one, and colour blindness.

**Never re-introduce a third colour to mean something.** The way to show
state here is a word, a shape, or weight.

### Changing the palette again

`python3 03-brand/repalette.py` — report — then `--apply`. It moves all
thirteen surfaces at once, asserts the old value was present, refuses to
leave a stale hex behind, and is idempotent.

Do not do it with find-and-replace. That has been tried twice and failed
the same way twice: a bulk replace of the accent also caught `--warning`,
which happened to share the hex but was a different decision, and a
warning nobody can read is not a warning.

---

## 9. Design — type, layout, the mark

- **Font:** Inter, falling back to system sans. Monospace for small
  labels and figures.
- Labels: 10px, uppercase, letter-spacing 0.12em
- Figures use **tabular numerals** everywhere
- Page width **1120px**, gutter `clamp(20px, 4vw, 32px)`
- Buttons **48px**, inline actions **44px minimum**
- Body text max ~46–52 characters per line
- **Top navigation: seven items maximum.** Enforced by a check. It has
  drifted past this three times.

### On a phone

The top nav is `hidden lg:flex`. Below that, a **bottom tab bar** of four
plus More: Inbox, Today, Pipeline, Ask. Those four are what an agent does
standing in a lobby; everything else is a considered visit and lives
behind More. The bar is within thumb reach and always visible, which the
horizontal scroller it replaced was not — at 375px, 356px of the nav was
off-screen with no affordance saying so.

**The breakpoint is `lg` (1024px), not `md` (768px), and that was a bug
fix.** At `md` an iPad Air in portrait — 834px, the single most common
tablet width in a UAE office — got the *desktop* nav: seven links plus
the org name crammed into one row, "Settings" clipped at the edge, and
tap targets measuring 32px against a design system that says 44. A
tablet is a big phone held in two hands, not a small desktop. Verified
at 1020, 1024, 1080, 1180, 1280 and 1440px: the tab bar goes at 1024 and
the nav that replaces it fits with room to spare.

### The logo

Stacked lockup **300 × 162**: mark 108px centred at y=12, gap 26,
wordmark 30px / weight 500 / tracking −0.4, baseline 146.

**Four things break it:**
1. **Four unique SVG ids per instance** — gradient, blur, shadow, clip.
   Two marks on one page sharing any id means the second inherits the
   first, and a mismatched clip renders it invisible.
2. The wordmark must be **one inline element**. `PotatoFarm` and `.io` as
   flex siblings render a visible gap — and in JSX, a newline or a
   comment between them collapses to a real space too.
3. `text-anchor="middle"` with a coloured tspan is mis-measured by several
   renderers. Left-anchor at a measured x.
4. The highlight must stay **clipped to the form**.

**The mark is drawn in exactly one place: `03-brand/logo/mark.py`.** It
is inlined into 34 copies across 23 files, and hand-editing 34 copies is
not a thing anybody does correctly twice. Change the shape there and run
`python3 03-brand/logo/mark.py --apply`, which rewrites every copy and is
idempotent — running it twice changes nothing, which is how you can tell
it worked.

One trap it already caught: the first version silently skipped
`shell.tsx`. The SVG in a `.tsx` file uses JSX camelCase attributes
(`strokeWidth`, `clipPath`), so a replace written against HTML markup
matched 33 of 34 files and reported success.

Full spec: `03-brand/logo/SPEC.md`.

---

## 10. Database, API, auth, integrations

**Database:** PostgreSQL via Prisma. `app/prisma/schema.prisma`, 72
models. Six migrations in `app/prisma/migrations/`. **`rls.sql` is
appended to the init migration** — it is not a file somebody has to
remember to run, because the tenant boundary is not something to leave to
memory.

The sixth migration, `20260810090000_search_indexes`, is the one worth
knowing about. It enables `pg_trgm` and adds seven trigram GIN indexes so
that `ILIKE '%…%'` can be index-scanned. Global search across 20,000
leads took **3,649ms** without them and **198ms** with them, and the
difference is not a tuning preference — at three and a half seconds an
agent stops using the search box.

**Two connections, deliberately.** `DATABASE_URL` is the application's,
and in production it must be a role that does **not** own the tables and
does **not** have BYPASSRLS. `DATABASE_URL_UNSCOPED` is for the queries
that are legitimately cross-tenant — sign-in, organisation creation, the
webhooks, every scheduled sweep — and is reached only through
`crossTenant(reason)`.

**API:** tRPC, routers in `app/src/server/api/routers/`, mounted in
`root.ts`. Every procedure is permission-gated with `requirePermission`
or `can()`.

**Authentication:** NextAuth v5 with the **Resend** provider — email
magic links, no passwords. Links last 10 minutes. Pages at `/sign-in`,
`/sign-in/check-your-email`, `/sign-in/error`.

**External services the code calls:**

| | For |
|---|---|
| `api.anthropic.com` | The assistant and request classification |
| `graph.facebook.com` | WhatsApp Business and Meta lead ads |
| `api.stripe.com` | Subscriptions and usage billing |
| `api.resend.com` | Transactional email, sign-in links, website forms |
| `graph.microsoft.com` | Outlook mailbox sync |
| `gmail.googleapis.com` | Gmail mailbox sync |
| `maps.google.com` | Travel time between viewings |

**Rate limiting is Postgres-backed**, in `src/server/lib/ratelimit.ts`.
Earlier documents said Upstash Redis; nothing has ever called Upstash and
the variables are gone.

---

## 11. Environment variables

**Names only. No values appear anywhere in this project and none should
ever be committed.** `app/.env.example` is the template.

`crm-audit.py` checks both directions, and they are weighted
differently:

- **Read in code and absent from the file — a failure.** An unset
  variable does not throw. It sends `undefined` in a header, gets a 401
  back, and surfaces three layers away as "the assistant handed this
  conversation to a person". Somebody deploying this has to be told.
- **In the file and read by nothing — a warning.** It used to carry
  twenty of these — Sanity, Turnstile, Upstash, a CRM endpoint, Google
  Analytics — inherited from a marketing site this application has never
  been. Dead configuration invites somebody to provision services the
  product does not use, and hides the handful that matter.

**The board audit found three of the first kind**, read in production
code and documented nowhere: `S3_FORCE_PATH_STYLE` (needed by MinIO and
Backblaze, not by AWS or R2), `TRANSCRIBE_BASE_URL` and
`TRANSCRIBE_MODEL`. All three are in `.env.example` now, with the
alerting pair added beside them:

    ALERT_WEBHOOK_URL   where PAGE and TICKET incidents are posted
    HEARTBEAT_URL       pinged after each successful health sweep

`WHATSAPP_APP_SECRET` deserves its own note. In development it may be
any string — `check:whatsapp-inbound` signs its own fake delivery with
it, so both ends agree whatever it is. Leaving it empty does not fail
that check, it **skips** it, which is how the one end-to-end proof that
an inbound message becomes a lead went unrun for the life of the
project. Set it locally even with nothing connected.

```
DATABASE_URL              DATABASE_URL_UNSCOPED   DATABASE_URL_DIRECT
AUTH_SECRET               NEXT_PUBLIC_APP_URL
ANTHROPIC_API_KEY         ASSISTANT_MODEL
RESEND_API_KEY            MAIL_FROM            SALES_INBOX
WHATSAPP_VERIFY_TOKEN     WHATSAPP_APP_SECRET
META_APP_SECRET           META_VERIFY_TOKEN
STRIPE_SECRET_KEY         STRIPE_WEBHOOK_SECRET
CRON_SECRET               SEAT_PRICE_FILS
S3_ENDPOINT               S3_REGION   S3_BUCKET
S3_ACCESS_KEY_ID          S3_SECRET_ACCESS_KEY    S3_FORCE_PATH_STYLE
SECRET_<ref>              # per-channel credentials, see secrets.ts
```

**Three database URLs, and they are three different things.**
`DATABASE_URL` is the application's, pooled, as a restricted role.
`DATABASE_URL_UNSCOPED` is the cross-tenant one and needs BYPASSRLS —
owning the tables is not enough, because `rls.sql` sets FORCE.
`DATABASE_URL_DIRECT` is unpooled and used only by `prisma migrate`,
which cannot run through a transaction-mode pooler.

The application **boots without any of them** and prints one report
naming what is absent and what stops working because of it. It does not
throw: a brokerage running a pilot without Stripe is a legitimate state,
and refusing to boot over it would be worse than saying so.

---

## 12. Deployment

**The application → Vercel.** `app/vercel.json` defines **26 cron jobs**
matching those in `src/server/jobs/index.ts`; a check enforces that they
stay in step. `prisma generate` is in the build script — without it,
Vercel's cached `node_modules` gives you a stale client and a guaranteed
first-deploy failure.

**The website → Cloudflare Pages or Netlify**, static, no build step.
`_headers` and `_redirects` are read by both. On Vercel they are ignored
and the equivalent goes in `vercel.json`.

**Order matters.** The website's forms post to `app.potatofarm.io`.
Deploy the application first or the site goes live with two dead forms.
`02-the-project/website/DEPLOY.md` is the checklist, and every command
in it was run against the site served over real HTTP by `serve.mjs`
rather than written from memory.

**A machine runs the gate now.** `.github/workflows/verify.yml` runs
`verify`, the audits and a production build on every push, plus the
browser suites against a real server. Nothing ran automatically before
the board audit.

**`PREFLIGHT_ENV=1 npm run check:preflight` before every deploy.** It
refuses a deployment whose database is not pooled, whose alerting is not
configured, whose `SECRETS_KEY` is the wrong length, which still carries
a development placeholder, or which has not declared a plan capable of
25 crons and a 300-second function.

**`app/OPERATIONS.md` is the two-in-the-morning document** — how a
failure is noticed, and how the database is brought back. It includes
`npm run db:restore-drill`, which restores a dump into a scratch
database and asserts that **row-level security came back with it**. A
restore can return every table and every row and drop the policies: a
perfect-looking recovery that is a cross-tenant breach the first time
anyone signs in.

**Put a pooler in front of Postgres before real traffic.** Every
serverless instance opens its own Prisma pool and 24 crons can fire in
the same minute; Postgres defaults to 100 connections. The failure is not
gradual — it is `FATAL: sorry, too many clients already` on the first
busy afternoon, which to a brokerage looks like the product falling over
at exactly the moment they started using it properly. Neon, Supabase and
Vercel Postgres each publish a pooled URL; on plain Postgres it is
PgBouncer in transaction mode. Append
`?pgbouncer=true&connection_limit=1`, and keep `DATABASE_URL_DIRECT`
unpooled for migrations. `.env.example` has the detail.

---

## 13. What must NOT be changed

Each came from a bug, a review, or a decision that took an argument.
`app/CLAUDE.md` carries the same list with more of the reasoning.

### Security
- **`script-src` has no `'unsafe-inline'`, and keeping it that way costs
  a line in the root layout.** The policy uses a per-request nonce with
  `'strict-dynamic'`, minted in `src/middleware.ts`. Next can only stamp
  that nonce onto its injected scripts if the document is rendered per
  request, which is why `src/app/layout.tsx` sets
  `export const dynamic = "force-dynamic"`. **Delete one and you must
  delete the other in the same commit** — with pages prerendered and the
  nonce policy live, the header looks immaculate, every script is
  refused, and the app serves a blank page. That is not hypothetical: it
  is what the first attempt did, and only a browser caught it.
- **The nonce goes in two places.** The response header is the policy the
  browser enforces; the *request* header is how Next learns the value.
  Set only the request header and the scripts carry a nonce no policy
  asks for — which is not an error, so it looks like it works and
  protects nothing. `chaos.mjs` compares the header's nonce against the
  document's and asserts it changes between requests.

### Safety
- **Replay has no send capability.** `replay.ts` must never import the
  WhatsApp client or the credential store; the audit asserts it.
- **The kill switch is checked before every model call**, uncached. A
  five-minute cache is five more minutes of messaging customers after
  somebody pressed stop.
- **Per-conversation mute is checked before every model call.**
- **The audit log has UPDATE and DELETE revoked at the database.** A
  grant, not a policy.

### Legal
- **An agent must never see why a sanctions screening was held.** Tipping
  off is an offence in itself. A check scans every agent-facing screen.
- **AML erasure defers against a live KYC file** — five-year retention
  outranks the request.
- **A decision NOT to file a report is still a decision** and needs a
  recorded reason.
- **Never claim the software files AML reports.** It prepares them; the
  firm files on goAML.
- **`AUTO_CLEAR_THRESHOLD` is `null` on purpose.** Nothing is
  auto-cleared. Name matching is fuzzy and a threshold will one day
  dismiss the one that mattered.

### The WhatsApp window
- Outside 24 hours from the customer's last message, a normal message is
  **accepted by the API and never delivered**. `messagingWindow()` is the
  single source of truth and both the UI and the send path read it.

### Data
- **Money is BigInt fils.** One formatter, `src/lib/money.ts`.
- **`set_config('app.current_org', …, true)`** — the third argument makes
  it transaction-local. Session-level on a pooled connection means the
  next request inherits the previous tenant's scope. **That one argument
  is the tenant boundary.**
- **Never use `rootDb` directly. Use `crossTenant(reason)`.**
- **Card ordering is a Postgres NUMERIC, not a string key.** The clever
  base-62 version was written first, tested, and was wrong.
- **Logging is `src/lib/log.ts`, never `console`** — it scrubs personal
  data and carries the tenant.
- **A dead lead is never messaged.**

### Product
- **Offers rank by strength, not price.** Cash with no conditions beats a
  higher mortgage offer nobody has pre-approved. If you "fix" the sort,
  you have broken the feature.
- **A counter creates a new row.** Amounts are never overwritten — the
  negotiation is the record both sides argue about later.
- **A vendor's contact preference is an instruction.** `OFFERS_ONLY`
  means do not ring them for a chat.
- **The leaderboard ranks viewings, not reply speed.**
- **The blackbook is scoped to the calling agent, and the private note is
  deliberately NOT audited** — an audit row is a record a manager can
  read.
- **Compliance reports are invisible to admins.** Separating the roles is
  why the appointment is a legal requirement.

### Naming
- **PotatoFarm.io everywhere.** Never "Potato.ai". A check enforces it.
- **UK English throughout**, including user-facing copy.

---

## 14. How to work on this

**1. Read the API before calling it.** Screens were written against
*assumed* procedure shapes eight times in one session. `getSecret` is
actually `readSecret`; `notify` is actually `dispatch` with nine fields.
Grep the file first, every time.

**2. A module nobody imports is not built.** `crm-audit.py` catches a
module nothing imports; `reachability.py` catches the subtler one — a
module that is imported, called correctly, and whose entry condition
never occurs. A light switch wired to nothing.

**3. Test the test.** `open(p,"w").write(open(p).read()…)` truncates the
file before reading it — the tampered copy comes out empty and every
check reports a false pass. Read fully, **assert the target string is
present**, then write.

**4. Verify before you fix.** The tooling has produced false positives in
a consistent pattern: checks phrased *"confirm this"* have been right
every time; checks phrased *"this is broken"* have been wrong repeatedly.
The most recent batch were all the tooling's fault, not the code's — a
`handlers` export that was destructured, sixteen environment variables
read from the wrong path, seven procedures gated with `can()` rather than
`requirePermission`, six contrast failures inside `node_modules`, and a
`showModal` match against a comment explaining why that component avoids
`showModal`.

### The audit scripts

Thirteen, in `04-audit-scripts/`. All exit 0 today.

```bash
pip install -r 04-audit-scripts/requirements.txt
./04-audit-scripts/run-all.sh          # or: npm run audit, from the app
```

**Use the runner.** The thirteen do not take the same argument — six
want the application, four want the website, `claims.py` wants both in
order, and `consistency.py` wants the repository root because its job is
comparing surfaces to each other. Passing one path to all thirteen is
the obvious thing to do and it is wrong: the ones pointed at the wrong
tree read nothing and exit 0. `audit.py` was checking a single generated
preview file instead of ten pages, and `consistency.py` was reporting
perfect consistency across four surfaces it could not open. **A check
that reads nothing must not be able to look like a pass** — that is the
same silent-absence failure the product itself is built to catch, and
the suite had it.

**Each script collects failures differently and there is no way to
guess:**

| Script | Call |
|---|---|
| `audit.py`, `crm-audit.py` | `fail(msg)` |
| `claims.py`, `consistency.py`, `contrast.py`, `reachability.py` | `FAILS.append(msg)` |
| `ux-audit.py`, `responsive.py` | `issue(file, msg)` |
| `deep-audit.py`, `site-deep.py` | `bug(msg)` |

Twelve advisory warnings remain and are all deliberate: six permissions
defined for roles that exist but have no screen yet, five routers holding
the six procedures with no screen (section 5), and two hardcoded colours
in the logo SVG.

---

## 15. The next five things

The board audit closed the engineering half of the launch conditions.
What is left is almost entirely accounts, not code.

1. **Open three accounts and buy one plan.** Managed Postgres with
   point-in-time recovery; somewhere for alerts to arrive; a
   dead-man's-switch monitor; Vercel Pro. Then
   `PREFLIGHT_ENV=1 npm run check:preflight` — it refuses to pass until
   all four are real, and it names which one is missing.
2. **Deploy the application**, then the website. Confirm `/api/health`
   returns 200, that every cron has fired at least once, and that the
   heartbeat monitor has received a ping. **A cron that was never
   scheduled looks exactly like a cron with nothing to do.**
3. **Run the restore drill against the real backup**
   (`npm run db:restore-drill`). It asserts that row-level security
   survived the restore, which is the difference between a recovery and
   a cross-tenant breach.
4. **Send one real WhatsApp message** to your own number, end to end,
   and take one Stripe test payment. That is the moment this product
   exists commercially.
5. **Ring brokerage owners.** The website is finished and the demo form
   works. Every review of this project has ended in the same place:
   there is no customer, and no amount of building changes that.
