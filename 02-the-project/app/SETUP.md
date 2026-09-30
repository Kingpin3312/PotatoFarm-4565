# Running it on a laptop

`DEPLOY.md` covers putting it on the internet. This covers one computer,
for development or for clicking through the product with the demo
brokerage. About half an hour.

(This file used to say the code had never been compiled or run. That
stopped being true long ago: it builds, runs and passes its checks.
The old steps — `prisma db push` and applying `rls.sql` by hand — are
wrong now, because the migrations do all of it.)

## What you need

- Node 20 or newer.
- Postgres 16, running locally (Postgres.app on a Mac is the easiest).

## Steps

    # 1. From 02-the-project/app
    npm install

    # 2. Two database logins. The app's own login is deliberately NOT
    #    the owner of the tables — that is what makes each brokerage's
    #    data invisible to the others. The migrations create it; give it
    #    a password once they have run (step 4).
    createdb potatofarm

    # 3. Settings
    cp .env.example .env
    #    DATABASE_URL          postgresql://potato_app:<password>@localhost:5432/potatofarm
    #    DATABASE_URL_DIRECT   postgresql://<your owner login>@localhost:5432/potatofarm
    #      (the login Postgres.app gives you is fine: it must own the
    #       tables and be allowed past the row-level security rules)
    #    DATABASE_URL_UNSCOPED the same owner address as DATABASE_URL_DIRECT
    #    AUTH_SECRET           any long random string (openssl rand -base64 32)
    #    SECRETS_KEY           openssl rand -base64 32
    #    DEMO_OWNER_EMAIL      your email, if you will sign in by email
    #    Everything else can stay empty for now; the app says at start-up
    #    what each empty one switches off.

    # 4. Tables, security rules and the app's login
    npx prisma generate
    npx prisma migrate deploy        # uses DATABASE_URL_DIRECT
    psql potatofarm -c "ALTER ROLE potato_app LOGIN PASSWORD '<password>'"

    # 5. The demo brokerage (Marina Bay) — safe to run again at any time
    npm run db:seed

    # 6. Start it
    npm run dev                      # http://localhost:3000

**Never use `prisma migrate dev` or `db push`.** They silently drop
indexes and keys Prisma cannot see; CLAUDE.md explains. New migrations
are written by hand and applied with `migrate deploy`.

## Signing in

Sign-in is an emailed link, so with no email service configured nobody
can sign in the ordinary way. Either:

- **Set `RESEND_API_KEY`** (and `MAIL_FROM` on a domain verified with
  Resend), then sign in with the email set as `DEMO_OWNER_EMAIL` before
  you ran the seed; or
- **Use a seeded session.** In the browser's developer tools
  (Application → Cookies → localhost), add a cookie named
  `authjs.session-token` with the value `dev-session-token-ask-history`
  and reload. You are Omar, the demo brokerage's owner.
  `dev-session-manager` is Lena, an agent.

## Checking it works

    npm test                           # unit tests, no database
    npm run check:locations            # one of the database suites
    npm run verify                     # everything; long — see CLAUDE.md

## Then

Read `CLAUDE.md` before changing anything. Several things in this code
look wrong and are deliberate, and it lists them.
