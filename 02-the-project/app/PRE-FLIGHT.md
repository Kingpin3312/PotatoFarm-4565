# Before you compile

I scanned my own work for what will break. This is the honest list, so
you are not discovering it one error at a time.

**Everything below is known. None of it is a surprise, and none of it is
a design problem.**

## Since this was written

Three reviews ran after it — deep audit, architecture and security — and
fixed real faults. The list below still stands, with these changes:

- **`assistant/run.ts` no longer calls `audit()` with a bad signature.**
- **The `as never` casts are down** but not gone.
- **`rootDb` is now `crossTenant(reason)` everywhere**, and a bare
  `rootDb` fails the build. Do not undo this to make a type error go away.
- **Logging moved to `src/lib/log.ts`.** Imports are already repointed.

## Fixed just now

Four things meant the app could not boot at all, and one was a real bug
rather than looseness:

- `src/app/layout.tsx` — did not exist. Now does, with `viewportFit:
  "cover"` so the safe-area insets actually resolve.
- `src/app/providers.tsx` — did not exist. **superjson is configured here
  as well as on the server**, which matters: money is `BigInt` fils and
  BigInt does not survive JSON. Miss it and every commission figure
  arrives wrong, looking like a data bug rather than a serialisation one.
- `next.config.ts` and `postcss.config.mjs` — missing.
- `assistant/run.ts` called `audit()` with an `actorType` field that does
  not exist in its signature, hidden behind `as any`. That is a real bug
  and it is fixed.

## What will still fail, and why

### About a dozen `any` types

In `ingest.ts`, `routing.ts`, `replay.ts`, `run.ts` and
`property-finder.ts`. Every one is a place I took a Prisma client or a
webhook payload as `any` rather than typing it.

**These are not shortcuts to keep.** Each one hides a real signature, and
under `strict` they will fail. Replacing them is the single most useful
first task, because the errors that follow are informative rather than
noise.

### Nine `as never` casts

All of them are Prisma's `InputJsonValue` type. The values are correct;
the cast is me getting past a type rather than satisfying it.

Fix pattern: type the JSON payload as `Prisma.InputJsonValue` at the call
site rather than casting at the end.

### `z.enum()` over a mapped array

`onboarding.ts` builds an enum from `STEPS.map(s => s.key)`. Zod needs a
tuple, so it wants `as [StepKey, ...StepKey[]]`. It is written that way
already in one place and not the other.

### One genuine stub

`routers/copy.ts` has `const draft = ""`. The listing description
generation is designed and prompted but the model call is not wired.
`assistant/run.ts` shows the pattern to copy.

## What is not a bug, however it looks

Read `CLAUDE.md` before changing any of these. Short version:

- The **kill switch is deliberately uncached** — one read per turn.
- `set_config(..., true)` — the third argument is the tenant boundary.
- The **audit log has `REVOKE UPDATE, DELETE`** and erasure scrubs rather
  than deletes.
- **`replay.ts` must never import the WhatsApp client.** The audit
  asserts it.
- `AUTO_CLEAR_THRESHOLD` is `null` on purpose.
- Card ordering is a **NUMERIC, not a clever string key.** The clever one
  was written first and was wrong.

## The order I would work in

1. **Replace the `any` types.** Everything else gets clearer once the
   compiler can see.
2. **`npm run typecheck`** and work file by file. Do not batch-fix.
3. **`prisma validate`**, then a real migration rather than `db push` —
   `Viewing.timespan` is a generated column and `db push` will fight you.
4. **Apply the SQL by hand**: `rls.sql` then `scheduling.sql`.
5. **Prove the tenant boundary.** Connect as `potato_app`, set a
   different org, confirm you see nothing. If that does not hold, nothing
   else matters.
6. **One route end to end** — `/api/trpc` with the leads router against a
   seeded database.
7. **The inbox against real data**, then everything else.

## What I could not check

I have never run this. The scan above is static — it finds what I know I
was loose about. It does not find logic that is simply wrong, and there
will be some.

Treat the first week as finding out which of my judgements survive
contact with a real agent. Several will not, and the ones in the module
READMEs explain the reasoning well enough that you can tell a wrong
decision from a wrong implementation.
