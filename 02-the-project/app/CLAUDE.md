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
- 62 routes, **every one of them `ƒ` (dynamic) and none prerendered**,
  which is the `force-dynamic`/CSP-nonce invariant below holding rather
  than having quietly drifted. A static route in that list is the tell
  that somebody removed the line.
- `npm run start` serves `/sign-in` in about two seconds and
  `/api/health` returns `200 {"ok":true}` against a real Postgres.
- The boot log names every unconfigured service with its consequence —
  six of them in a bare development environment.
- 381 assertions in 23 files, 51 check suites, 23 audits, all green.

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

**`forOrg(orgId).$transaction(async (tx) => …)` is taken over in
`client.ts`, and must stay that way.** It was not a transaction: the
query hook wraps every statement in its own batch to set the scope, and
it did that for statements issued through `tx` too, so each committed
on its own connection. Measured — an update followed by a throw stayed
written. Thirty-one call sites asked for all-or-nothing and got
each-statement-alone: the WhatsApp and portal ingest, erasure, offers,
the assistant's handover, and every mutation that writes a row with its
audit entry. Scoping was correct throughout; atomicity was not.

`forOrg` now opens a real transaction on the scoped role and sets the
scope as its first statement, on that transaction's own connection.
Still transaction-local, so the next request inherits nothing, and
nothing outside an explicit transaction changed. `check:tenancy` proves
rollback, isolation inside a transaction, and that the scope ends with
it. **One rule follows:** inside a real Postgres transaction, an error
that is caught and ignored aborts everything after it, so never catch a
database error inside one and carry on — use an upsert, or do it
outside.

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

**`prisma migrate dev` will silently drop the search indexes.** Eight of
them — the trigram indexes behind search and the composite index behind
the pipeline board — are created by raw SQL in
`20260810090000_search_indexes`. Prisma cannot see them in
`schema.prisma`, so it reads them as drift: adding one nullable column
to `Enquiry` generated a migration with **eight `DROP INDEX` statements
above the `ALTER TABLE`**, and applied them locally before anybody
looked at the file.

Nothing fails. Search falls from an index scan to a sequential scan on
every query, on a table `check:load` sizes at 5,000 leads, and the only
symptom is that the product feels slow — which is indistinguishable from
it being busy. `04-audit-scripts/migrations.py` exists for exactly this
and caught it on the next run.

So: after `prisma migrate dev`, **read the generated SQL before
committing it**. Delete any `DropIndex` you did not ask for, and
re-apply the ones already lost by running the original migration file
against the database. The audit compares every `CREATE INDEX` in the
migration history against every `DROP`, so it catches this whoever
causes it.

**Editing an applied migration breaks the local checksum, and Prisma's
remedy is a reset.** The corollary of the entry above: strip the
unwanted `DropIndex` statements and the next `prisma migrate dev` says
"We need to reset the public schema… all data will be lost", because
the file no longer matches the checksum recorded in `_prisma_migrations`
when it was applied.

**Do not reset.** Production has never seen that migration, so it will
apply the corrected file and record the right checksum; only the local
database's bookkeeping is stale. Recompute and update that one row:

    sha256sum prisma/migrations/<name>/migration.sql
    psql "$DB" -c "UPDATE _prisma_migrations SET checksum='<new>' \
                   WHERE migration_name='<name>';"

Better still, for a one-column change, **write the migration by hand**
and apply it with `migrate deploy`. A single `ALTER TABLE` does not
need a generator, and the generator is what produced the eight
unrequested drops.

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

**Invoice numbers are one series for PotatoFarm, not one per
brokerage.** The sequence the UAE VAT regulation asks for belongs to the
issuer — one company, one TRN — and a gap in it reads as a supply left
off the return. They were per brokerage, on the reasoning that each
customer's run should be unbroken, which is the wrong party. The series
is a counter row bumped inside the invoice's own transaction; a Postgres
`SEQUENCE` would look tidier and leaves a hole on every rollback.

**No `SUPPLIER_TRN` means no VAT, not no invoice.** PotatoFarm is not
VAT-registered, and charging VAT unregistered is an offence, so an
unset TRN is the correct production state and invoices go out at 0%,
saying why. It used to refuse every invoice instead, which with no
registration meant nobody could be billed. Do not put a placeholder TRN
in any environment that issues real invoices: it switches 5% on.
`billing.vat-threshold` emails when turnover nears the AED 375,000 line
where registering becomes compulsory. Each invoice also keeps both
parties' names and addresses as they were when issued, and the printable
document reads "Tax invoice" only when it carries a TRN.
`billing/README.md` has all of it.

