# Scheduled jobs

By the time this was written the codebase had a dozen functions whose
comments said "runs nightly" or "runs every few minutes", and **none of
them ran.** This is what runs them.

## The hazard worth designing against

On serverless a cron fires once, but the platform retries and instances
scale. Two concurrent runs of the reminder sweep send every reminder
twice. Two concurrent runs of invoice generation bill every customer
twice, and that one does not get forgiven.

Two overlapping defences, on purpose:

1. **A Postgres advisory lock** — one run of a job at a time across every
   instance. No Redis and no new dependency; the database is already
   there and already the thing everything else agrees on. `try_lock`
   rather than `lock`, because a second run should skip rather than wait —
   waiting just means two runs happen back to back.
2. **Every job is independently idempotent.** The lock is not trusted on
   its own, because a lock is a runtime guarantee and money is not a
   runtime concern. Invoices are keyed on subscription and period,
   reminders on a sent-at timestamp, notifications on a unique
   constraint.

Invoicing rolls the billing period forward *after* the invoice exists, so
a failure halfway leaves the period un-advanced and tomorrow's run simply
tries again.

## A job that stops running is silent

The recurring failure in this whole system is silence — a portal feed
that stops delivering, an assistant that stops replying, a health check
nobody wired up. A cron that quietly stops firing belongs on that list,
and it is the one that would take longest to notice, because everything
it does is invisible when it works.

`jobsHealth()` reports the last successful run of each job against how
often it should happen, and flags anything three intervals late. One
missed run is a blip; three in a row is a cron that has stopped.

## What the wiring check found

A script compares every function claiming a schedule in its comments
against what is actually registered. It found one real gap:
`expiringPermits` said "runs daily" and was wired to nothing — it was a
query on the listings page, so an expiring Trakheesi permit only surfaced
if somebody happened to open that page.

An expired permit means the listing is pulled and the brokerage is
advertising illegally. That needs to come and find them, so it is now a
daily job that notifies once per brokerage rather than once per listing —
eleven separate alerts about eleven permits is how somebody mutes the app.

Worth keeping that check in CI. The gap was invisible in review because
the comment said the right thing.

## The endpoint is authenticated

An unauthenticated endpoint that triggers invoicing is a way for anyone
who finds the URL to bill every customer again. The lock and the period
check would both catch it; it should still never be reachable.
