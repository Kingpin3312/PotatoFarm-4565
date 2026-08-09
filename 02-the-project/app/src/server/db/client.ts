import { PrismaClient } from "@prisma/client";

const base = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
});

/**
 * Tenant-scoped database handle.
 *
 * `app.current_org` is set with `set_config(..., true)` — the `true` makes
 * it transaction-local. That detail matters: with a connection pool, a
 * session-level setting outlives the request and the next request on that
 * connection inherits the previous tenant's scope. That is the exact bug
 * that turns row-level security into a false sense of safety.
 */
export function forOrg(orgId: string) {
  return base.$extends({
    query: {
      $allModels: {
        async $allOperations({ args, query }) {
          return base.$transaction(async (tx) => {
            await tx.$executeRaw`SELECT set_config('app.current_org', ${orgId}, true)`;
            return query(args);
          });
        },
      },
    },
  });
}

/** Unscoped. Sign-in, org creation, and scheduled jobs only. */
export const rootDb = base;

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
  return rootDb;
}