**The palette is neon pink `#FF1493` on grey `#292C32`, set by the
owner, and it is a recolour rather than a redesign.** Every token kept
its name and job; the values changed in `tokens.css` and its three
mirrors, which `03-brand/repalette.py` sets by token name (a hex map
cannot tell the ground's white from a button label's white). Every
other shade is derived from the grey, there is no second accent, and
`palette.py` fails on any saturated colour that is not the pink, the
logo's own artwork or a named exception. The potato keeps its orange —
a logo is not a colour scheme. Dialogs dim with `--scrim`, never with
`ink`, because ink is near-white now and would lighten the page.

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
agent's talking happened outside the system. **This paragraph described
that as done for months while it was not** — there was no `vendorId`
column, and the constraint it named sat in `rls.sql` unapplied. It is
done now: `leadId` and `vendorId` are both optional, the database holds
exactly one (`Conversation_one_party`, migration
`20260929090000_owner_conversations`), and **every reader asks
`lib/conversations/party.ts`** who the thread is with and who may open it.
Filtering conversations by `lead: { … }` silently hides every owner's
thread — from managers too, since a relation filter on a null relation is
false — so use `conversationScope`, not `leadScope`.

An owner writing to the brokerage's number lands on their own thread,
matched by their normalised number, rather than becoming a new buyer
handed to the rotation. The assistant never replies there (`respond()`
returns `owner_conversation`); the agent who looks after their property
is told if nobody answers in half an hour (`OWNER_WAITING`). "Stop" from
an owner turns their weekly report off. `check:owner-conversations`.

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

Twenty-two times a complete, tested, documented module has turned out to have
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

12. **Outbound listings**, and this one was the product rather than a
   feature. `listings.publish` wrote `ListingPublication.state =
   "PENDING"` and **nothing in the codebase ever read that state** — no
   job, no adapter method. Everything in `portals/` pointed inward: the
   adapters receive enquiries, and nothing sent a listing anywhere.

   The tell was in the folder shape rather than in any file. `types.ts`
   defines `Adapter` around `RawEnquiry`, and there was no counterpart —
   a directory named for a two-way integration that only had one
   direction. Every file in it was correct.

   What made it invisible for so long is that the screen rendered the
   row as **"pending"**, which an agent reads as *on its way*. A state
   that means "nothing will ever happen" wearing the word for "in
   progress" is the most convincing form this bug takes. `portals/queue.ts`
   drains it now, and `health/jobs.ts` alarms if the drain stops —
   because listings silently never appearing looks exactly like a quiet
   market.

13. **The Meta lead ads credential**, and this is the shape inverted —
   everything ran, and the one row it needed was never written.
   `channels.connect` accepts a Facebook Page with an access token,
   `fetchLead` reads that token back to collect the answers, the
   webhook route is mounted and the ingest is correct. In between,
   `secretRef` was generated by `input.type === "WHATSAPP"`, so a
   connected Page got no reference at all and the `writeSecret` below
   it — guarded on exactly that — stored nothing. **Every Meta lead
   would have failed at the credential lookup**, and Meta's webhook
   carries only an id fetched back inside a retention window, so those
   leads are not queued or retried. They are gone.

   Two things kept it invisible, and both are on this page already. The
   procedure returned `tokenStored: true` whenever a token was
   *supplied* rather than stored, so the settings screen showed a
   connected Page — **the screen was positive evidence for the thing
   that had not happened**, the sanctions-screening failure again.
   And `channels.list` computes `canSend` for `WHATSAPP` only, so
   nothing in the product would ever have contradicted it.

   Found by writing `check:meta-inbound`, on its first run, against
   code that had been reviewed and shipped. The suite connects the Page
   through the **real procedure** rather than inserting a row, which is
   the only reason it could see this: a fixture that writes its own
   `secretRef` proves the ingest works and skips the half that was
   broken. **A check that sets up its own preconditions cannot test how
   they are created.**

