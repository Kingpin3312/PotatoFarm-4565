# Operations

The two-in-the-morning document. Everything here answers one of two
questions: **how do we find out**, and **how do we get it back**.

It exists because the board audit asked those questions and the honest
answer to both was "we don't". The code was good; nothing was watching
it and nothing had ever been restored.

---

## 1. How we find out

### The alarm that survives the outage

Every health check in this product runs *inside* the application:
`portals/health.ts` alarms on a silent feed, `jobsHealth()` alarms on a
cron that has stopped, `health/tenant.ts` asks whether a customer's
system is working. That is the right design for a product whose failures
are silent — but it shares a failure domain with the thing it monitors.
If the deployment is down or the scheduler has stopped, the code that
would notice has also stopped.

**`HEARTBEAT_URL` is the fix, and it is inverted on purpose.** The app
pings it after every *successful* health sweep. The external service
alarms when the ping **stops**. That alarm does not live here, so it
survives the outage it is reporting.

| Variable | What it does | Suggested |
|---|---|---|
| `ALERT_WEBHOOK_URL` | Where PAGE and TICKET incidents are posted | Slack incoming webhook, or PagerDuty Events v2 |
| `HEARTBEAT_URL` | Pinged after each successful sweep | Healthchecks.io, Better Stack, Cronitor, Dead Man's Snitch |

Set the dead-man's switch to **expect a ping every 15 minutes with a 30
minute grace**. The health sweep runs more often than that; two missed
sweeps is a real signal rather than a blip.

### What to point an uptime monitor at

`GET /api/health` opens a database connection and returns `503` with
`{"ok":false,"reason":"database unreachable"}` when it cannot. It is a
real check, not a static 200 — point an external monitor at it and alert
on anything that is not `200`.

### Severity, and what it means for a human

`health/alert.ts` classifies every incident. The routing is deliberate
and worth respecting:

- **PAGE** — the platform is broken, or a cron has stopped. Fixable now,
  by us, and everything downstream is silently not happening. Wake
  somebody.
- **TICKET** — one brokerage is broken in a way only they can fix: an
  expired WhatsApp token, a backlog of unanswered people. **Nobody rings
  a brokerage at midnight.** Morning.
- **LOG** — recorded, not delivered.

Each alert carries its runbook text with it. Read that first; it was
written by whoever understood the failure.

### Verify the alerting before you need it

```bash
PREFLIGHT_ENV=1 npm run check:preflight
```

Asserts the wiring exists in the source **and** that the environment is
configured. The static half runs in CI on every push, because the
specific regression it guards already happened once: the entire alerting
system was built, classified severities, attached runbooks — and its
last step wrote to stdout. A stopped cron raised a PAGE and nobody was
ever paged.

---

## 2. How we get it back

### Backups

Use the managed provider's point-in-time recovery. Do not build a backup
system; buy one that has been tested by more people than work here.

- **Supabase** — PITR on Pro, 7-day window.
- **Neon** — history retention, branch-from-timestamp.
- **RDS / Cloud SQL** — automated backups plus PITR.

Whatever you choose, the retention window must exceed **five years for
KYC files** — UAE AML law requires it, and it is why erasure defers when
a KYC file exists. Confirm the provider's retention against that
obligation before signing; most default to 7–35 days, which is not
enough for the documents that matter.

### The drill

**A backup nobody has restored is a hypothesis.**

```bash
pg_dump --format=custom --file=backup.dump "$DATABASE_URL_DIRECT"
npm run db:restore-drill backup.dump
```

Run it **monthly** and after any change to roles, policies or
migrations. It restores into a scratch database, asserts, and drops it.

What it checks, and why each one is there:

| Assertion | Why |
|---|---|
| Schema and data restored | The obvious one |
| **Row-level security enabled** | Tenant isolation is Postgres policies, not application code. A restore can bring back every row and drop the policies — a perfect-looking recovery that is a cross-tenant breach the first time anyone signs in |
| **Policies present** | As above, from the other direction |
| **`FORCE ROW LEVEL SECURITY` survived** | Without FORCE, the owning role silently bypasses every policy |
| **`potato_app` exists** | The app cannot connect without it, and creating it by hand risks granting too much |
| **The app role can read** | Added because the drill *passed a backup taken with `--no-privileges`*. Every table, every row, every policy restored — and the application could not read a single row. See below |
| Audit log still append-only | The record an AML investigation depends on must not become editable |
| Migration history intact | Otherwise the next deploy re-runs every migration |

> **The one that nearly slipped through.** The append-only assertion asks
> whether `potato_app` lacks UPDATE on `AuditLog`. That is trivially true
> when `potato_app` has been granted *nothing at all* — so a dump that
> lost every privilege passed the drill. The positive assertion ("the app
> role can actually read") was added after watching it happen. A check
> that only tests the absence of something passes hardest when everything
> is missing.

### Recovering

1. **Confirm it is the database.** `GET /api/health` returns 503 for a
   database problem specifically. If it returns 200, the database is not
   your incident.
2. **Restore to a point in time** using the provider's console. Prefer
   restoring to a *new* instance over restoring in place — it keeps the
   damaged one available for diagnosis.
3. **Run the drill against the restored instance** before pointing the
   application at it. Five minutes here is cheaper than discovering the
   policies are missing after the first sign-in.
4. **Repoint `DATABASE_URL` and `DATABASE_URL_DIRECT`**, redeploy.
5. **Check `_prisma_migrations`** matches the deployed code. A restore
   from before a migration will fail on boot, which is the good outcome;
   a restore from after code was rolled back is the bad one.

---

## 3. Deploying

### The plan is not optional

Twenty-five cron jobs and a 300-second function. **Vercel Hobby allows
two crons at daily granularity and caps functions at 60 seconds.**
Deploying to Hobby does not fail loudly — the crons simply never run,
which for a product built on nightly sweeps is the quietest possible
outage. `check:preflight` refuses to pass unless `VERCEL_PLAN=pro` is
declared.

### Connection pooling is also not optional

`DATABASE_URL` must point at a pooler; `DATABASE_URL_DIRECT` must not
(migrations cannot run through one). Every serverless invocation opens
its own connection, twenty-five crons open more, and `forOrg()` opens a
transaction per query on top. The load check measured the shape of it:
the slowest first call is connection setup, not query time. Preflight
asserts both.

### Order

```bash
npm ci
npx prisma migrate deploy          # direct connection, owning role
PREFLIGHT_ENV=1 npm run check:preflight
npm run build
```

Then, after the first deploy: confirm every cron has fired at least once
in the platform's log, and confirm the dead-man's switch has received a
ping. **A cron that was never scheduled looks exactly like a cron that
has nothing to do.**

### Rolling back

Redeploy the previous build from the platform. If the bad release
included a migration, roll the database back *first* — Prisma migrations
are forward-only here and there are no down-migrations. This is the
argument for keeping migrations additive: a deploy that only adds
columns can be rolled back without touching the database at all.

---

## 4. What is still missing

Stated plainly so nobody mistakes this document for completeness.

- **No on-call rota.** The alerting has somewhere to send a page and
  nobody rostered to receive it.
- **No staging environment.** Every deploy is to production.
- **No load balancer or WAF.** Fine at pilot scale; not at ten
  brokerages.
- **No tested failover.** The drill proves a backup restores. It does
  not prove anyone can do it under pressure at 3 a.m., and the only way
  to learn that is to rehearse it deliberately.
