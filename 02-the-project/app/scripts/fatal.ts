/**
 * What to print when a check cannot even start.
 *
 * The checks are the first thing a new person runs, and the first thing
 * that goes wrong is that Postgres is not up. Today they answer that
 * with a forty-line Prisma stack trace, which reads as *the code is
 * broken* rather than *start the database* — and somebody loses an hour
 * to it before they have written a line.
 *
 * Same principle as the product itself: the failure is real, so say what
 * it is and what to do about it, and keep the stack trace underneath for
 * the case where it genuinely is the code.
 */

type Hint = { match: (msg: string) => boolean; say: string[] };

const HINTS: Hint[] = [
  {
    match: (m) => /Can't reach database server|ECONNREFUSED.*5432|Connection refused/i.test(m),
    say: [
      "Postgres is not accepting connections.",
      "",
      "  pg_isready                     # confirm",
      "  pg_ctlcluster 16 main start    # or however this machine starts it",
      "",
      "Nothing is wrong with the code — these checks all need a real database,",
      "because the things they prove (tenant isolation especially) cannot be",
      "proved against a mock.",
    ],
  },
  {
    match: (m) => /Environment variable not found: DATABASE_URL|datasource.*not found/i.test(m),
    say: [
      "DATABASE_URL is not set.",
      "",
      "Copy .env.example to .env and fill it in. The checks read .env directly.",
    ],
  },
  {
    match: (m) => /does not exist in the current database|relation .* does not exist|P2021/i.test(m),
    say: [
      "The database is there but the tables are not.",
      "",
      "  npx prisma migrate deploy",
      "",
      "The migration also applies row-level security, which is the tenant",
      "boundary — a database without it will fail the tenancy check for real.",
    ],
  },
  {
    match: (m) => /new row violates row-level security/i.test(m),
    say: [
      "Row-level security refused a write from the privileged role.",
      "",
      "The role behind DATABASE_URL_UNSCOPED needs BYPASSRLS:",
      "  ALTER ROLE <role> BYPASSRLS;",
      "",
      "rls.sql sets FORCE ROW LEVEL SECURITY, so even the table owner is",
      "subject to the policies. In production this shows up as sign-up",
      "failing for every new customer.",
    ],
  },
];

/** Print the human explanation, then the raw error, then leave. */
export function fatal(e: unknown, cleanup?: () => void): never {
  const msg = e instanceof Error ? `${e.message}` : String(e);
  const hint = HINTS.find((h) => h.match(msg));

  if (hint) {
    console.error(`\n${hint.say.join("\n")}\n`);
    console.error("─".repeat(58));
    console.error(msg.split("\n").slice(0, 4).join("\n"));
  } else {
    console.error(e);
  }

  try { cleanup?.(); } catch { /* a failing cleanup must not hide the real error */ }
  process.exit(1);
}