14. **The website form**, and it is the cheapest one to have prevented
   and the most expensive to have shipped. `channels.connect` accepted
   `WEBSITE_FORM`, issued a `webhookToken`, and the settings screen
   printed the brokerage a webhook URL. `adapters` in `portals/index.ts`
   held **one entry, `PROPERTY_FINDER`**, and the portal route resolves
   its segment against that map — so every enquiry posted to the URL on
   screen came back **404 "Unknown portal."**, for ever.

   Every other gap in this list had an excuse outside the codebase: the
   portals need a partner agreement, screening needs a vendor contract,
   Meta lead ads needs a Facebook Page. **This one needed nobody's
   permission.** It is the brokerage's own site posting to a URL we
   issue, in a format we define. Nothing was blocking it and it was
   missing anyway.

   What made it urgent rather than merely wrong: a brokerage with no
   portal agreement and no Facebook Page has exactly one inbound
   channel, and it was this one. The product could not receive a lead
   at all, and the settings screen showed a connected channel while it
   could not.

   Found by asking a question none of the thirty-five check suites at the time
   had asked: **what posts to this route?** Nothing did. `check:website-form`
   does now, and `channels.py` fails the build on any channel type a
   brokerage can connect with nothing able to deliver to it. `connect`
   refuses such a type outright — Bayut and Dubizzle today — because a
   connected channel that silently receives nothing is the same lie
   `queue.ts` refuses to tell when it marks an unpublishable listing
   FAILED rather than PENDING.

15. **The listing feed, and the alarm that was never wired to
   anything.** Found by asking of every HTTP route what had ever
   exercised it. Four had nothing; this was the one that mattered,
   because `/api/feed/<token>/listings.xml` is **the only way a
   brokerage's properties reach a portal today** — no publishing
   integration exists, each needs a partner agreement, and a feed needs
   none.

   The route served the XML and wrote **nothing**, beneath a comment
   stating that "`portals/health.ts` alarms on silence from a feed;
   this is the line that gives it something to measure". Health sweeps
   `Channel`, a feed is not a channel, and a `log.info` is not a
   measurement. A portal that quietly stopped collecting was detected
   by nobody: stale prices, withdrawn properties still advertised, and
   it reads as a quiet market.

   **And the bigger half.** Writing the sweep exposed that
   `evaluate()` filtered `c.state === "broken"`, while every silence
   check reports **degraded** — correctly, since the rest of the
   customer's system is working. So *nothing in the product consumed a
   degraded check at all*: no screen reads `tenantHealth`, and the
   alert sweep was its only other reader. The portal silence alarm,
   which its own file calls the most important thing in the
   integration, had been computing an answer every five minutes and
   discarding it.

   The tell was sitting directly underneath the line that caused it.
   `severityFor` opens `if (check.state !== "broken") return "LOG"` —
   **a branch that could never execute**, because the filter above it
   guaranteed nothing but a broken check arrived. A branch nothing can
   run is the same shape as a module nothing calls, and it is worth
   grepping for on purpose.

   Fixed by severity rather than by widening the filter alone: degraded
   checks now reach the sweep, most are recorded at LOG and delivered
   to nobody, and the two silences — a feed not delivering, a portal
   not collecting — are TICKET, because both are churn in progress and
   both end with somebody handing the customer a URL.

16. **Four jobs that recorded contact nobody made.** Each had careful
   rules for *whether* to message somebody — the fortnight cap, the
   opt-out, sending hours, the reply window — and a comment saying the
   message went "through the normal outbound path". There was no path.
   What they did instead was write the record of having sent it:

   - `matching.new-listings` stamped `Lead.lastOutreachAt` and counted
     the buyer as `messaged`. The Buyers screen reads that stamp, so an
     agent was told a buyer had been **"messaged 3 days ago"** by a
     message that never existed — and held off. A `return` inside its
     loop also ended the whole brokerage at the first buyer who failed
     a gate.
   - `feedback.ask` stamped `askedAt` on every viewing. Nothing writes an
     answer either, so the weekly vendor report is composed from
     feedback that was never collected.
   - the visa sweep stamped `visaNudgedAt`, which kept the lead out of
     the sweep for ninety days. Nothing can record a visa date, so it
     had also never found anybody.
   - `plans.advance` took every nurture step and logged it, and timed
     each next step by the *current* step's delay.

   **The fix was not a sender.** `intelligence/autonomy.ts` caps every
   message to a client at CONFIRM — a person presses send, at every
   mode — and the settings screen promises owners that. Building the
   obvious fix would have broken the product's own rule. The first was
   retired, because `intelligence.sweep` already puts matches on the
   agent's list as SEND_PROPERTY needing their yes; the other three now
   put a task on the responsible agent's list with a draft, and stamp or
   advance only in the same transaction. `check:agent-tasks` runs the
   real jobs and asserts nobody is recorded as contacted.

   The tell is a counter named for a verb — `sent`, `messaged`, `asked`,
   `nudged` — incremented in a block that calls nothing that delivers.
   Grep for the counter and read what precedes it.

   **And the list those tasks land on did not exist.** `FollowUp` had
   writers (voice notes, the sweep on Autopilot), a count on Today and
   a reminder push — and no list and no way to complete one, so "3
   follow-ups due" only ever went up and the reminder linked to a screen
   that does not show them. Today lists them now, with Done. **What
   closes it?** had no answer for the agent's own reminders.

