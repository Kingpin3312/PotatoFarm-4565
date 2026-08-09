import { PrismaClient } from "@prisma/client";

const logLevels: ("query" | "warn" | "error")[] =
  process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"];

/**
 * Two connections, and the difference between them is the whole point.
 *
 * `scoped` connects as a role that row-level security applies to. Every
 * policy in rls.sql is enforced against it, so a query that forgets its
 * `where orgId` returns nothing rather than everything.
 *
 * `privileged` connects as a role that bypasses RLS. It has to exist,
 * and this was found the hard way: with RLS on every tenant table and a
 * single connection, `getActiveMembership()` reads Membership before any
 * brokerage is known, matches no policy, returns zero rows — and nobody
 * can sign in to the product at all. Sign-in, org creation, the
 * webhooks and every nightly sweep are all legitimately cross-tenant and
 * cannot be scoped by definition.
 *
 * The split is safe here only because the codebase already funnels every
 * unscoped query through one announced function. `crossTenant(reason)`
 * was written to make the escape hatch visible; it now also decides
 * which connection is used, so the privileged role is reachable from
 * exactly one place and `crm-audit.py` already fails the build on a bare
 * `rootDb`.
 *
 * **`DATABASE_URL_UNSCOPED` falls back to `DATABASE_URL`.** In
 * development they are usually the same superuser and RLS never bites.
 * In production they must differ, or RLS is decorative — the scoped role
 * has to be one that does not own the tables and does not have
 * BYPASSRLS. Said loudly at boot rather than left to be discovered.
 */
const scoped = new PrismaClient({ log: logLevels });

const unscopedUrl = process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL;

if (process.env.NODE_ENV === "production" && !process.env.DATABASE_URL_UNSCOPED) {
  console.warn(
    "[db] DATABASE_URL_UNSCOPED is not set, so scoped and unscoped queries share one " +
      "connection. If that role owns the tables or has BYPASSRLS, row-level security " +
      "is not enforcing anything. See src/server/db/rls.sql."
  );
}

const privileged =
  unscopedUrl && unscopedUrl !== process.env.DATABASE_URL
    ? new PrismaClient({ log: logLevels, datasources: { db: { url: unscopedUrl } } })
    : scoped;

const base = scoped;

/**
 * Tenant-scoped database handle.
 *
 * `app.current_org` is set with `set_config(..., true)` — the `true` makes
 * it transaction-local. That detail matters: with a connection pool, a
 * session-level setting outlives the request and the next request on that
 * connection inherits the previous tenant's scope. That is the exact bug
 * that turns row-level security into a false sense of safety.
 */
/**
 * One extended client per brokerage, not one per request.
 *
 * `$extends` builds a whole proxy over every model on the client. This
 * was called fresh inside `forOrg()` on every `orgProcedure`
 * invocation — a page issuing five tRPC calls built five of them, and
 * threw all five away.
 *
 * Safe to cache because the extension closes over exactly two things:
 * `base`, which is a module singleton, and `orgId`, which is the cache
 * key. Nothing request-specific is captured — no user, no session, no
 * transaction. If that ever stops being true this cache becomes a
 * tenant leak, so the rule is: **nothing from the request may enter this
 * closure.**
 *
 * Bounded, because on a long-lived server the key space is "every
 * brokerage that has ever made a request" and an unbounded module-level
 * Map is a slow leak. Oldest-out at the cap is fine — a miss costs one
 * proxy construction, not a query.
 */
const clients = new Map<string, ReturnType<typeof extend>>();
const MAX_CACHED_ORGS = 200;

export function forOrg(orgId: string) {
  const hit = clients.get(orgId);
  if (hit) return hit;

  const client = extend(orgId);
  if (clients.size >= MAX_CACHED_ORGS) {
    // Map iterates in insertion order, so the first key is the oldest.
    const oldest = clients.keys().next().value;
    if (oldest !== undefined) clients.delete(oldest);
  }
  clients.set(orgId, client);
  return client;
}

