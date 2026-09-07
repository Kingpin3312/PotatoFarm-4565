# Architectural review

Not a code review. This is about structure: what depends on what, what
breaks when something fails, and what this design cannot do.

Computed from the real import graph — 109 files, 34 modules, 72 edges —
rather than asserted.

## What was wrong

### A circular dependency: jobs → billing → health → jobs

`jobsHealth()` lived in `jobs/runner.ts` and `health/alert.ts` imported
it. Billing already imported health for logging. That closed a loop.

A cycle is not untidy, it is load-bearing by accident. All three modules
become impossible to load or test in isolation, and the order they
initialise in starts to matter without anybody having decided that it
should.

**Fixed by ownership, not by a shim.** Jobs owns *running things*. Health
owns *judging whether something is working* — and every other absence
check in this product already lives there: a silent portal feed, a
stopped assistant, a dead push token. A cron that has stopped firing is
the same shape of failure and belongs with its siblings.

The schedule moved with it. That created a drift risk in exchange, so
`crm-audit.py` now fails if a registered job has no health expectation —
**nothing can be scheduled without something noticing when it stops.**

### A layering violation that was not one

The tool flagged `lib/trpc.ts` importing `AppRouter`. It is a **type-only
import**, erased at compile time, and it is the standard tRPC pattern.
The rule was too blunt and now understands the difference.

That is the fourth false positive from my own tooling in this project.
The pattern is consistent: **every one came from a rule that asserted
where it should have asked.**

## The shape of it now

**Zero layering violations. Zero cycles. Every module reachable.**

### What everything depends on

| Module | Depended on by |
|---|---|
| `db` | **17** |
| `lib/whatsapp` | 6 |
| `lib/health` | 5 |
| `shared`, `lib/secrets` | 4 each |

`db` at 17 is correct and unavoidable — it is the database. The
interesting one is **`lib/whatsapp` at 6**, which is the honest shape of
a WhatsApp-first product: the messaging client is genuinely load-bearing,
not incidental.

### Blast radius

If `db` fails, **20 of 34 modules stop.** That is expected.

If `lib/whatsapp` fails, **11 modules stop** — and this is the one worth
sitting with. Meta having a bad afternoon takes out the assistant,
reminders, matching, outreach, plans and the AML document collection.
Everything the product is *for*.

There is no second channel. That is a deliberate product decision, not an
oversight, but it should be said in a sentence rather than discovered
during an outage: **PotatoFarm.io is a WhatsApp company, and Meta is a single
point of failure by design.**

## What this architecture cannot do

The honest limits, so nobody discovers them at the wrong moment.

**One region.** Postgres RLS with a single primary. A brokerage in
another jurisdiction wanting data residency needs a second deployment,
not a config flag.

**Jobs are cron, not a queue.** Fine at 17 jobs and a handful of
customers. At a few hundred brokerages, `matching.new-listings` walking
every requirement in one invocation will exceed the 300-second limit. The
rewrite is a real queue, and the trigger is roughly **100 customers**.

**Tenancy is shared-schema.** Right for this stage. An enterprise buyer
demanding a dedicated database is a different architecture, and the
honest answer to them is "not yet" rather than a fudge.

**No read replicas.** Reporting queries hit the primary. `responseByHour`
across a year of messages will get slow, and it is the query the whole
pilot narrative rests on.

**The assistant is one model behind one interface.** Swapping providers
is a day's work. Running two in parallel to compare is not — `replay.ts`
was built for exactly that and does not yet do it.

## What I would keep if starting again

- **Tenancy in the database, not the application.** Every other decision
  leans on it and it has held under two audits.
- **The audit log being append-only at the Postgres level.** A guarantee
  the application cannot accidentally revoke.
- **Watching for absence rather than errors.** It is the single idea that
  runs through the whole product and it keeps earning its place.
- **One money unit.** Learned the hard way; see the audit report.

## What I would change

- **The domain modules are too flat.** Eighteen siblings under `lib/`
  with no grouping. `billing`, `commission` and `deals` are one bounded
  context — money — and reading them as three unrelated things is harder
  than it needs to be.
- **`routers` depends on 16 modules.** That is the router layer doing
  orchestration that belongs in a service layer. It works, and it will
  get uncomfortable around the third feature that spans four modules.
- **`assistant` is its own top-level concern.** Arguably it is a domain
  module like any other, and its separateness is historical rather than
  principled.

None of those are urgent. All three are the kind of thing that is cheap
now and expensive after a year of accretion.