17. **The seat ledger.** Every invoice is computed from seat-days, and
   `signup` wrote the first event under a comment saying "every agent
   invited later adds an event". `recordSeatChange` existed to do it and
   **nothing called it**, so accepting an invitation and removing a
   member both left the ledger alone. Every brokerage was billed for one
   seat, and — because the conversation allowance is per seat — would
   have been charged a one-person firm's overage on every conversation
   past it. Wrong in both directions on one bill, beneath a team screen
   promising "adding someone starts their seat today".

   Removal had the same shape in miniature: it unassigned leads and left
   upcoming viewings, follow-ups, recommendations and the ownership
   history pointing at somebody who could no longer sign in, with
   `OwnershipReason.AGENT_LEFT` declared and never written — one tap, no
   confirmation. It now asks who takes the book, and moves it in one
   transaction with the seat.

   Seats are written inside each transaction that changes the team, and
   `billing.reconcile` compares the ledger with the team every night and
   corrects and reports any difference per person — so a fourth way of
   joining that forgets the ledger is found in a day rather than never.
   `check:team-changes` drives all of it through the real procedures.

18. **Commission that could never be received.** `CommissionStatus`
   had four values and nothing set it past FORECAST; `CommissionSplit.paidAt`
   was read by three screens and written by none. "Owed to you" is
   received-and-unpaid, and the revenue report dates everything it
   earned by `receivedAt` — so every agent was owed nothing and every
   brokerage had earned nothing, on two screens whose own comments warn
   that zero "reads as 'we earned nothing', which is the reassuring
   direction to be wrong in". An INVOICED fee also fell into none of the
   agent's figures, so it would have vanished the moment it was billed.

   `commission.setStatus` and `markPaid` now move money along, behind a
   `commission:settle` permission held by owners and admins — a sales
   manager reads the book and does not pay people. `check:commission-lifecycle`
   drives a fee from forecast to paid and reads each screen's own query
   back at every step.

19. **The owner's weekly report**, written every Monday to a table and
   never read or sent. `vendorsDueToday()` — reports off, offers only,
   which day — had no caller, so every owner's instructions were
   ignored; the default report day is Thursday and the job ran on
   Mondays; and a listing with no viewings was skipped beneath a module
   saying that is exactly when an owner most needs to hear from us. It
   now runs daily, takes the owners due, and puts each report on an
   agent's list in the channel the owner chose.

   Proving it found the worst bug of the batch, in the apparatus: the
   **job runner's lock leaked**. A session-level advisory lock was taken
   on one pooled connection and released on another, so after any run
   that opened more than one connection, every later run of that job in
   the process was skipped as "already running". A test asserting "run
   twice, nothing duplicated" passed *because the second run never
   happened*. The lock is a lease row now (`check:job-runner`), and the
   assertion also checks the second run was not skipped. **A check that
   passes because its action was refused has tested the refusal.**

20. **Nurture plans.** `plans.advance` ran every morning with rules for
   replies, opt-outs and closed files, and its unit tests passed — and
   nothing could create a plan or put anybody on one, so it had only
   ever run inside a check that inserted its own rows. Building the way
   in found two faults the inserted rows could never have shown: "carry
   on" after a reply did nothing, because the same reply paused the plan
   again on the next sweep; and a removed person's plan stayed due and
   was re-read every run for ever. **A job tested only on rows it did not
   have to earn is tested on the cases its author imagined.**

