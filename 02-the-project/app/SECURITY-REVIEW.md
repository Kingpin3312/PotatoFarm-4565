# Security review

The question this asked that no other check does: **where does the tenant
boundary not apply, and is every one of those places safe?**

## The finding that matters

Row-level security protects every query made through `forOrg()`. It does
not protect `rootDb`, which has to exist — jobs and webhooks run with no
user session, and sweeping every brokerage is the point of half of them.

The review found **131 unscoped `rootDb` queries.**

**Every single one was safe.** Scoped by a globally unique provider
reference, or by a subscription id, or by user rather than org, or
deliberately cross-tenant because it is a nightly sweep.

That is the good news and it is not the point.

> They were safe **by argument**, not **by construction**.

Nothing stopped the 132nd from being a leak. Nothing announced which
category a call belonged to — the reviewer had to reason it out each
time, which is exactly the kind of vigilance that fails on a Friday
afternoon when somebody is adding one more query before the weekend.

### What was done about it

`crossTenant(reason)` replaces every bare `rootDb`. The reason is one of
four words and costs nothing at runtime:

| Reason | Count | Means |
|---|---|---|
| `sweep` | 90 | Deliberately every brokerage — a scheduled job |
| `global-key` | 16 | Scoped by a globally unique id, like a Stripe reference |
| `user-scoped` | 15 | Scoped by user rather than org — the brokerage switcher |
| `pre-tenant` | 10 | Before a tenant is known — sign-in, accepting an invitation |

**`crm-audit.py` now fails the build on a bare `rootDb`.** The bypass has
to be declared. It can no longer be assumed.

This is the same shape as every other decision in this codebase: make the
dangerous thing announce itself rather than trusting everyone to
remember.

## Also fixed

**Eight files were logging through `console` directly**, bypassing the
scrubber built specifically to keep buyers' phone numbers and message
bodies out of logs. None of the eight was leaking personal data today.
All eight were one careless edit away from it, and a log that goes to a
third party is a breach with a long fuse.

Every log line now goes through one path that scrubs and carries the
tenant.

## Checked and clean

- **No secrets in source.** No Stripe keys, no Meta tokens, no hardcoded
  credentials.
- **No unsafe SQL.** Every raw query is a Prisma tagged template, which
  parameterises. No `$queryRawUnsafe`, no `Prisma.raw()`.
- **Every webhook verifies its signature** — WhatsApp, Stripe, portals.
  Constant-time, against the raw body.
- **No `dangerouslySetInnerHTML`** anywhere.
- **The cron endpoint is authenticated.** An open invoicing endpoint is a
  way for anyone who finds the URL to bill every customer again.

## The five remaining, all deliberate

- **`acceptInvite` is public** — necessarily, because you accept an
  invitation before you are a member. The token is hashed at rest and
  compared in constant time.
- **Three signature checks** flagged for confirmation. All three use
  `timingSafeEqual`.
- **One variable URL and one variable href**, both from a fixed internal
  list.

## What my own tooling got wrong

Five false positives across this review, and the pattern held:

- It reported the function containing a query as `rather()` — it had
  matched a word inside a comment.
- It flagged every safe `${}` in a Prisma tagged template as SQL
  injection. Parameterising interpolations is the entire reason tagged
  templates exist.
- It flagged three `console.warn` calls as leaking personal data. One
  logged a channel id, one logged nothing, one logged company names.

All of them came from **rules that asserted where they should have
asked.** The checks phrased as "confirm this" have been right every time;
the ones phrased as "this is broken" have been wrong five times out of
nine.

That is worth more than any individual finding here: a security report
people stop reading is worse than no security report, and the fastest way
to get there is confident wrongness.
