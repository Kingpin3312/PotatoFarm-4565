# Putting the application live, the first time

`website/DEPLOY.md` covers the marketing site. `SETUP.md` covers a
laptop. `OPERATIONS.md` covers keeping it running once it is up. This
covers the gap between them: the first production deploy, in order, with
the things that have a lead time flagged before the things that do not.

Written to be followed in a day.

---

## Start the clock on DNS before anything else

**Sign-in is a magic link. There is no password.** `src/instrumentation.ts`
states the consequence in one line:

    RESEND_API_KEY — no sign-in link is delivered, so nobody can get in

So the critical path is not code, it is a DNS record. Create the Resend
account, add the domain, publish SPF and DKIM, and let it propagate
while you do everything else. If this is left until the deployment is
otherwise finished, the day ends with a working product nobody can log
into.

---

## What has a lead time, and what does not

| | Time to obtain | Blocks |
|---|---|---|
| Resend + verified domain | Minutes to hours (DNS) | **Sign-in. Everything.** |
| Postgres (Neon / Supabase) | Minutes | All of it |
| Vercel Pro | Minutes, ~$20/mo | The crons |
| Anthropic key | Minutes | The assistant |
| Alert webhook + heartbeat | Minutes, free | Knowing when it breaks |
| Stripe test key | Minutes | Billing |
| S3 / R2 bucket | Minutes | Uploads, KYC documents |
| **WhatsApp Business API** | **Days to weeks** | **The core product loop** |

**Meta's business verification is the one that cannot be hurried.**
Until it clears, real inbound WhatsApp does not work — see *Testing
without Meta* below, which recovers most of the value in the meantime.

---

## 1. The database, and the part that is easy to get backwards

Two roles. This is the tenant boundary, not a preference.

```sql
-- as the owning role
CREATE ROLE potato_app LOGIN PASSWORD '<strong password>';
```

| Variable | Role | Pooled? |
|---|---|---|
| `DATABASE_URL` | `potato_app` — restricted, subject to RLS | **Yes** |
| `DATABASE_URL_DIRECT` | the owner — migrations only | No |
| `DATABASE_URL_UNSCOPED` | the owner — `crossTenant()` | No |

Two failure modes, both quiet:

- **`DATABASE_URL` pointing at the owner** — row-level security enforces
  nothing, every check still passes, and one brokerage can read
  another's leads. The whole security promise, gone, with no error.
- **`DATABASE_URL_DIRECT` pointing at `potato_app`** — this one at least
  fails loudly: `must be owner of table` on the first
  `prisma migrate deploy`.

**`DATABASE_URL` must go through a pooler.** Every serverless invocation
opens its own connection, every scheduled job opens more, and `forOrg()`
opens a transaction per query on top. Supabase and Neon publish a pooler
host on `:6543`; PgBouncer wants `?pgbouncer=true`. Keep the other two
unpooled — migrations cannot run through a transaction-mode pooler.

## 2. Prove the configuration before you deploy it

```bash
PREFLIGHT_ENV=1 VERCEL_PLAN=pro npm run check:preflight
```

It refuses a `DATABASE_URL` that is not pooled, a `DATABASE_URL_DIRECT`
identical to it, a `SECRETS_KEY` that is not 32 bytes of base64, any
secret still carrying a development placeholder, and a plan that cannot
run this workload. It names the one that is wrong.

Run it *before* the deploy. Each of those failures is silent in
production, which is why the check exists.

## 3. The plan is not optional

**25 cron jobs and `maxDuration = 300`.** Vercel Hobby allows
two crons at daily granularity and caps a function at sixty seconds.

Deploying to Hobby **does not fail**. The crons simply never run — and
for a product built on nightly sweeps, scoring, digests and health
checks, that is the quietest possible outage. Nothing errors; things
merely stop happening.

## 4. Deploy the application

`prisma generate` is already in the build script, which avoids the
standard first-deploy failure on Vercel's cached `node_modules`.

```bash
npx prisma migrate deploy      # direct URL, owning role
```

The migrations create the row-level security policies and the
`potato_app` grants. They also create the role itself as `NOLOGIN` — in
production you give it credentials out of band, which is step 1.

**Do not run `npm run db:seed` against production.** It creates a
fixture brokerage. Use the real sign-up flow; testing it is worth a
deploy on its own.

## 5. Then the website — in that order

Cloudflare Pages or Netlify, `02-the-project/website`, no build step.
`website/DEPLOY.md` is the checklist.

**The order matters.** The site's forms post to `app.potatofarm.io`. Put
the site up first and it goes live with two dead forms on the page that
exists to convert brokerage owners.

## 6. Confirm it is actually up

```bash
curl https://app.potatofarm.io/api/health
```

`200` with `{"ok":true}`. It opens a database connection, so `503` means
the database specifically — not a general "something is wrong".

Then two things that are easy to skip and expensive to skip:

- **Every cron has fired at least once**, in the platform's log. A cron
  that was never scheduled looks exactly like a cron with nothing to do.
- **The heartbeat monitor has received a ping.** Until it has, nothing
  outside the system can tell you it has stopped.

## 7. Before anything real goes in it

```bash
pg_dump --format=custom --file=backup.dump "$DATABASE_URL_DIRECT"
npm run db:restore-drill backup.dump
```

A backup nobody has restored is a hypothesis. The drill asserts that
**row-level security came back** — a restore can return every table and
every row and drop the policies, which looks like a perfect recovery and
is a cross-tenant breach on the first sign-in.

---

## Testing without Meta

Real WhatsApp needs business verification that takes days. Almost
everything downstream of it can be tested now.

`check:whatsapp-inbound` posts a **correctly signed** webhook at the
running application and asserts the whole chain: a lead exists for the
sender, it is on the pipeline board rather than stranded, a conversation
was opened, the 24-hour window has something to measure from, and the
message body was stored. It then sends a second message and asserts no
duplicate lead was created and an agent's correction to the name
survived.

Point it at the deployment with the real `WHATSAPP_APP_SECRET` and you
have exercised the entire inbound path except Meta's delivery.

`WHATSAPP_APP_SECRET` may be any string until Meta issues the real one —
the check signs its own delivery with it, so both ends agree. Run
directly with the variable unset it exits 1 and says so; **but
`npm run verify` skips it rather than failing**, which is how the one
end-to-end proof that an inbound message becomes a lead can quietly go
unrun.

---

## What will not work on day one, and what it looks like

`src/instrumentation.ts` logs every unconfigured service at boot with its
consequence, because each fails quietly at the moment it is first
needed:

| Missing | What a user sees |
|---|---|
| `ANTHROPIC_API_KEY` | The assistant hands every conversation to a person — which looks like a working inbox |
| `STRIPE_SECRET_KEY` | No card can be taken, no invoice settled |
| `S3_BUCKET` | No brochure, no floor plan, no KYC document can be uploaded |
| `TRANSCRIBE_API_KEY` | The Speak button does nothing on any iPhone |
| `CRON_SECRET` | Every scheduled job refuses to run |

Read that log after the first deploy. It is the cheapest inventory of
what is actually switched on.

---

## Realistic shape of the day

- **Morning** — accounts, DNS, database roles, preflight green.
- **Midday** — application deployed, migrations applied, sign-in working.
- **Afternoon** — website live, health and crons confirmed, restore
  drill run.
- **Late** — simulated WhatsApp inbound, and a first pass through the
  screens as a real user.

What you will not have is a real WhatsApp conversation. That waits on
Meta, and it is the only thing that does.