21. **The assistant's reply.** `respond()` screens the enquiry, asks the
   model, checks every figure against the listing and sends — and
   **nothing calls it**. No webhook, job or route: the WhatsApp ingest
   stores the message and stops. So the product's one-line promise, "an
   assistant answers property enquiries within seconds", has never
   executed anywhere, including in a check, because its model and
   WhatsApp addresses were fixed and no stand-in could reach them. Item 6
   above fixed the profile it needed and did not notice it had no caller.

   Running it for the first time found its billing inverted: the
   paragraph saying a conversation is charged "after the message
   actually left" sat, twice, on the two paths where nothing was sent —
   the model failing and the draft being blocked — and the one path
   where a reply did leave recorded nothing. Fixed and proven in
   `check:owner-conversations`, against loopback stand-ins
   (`lib/loopback.ts`).

   **Wired as drafts, by the owner's decision.** Every new buyer message
   gets a reply written in seconds (`draftReply`) and a person sends it
   — as written, edited, or not at all — from a panel in the thread. The
   state each draft ends in is the evidence for ever letting it send
   alone; `respond()` still has no caller, on purpose. Building it found
   the per-conversation mute had never been read: `isMuted` was imported
   into the assistant and not called, so "I've got this" silenced
   nothing. `check:reply-drafts`, and `assistant/README.md`.