/**
 * Why every query still opens its own transaction.
 *
 * This looks like the obvious thing to fix — two round trips and a held
 * connection per query, five times on a page issuing five tRPC calls —
 * and the tempting change is to open one interactive transaction per
 * request, `set_config` once, and pass `tx` down.
 *
 * **Do not.** `set_config(…, true)` is transaction-local, so the scope
 * must live exactly as long as the statement it protects. Widening it to
 * the request means a connection is held for the whole request — and
 * these procedures call Anthropic, Stripe and Meta's Graph API mid-flight.
 * A Postgres connection pinned open across a model call that can take
 * twenty seconds exhausts the pool long before the extra round trips
 * would have cost anything, and it does it under exactly the load where
 * it hurts.
 *
 * The array form is also the documented way to do RLS with Prisma. The
 * right place to spend the round trips is a connection pooler in front
 * of Postgres, which is a deployment decision rather than a code one —
 * see `.env.example`.
 */
function extend(orgId: string) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          /**
           * Both statements go in the array form of `$transaction`, and
           * that is the entire point.
           *
           * This used to be the interactive form:
           *
           *     base.$transaction(async (tx) => {
           *       await tx.$executeRaw`SELECT set_config(…)`;
           *       return query(args);      // <- not on tx
           *     })
           *
           * `set_config` ran on `tx`. `query(args)` is bound to `base`,
           * so it took a **different connection out of the pool** — and
           * `set_config(…, true)` is transaction-local, so the setting
           * was never in scope for the query it was meant to scope.
           *
           * With a superuser connection nothing showed, because RLS is
           * bypassed and every query worked. Against the restricted role
           * this is meant to run as, `app.current_org` is unset for every
           * read, no policy matches, and **every screen in the product
           * returns nothing at all** — an empty inbox, an empty pipeline,
           * no listings, no team. Found by running it.
           *
           * The array form issues both statements on one connection
           * inside one transaction, which is the documented way to do
           * RLS with Prisma.
           */
          const [, result] = await base.$transaction([
            base.$executeRaw`SELECT set_config('app.current_org', ${orgId}, true)`,
            query(args) as ReturnType<typeof base.$executeRaw>,
          ]);
          return result;
        },
      },
    },
  });
}

/** Unscoped. Sign-in, org creation, and scheduled jobs only. */
export const rootDb = privileged;

/**
 * The escape hatch, made to announce itself.
 *
 * `rootDb` bypasses row-level security. It has to exist — jobs and
 * webhooks run with no user session, and a sweep across every brokerage
 * is the entire point of half of them.
 *
 * The danger is not any single call. A security review found seventeen
 * unscoped `rootDb` queries and **every one was safe** — scoped by a
 * globally unique reference, or by a subscription id, or deliberately
 * cross-tenant.
 *
 * They were safe *by argument*, not *by construction*. Nothing stopped
 * the eighteenth from being a leak, and nothing announced which category
 * a call belonged to. The reviewer had to reason it out each time, which
 * is exactly the kind of vigilance that fails on a Friday afternoon.
 *
 * So: every cross-tenant query states why, in one word, at the call site.
 * `crm-audit.py` fails the build if one does not.
 */
export type CrossTenantReason =
  | "sweep"        // deliberately every brokerage — a scheduled job
  | "pre-tenant"   // before a tenant is known — sign-in, invitation
  | "global-key"   // scoped by a globally unique id — a provider ref
  | "user-scoped"; // scoped by user rather than org — the org switcher

/**
 * Use instead of `rootDb` wherever the query is not org-scoped. The
 * reason is not logged and costs nothing at runtime; it exists so the
 * next reader knows which of the four cases they are looking at without
 * reconstructing the argument.
 */
export function crossTenant(_reason: CrossTenantReason) {
  return privileged;
}
