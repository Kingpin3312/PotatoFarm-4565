# Getting this running

## What you have

Source files and a schema, not a working application. **Nothing here has
been compiled or run.** Budget half a day to get `npm run dev` up, and
expect the errors to be real.

## Steps

    # 1. Download the folder from the chat, then:
    cd potato-crm
    git init && git add -A && git commit -m "Initial import"

    # 2. Install
    npm install

    # 3. Database — local Postgres or Neon/Supabase
    echo 'DATABASE_URL="postgresql://localhost:5432/potatofarm"' > .env.local
    npx prisma generate
    npx prisma db push

    # 4. Row-level security. Prisma does not manage this — run it by hand.
    psql $DATABASE_URL -f src/server/db/rls.sql
    psql $DATABASE_URL -f src/server/db/scheduling.sql

    # 5. See what actually breaks
    npm run typecheck

## Then open Claude Code

    claude

It reads `CLAUDE.md` automatically. A good opening prompt:

> Run `npm run typecheck` and work through the errors one file at a time.
> Read CLAUDE.md first — several things in here look wrong and are
> deliberate. Show me each fix before applying it if it touches anything
> in the "do not undo" list.

## Order I would work in

1. **Typecheck clean.** Nothing else matters until it compiles.
2. **`prisma validate`** and a real migration rather than `db push`.
3. **The RLS policies actually applied**, then prove it: connect as
   `potato_app`, set a different org, confirm you see nothing.
4. **One route end to end** — `/api/trpc` with the leads router, against
   a seeded database.
5. **The inbox thread rendering** against real data.
6. Everything else.

## Things that will bite

- **Prisma `Unsupported("tstzrange")`** on `Viewing.timespan` — it is a
  generated column, created by `scheduling.sql`, and Prisma only reads
  it. `db push` may fight you; use a migration.
- **`next-auth` v5 is beta** and its API moved. The config is written to
  the v5 shape.
- **Tailwind v4** uses `@theme inline` in CSS rather than a JS config.
  That is deliberate; the tokens come from one file.
- **BigInt and JSON** do not mix. superjson is configured on tRPC for
  exactly this.
- The **marketing site** (`potato-site/`) is separate and static. It does
  not need any of this.

## What to hand Claude Code first

Not the whole thing. Pick one vertical slice — leads, or the inbox — and
get it genuinely working end to end. A codebase that compiles everywhere
and works nowhere is harder to fix than one that works in one place.