22. **Buyer requirements.** Matching, "who wants this property" and
   search all read `Requirement`, and only voice intake ever wrote one —
   a brokerage whose buyers arrived by WhatsApp, a portal or the door had
   none, so every one of those features answered "nobody", which reads as
   a quiet market. Found by the audit typing "buyers in dubai marina".
   Two faults behind it: the assistant's extractor prompt **named none of
   the fields `extraction` parses**, so the keys were whatever the model
   guessed; and the matcher compared areas by exact text, so "Dubai
   Hills" never met a listing filed under "Dubai Hills Estate". Agents
   now record them on the person page, the assistant keeps its own one
   current until an agent saves theirs (**the agent's word wins**), and
   areas are compared as places (`samePlace`). `check:requirements`.

**The same shape, one layer up: fifteen finished components no screen
imported.** `architecture.py` grew a `KNOWN_UNMOUNTED` ratchet and it
started at nine, went to fifteen when the resolver was fixed, and is
**now empty**. Every one was a working form over a working procedure
with no `import` anywhere: an agent could not export their blackbook
though the page promised it, could not record what a deal pays,
could not set the assistant's budget, and no compliance file in the
product had ever been risk-rated — `KycRecord.riskRating` was
`UNASSESSED` everywhere and `reviewDueAt`, which the nightly review
sweep reads, had never been written by anything.

Three lessons from clearing it, in the order they cost time:

- **Mounting is not finished when it compiles.** Every one of the
  fifteen needed work after it first rendered. Two examples: the
  assistant form carried its own start/stop pair and its host already
  has the kill switch, so the page grew a second, smaller stop button
  that means the same thing; and the stage panel, put under the funnel,
  printed the same six names against the same six counts and added
  nothing until a column passed 120 leads.
- **A component nothing renders is a component whose queries have never
  run.** `commission.preview` takes a `BigInt` — money is fils — and
  React Query hashes a query key with `JSON.stringify`, which *throws*
  on a BigInt rather than skipping it. Mounting the form turned the
  whole deals screen into "Application error: a client-side exception
  has occurred". Nothing before it had put a BigInt in a query *input*;
  mutations have no key, so every other amount-taking procedure was
  fine and the hole was invisible. `providers.tsx` now sets a
  `queryKeyHashFn`, because the rule it collided with — all money is
  BigInt fils — is project-wide.
- **A screen nothing renders is a screen whose router has never been
  read back.** `privacy.erasureHistory` unpacked `after.phone`,
  `after.leadId` and `after.deferredUntil`, and **no writer writes any
  of the three**; it also filtered out `privacy.erasure_deferred`
  entirely, so the one state that screen exists to prove — a request
  held back by AML retention rather than ignored — could never appear
  on it. A subject-access request, meanwhile, fell through to the
  erasure branch and told the officer the person had been *scrubbed*.

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

    npm test          # 381 assertions, pure functions, no database
    npm run verify    # tsc, the tests, 51 check suites, 23 audits

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
- **`check:voice-note` needs `TRANSCRIBE_API_KEY` and
  `TRANSCRIBE_BASE_URL`, and the reason is worse than a skip.**
  `/api/voice` checks `transcriptionConfigured()` **before** the rate
  limit and before every piece of validation, so with no provider the
  only two answers the route can give are 401 and 501. The size caps,
  the mis-tap guard, the format allowlist, the AiAction record and the
  confidence threshold are not merely untested without a provider —
  they are **unreachable**, and had never executed on any machine.
  Any key works and `TRANSCRIBE_BASE_URL` points at the suite's own
  stand-in on 4321, the same arrangement as `META_GRAPH_BASE`.

  The assertion that most needed it: **iOS Safari records `audio/mp4`
  while everything else records `audio/webm`**, and the provider infers
  the container from the filename. `note.webm` on an mp4 body is a 400
  that reads like a corrupt recording — the route's own comment calls
  it "exactly the bug that would have made this work everywhere except
  the phone it was built for". The only way to see it is to have the
  stand-in report the filename it was handed.

- **`check:meta-inbound` needs three, and the third is the unusual
  one.** `META_APP_SECRET` and `META_VERIFY_TOKEN` work like the line
  above — any value, both ends agree. `META_GRAPH_BASE` is different:
  the Meta webhook carries only a `leadgen_id` and the answers have to
  be fetched back over HTTP, so the check stands a loopback Graph up on
  port 4319 and **the application** has to be started pointed at it.
  Put it in `.env` and both see it. Run against a server talking to the
  real Graph, the check reports no lead — which reads exactly like the
  ingest being broken, so it says which of the two it is rather than
  leaving you to guess.

`npm test` was declared from day one with no test files behind it, so it
exited 1 and said "No test files found". There are 23 test files now, and
they cover the pure logic where being wrong is silent: the fils unit, the
24-hour window on both sides of the boundary, Dubai sending hours, the
search parser's plural intents and budget bands, lead scoring, deal
risk, the assistant's guardrails, and what a model turn costs — that
last one because the spend ceiling is only as good as its arithmetic and
it could not be tested at all until it moved out of a module that opens
a database client.

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

There are **twenty-three**, in `04-audit-scripts/` at the repository
root. All twenty-three are green and all of them belong in CI. Twenty-two
are Python; `reveal.mjs` needs a browser, which is why `run-all.sh`
dispatches on the extension rather than assuming an interpreter.

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

**A check that only runs on one machine has never run, and the gate
itself was the worst case.** CI was red on every commit this repository
has ever had, and nobody knew, because it failed at the *first* step
having tested nothing: `verify.sh` called a bare `pg_isready`, which
probes a local Unix socket. On a runner Postgres is a service container
on TCP and there is no socket, so the gate reported "Postgres is not
accepting connections" about a database that `prisma migrate deploy` had
connected to seconds earlier in the same job. It passed on a laptop for
a reason unrelated to what it was asking — a developer machine has a
socket, so it answered "some Postgres is up" to the question "is *our*
Postgres up".

Making it run found a real defect immediately: the Stripe webhook
answered **500 to a correctly signed event** whenever
`STRIPE_WEBHOOK_SECRET` was unset, because `createHmac` throws on an
absent key and that call sat *above* the handler's try. 500 is the one
status the provider retries, which the comment beneath that handler says
in as many words — the single line that could not reach the protection
was the one that crashed.

Then the same shape five more times, in the apparatus rather than the
product: **thirty-two scripts launch a browser and twenty-one hardcoded
`/opt/pw-browsers`**, four pinned one Chromium build, two hardcoded the
Playwright module, and one hardcoded a developer's home directory as the
repository root. The copies had drifted — nine guarded the directory
read and the rest did not, so the fallback they appeared to share was
unreachable in most of them; six read `PLAYWRIGHT_BROWSERS_PATH` and
twenty-six ignored it. Fixed one file at a time it cost a CI run each,
about eleven minutes, finding the identical bug in the next file along.
**A class of bug fixed one instance at a time is not being fixed.**

`scripts/_browser.mjs` is now the only thing that answers "where is
Chromium", with thirty-one importers. A new browser script imports it
rather than writing its own, and **an absolute path to anything outside
the repository is the smell** — derive the root from `import.meta.url`,
not from where the author happened to be standing.

**A test can be wrong about which line it protects, and pass.** The
calendar feed is the one route in this product where row-level security
is deliberately off — a calendar client cannot hold a session, so the
tenant boundary is a hand-written `where: { orgId, agentId, ... }`
rather than the database. `check:calendar-feed` was written with two
isolation assertions, one per half of that clause, each with its own
counter-example: a colleague in the same brokerage, and a rival
brokerage.

Deleting `agentId` was caught. **Deleting `orgId` failed nothing.**
Every fixture user belonged to exactly one brokerage, so filtering by
`agentId` alone already excluded the rival — the assertion named after
`orgId` passed with `orgId` gone, and would have gone on passing for
ever.

The case that clause actually guards is one person consulting for two
brokerages, which the schema allows (`@@unique([orgId, userId])` is per
membership) and which `org.switch` exists in anticipation of. Their
token belongs to **one** membership; without `orgId` it serves both
firms' diaries in one file, which their phone then syncs to Google.
That fixture is in the suite now and it goes red.

The general rule, and it is sharper than "prove it red": **proving a
suite red is not enough — prove the specific assertion red by breaking
the specific line it names.** A suite that goes red for the wrong
reason is a suite with an untested assertion in it, and that assertion
is guarding whatever nobody has thought about yet.

**A check pinned to specific values goes quiet exactly when those values
are superseded.** Two in the palette work, found the same afternoon.
`mobile/_check.py` compared the native palette against a hardcoded list
of eight colours; every one was two generations old, so the loop could
never fire — while the file it guarded sat on the old orange ramp *and*
the old logo gradient, months after the web had moved. And `palette.py`
named `src/styles`, `src/components` and one stylesheet: the places a
palette obviously lives. It passed green across two whole surfaces it
had never been pointed at. **Prefer a rule that names no values and a
list that names directories rather than files** — the first cannot go
stale, the second covers what somebody did not think of.

Both were then proved red at the call site, and the first attempt at
the rewrite *still* could not fail: it stripped comments from the native
theme but not from `tokens.css`, which names every superseded orange in
its own prose, so putting `#CF5A22` back matched a sentence about
`#CF5A22` and passed. **The history a file keeps about rejected values
is not a declaration of them** — strip prose from both sides of any
comparison, not just the side you are suspicious of.

**And a palette move misses hover states first.** Collapsing the ramp to
one orange moved `--danger-deep` from `#A0431B` to `#E86A2C` without
touching `button.tsx`, whose danger variant still said
`hover:text-white` — correct at 6.34:1 against the old value, **3.22:1**
against the new one, and under the AA floor. Nothing renders a hover
until somebody points at it, so no screenshot, no build and no contrast
audit of the tokens would have shown it. When a token changes, grep the
components for the states that token appears in, not just for the token.

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
  There are 46, every one of them opens in a browser, and
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
- ~~**Drafting listing copy.**~~ **Built, and this entry was read as
  current months after it stopped being true** — including by a
  go-live review that reported the feature as missing to the person
  paying for it. Left struck through for the same reason as the
  heartbeat below: a stale "not built" line is the more expensive kind
  of wrong, because it invites somebody to build a second one.

  What was true: `copy.draftListing` built its prompt and never called
  the model, returning `{ draft: "", problems: [], publishable: true }`
  — **an empty advertisement marked fit to publish**, because
  `check("")` finds nothing wrong with an empty string. Then it threw
  `NOT_IMPLEMENTED` instead.

  What is true now: it calls `callModel` from `assistant/run.ts` — the
  assistant's own client, deliberately, because two HTTP clients to one
  provider is how one of them quietly stops matching the other's model
  or version header. It refuses with `PRECONDITION_FAILED` when
  `ANTHROPIC_API_KEY` is absent rather than returning nothing, and it
  refuses again if the model returns under forty characters, which is
  the exact shape of the bug it used to be. It is reached from
  `listings/check-copy.tsx`, so `reachability.py` no longer lists it.

  `copy.checkCopy` needs no model and always worked.
- **A portal publishing integration.** The structure is built —
  `portals/publish.ts` defines `Publisher`, `portals/queue.ts` drains
  the queue with a retry policy, and `listings.publish-queue` runs it
  every ten minutes. **No vendor implements `Publisher`**, because
  Property Finder, Bayut and Dubizzle each need a partner agreement and
  the wire format that comes with it — the same thing
  `property-finder.ts` says about the inbound direction.

  Until one is registered, a queued listing is marked `FAILED` with a
  rejection saying it is not advertised. **That is the designed
  behaviour**: PENDING would read as "on its way", and PUBLISHED would
  tell a brokerage their property is live when it is not. Both competitors
  lead on portal distribution, so this is the commercial step that decides
  whether the product competes.
- ~~**Editing a lead.**~~ **Built.** `leads.detail` and `leads.update`
  behind the person page, which until then never said who the person
  was. The phone number stays fixed (it is the WhatsApp identity), the
  audit entry names fields rather than values, a new visa date re-arms
  the renewal prompt, and "they asked not to be messaged" can be
  recorded by an agent rather than only by the buyer typing STOP.
  `check:lead-editing`. Left struck through, as the entries below are,
  so it is not built twice.
- ~~**Who looks after a listing.**~~ **Built.** `Listing.agentId`,
  defaulting to whoever adds the listing, set from the Owner panel,
  handed on when an agent is removed, and the first choice for the
  owner's weekly report — the old guess is now only for listings nobody
  has been given. The same panel picks owners by name: it used to ask
  for an internal "Owner ID" nobody has seen, and `vendors.attach` and
  `listings.update` accepted another brokerage's owner, because a
  foreign key is checked without row-level security. `check:listing-agent`.
- ~~**Recording viewing feedback.**~~ **Built.** `viewings.feedback`,
  from the "Ask … what they thought" task on Today (which now carries its
  viewing, and closes when the answer is saved) or from "They came" on
  the viewing card, where "not asked yet" is the default. Same four
  answers and reasons the buyer is offered in `collect.ts`, so the two
  count together. Until then the owner's report told every owner "nobody
  has come back yet" — and the outcome form told agents that its free-text
  note "is what goes in the owner's weekly report", which nothing read.
  The buyer's words stay with the agent, reach a subject access request,
  and are removed by erasure; the owner gets counts. Every viewing
  mutation is now scoped to the agent's own viewings and buyers — any
  agent could mark a colleague's viewing a no-show, which also moved
  that colleague's lead back a stage. `check:viewing-feedback`.
- ~~**Creating a nurture plan.**~~ **Built.** A manager writes plans
  under Settings → Nurture plans (the six-touch buyer plan is one tap
  away as a starting point); an agent puts their own person on one from
  the person's page, where it also says what comes next, and carries on
  or stops it. One plan at a time per person; nobody opted out, closed
  or without an agent; a retired plan takes nobody new; a plan is not
  edited under the people part-way through it. Two faults in the job
  surfaced on the way: a resumed plan paused itself again on the next
  sweep, because the reply that paused it was still "after it started"
  (`PlanSubscription.resumedAt`), and a removed person's plan stayed
  due and was re-read every run for ever. `check:nurture-plans`.
  Somebody who says "in about six months" is now **suggested** for a
  plan on Today (`START_PLAN`), never put on one: the agent chooses the
  plan, and doing so closes the suggestion. `plans/timeframe.ts` reads
  the phrase conservatively — "within six months" is somebody buying
  now and reads as zero, and anything it cannot read suggests nothing.
  Still not built: which step loses people.
- **The assistant replying by itself.** It drafts every reply and a
  person sends it (item 21). The per-brokerage switch to automatic
  replies is not built: the owner chose drafts first, and the Settings
  page's "Sent as written" figure is what that decision will be made on.
- ~~**Erasure and data export for owners.**~~ **Built**, with two faults
  found on the way that were not about owners at all. Erasure left every
  name that later work had written — follow-up titles, alerts, private
  notes, client facts, voice transcripts, email subjects — and now clears
  them (`scrubParty`). And the privacy screen's "Build the file" built
  the file and handed it to nobody: no download, and "nothing held" was
  never shown. A deferred erasure also came back worded "Erased. 0
  messages…". `privacy/README.md`; `check:owner-conversations`.
- **Sending proactive messages without a person.** Deliberately. Every
  job that decides somebody is worth contacting hands a draft to their
  agent. If a brokerage ever wants automatic sending, it is a change to
  the floor in `autonomy.ts` and the promise on the settings screen,
  made on purpose — not a sender added to a job.
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
