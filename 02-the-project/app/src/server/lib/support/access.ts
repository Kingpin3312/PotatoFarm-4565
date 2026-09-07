import { crossTenant } from "@/server/db/client";
import { forOrg } from "@/server/db/client";

/**
 * Supporting a customer without building a backdoor.
 *
 * There is a real tension here and the easy answer is wrong.
 *
 * Tenant isolation is enforced by Postgres row-level security, and the
 * application role has no `BYPASSRLS`. That was deliberate: it is what
 * makes the security page's claims true rather than aspirational.
 *
 * Then a brokerage rings at eight in the morning saying leads have
 * stopped arriving, and somebody has to look.
 *
 * The tempting answer is a support role that can read every tenant. That
 * single decision undoes the guarantee — from then on, "nobody outside
 * your brokerage can see your data" is false, and the honest version of
 * the security page has to say so.
 *
 * What is built instead:
 *
 *   1. **The customer grants access**, to a named person, for a reason,
 *      with an expiry. Never a role, never a team, never open-ended.
 *   2. **Read only by default.** Writing on a customer's behalf is a
 *      separate, explicit decision.
 *   3. **Every action is tagged.** The audit log records that it was
 *      support, which grant authorised it, and who at the brokerage
 *      agreed to it.
 *   4. **The customer can see the whole history and revoke instantly.**
 *      A grant they cannot inspect is not consent.
 *
 * The cost is that a customer with a problem has to press a button before
 * anyone can help. That is a real cost and it is worth paying, because
 * the alternative is a permanent hole that exists whether or not anyone
 * has a problem.
 */

export type SupportSession = {
  orgId: string;
  grantId: string;
  staffEmail: string;
  canWrite: boolean;
  expiresAt: Date;
};

export async function openSession(orgId: string, staffEmail: string): Promise<SupportSession> {
  const grant = await crossTenant("pre-tenant").supportGrant.findFirst({
    where: {
      orgId,
      staffEmail: staffEmail.toLowerCase(),
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    orderBy: { grantedAt: "desc" },
  });

  if (!grant) {
    // Deliberately the same message whether the grant never existed, has
    // expired, or was revoked. A support engineer does not need to know
    // which, and the distinction leaks information about the customer.
    throw new Error("No active grant for this brokerage. Ask them to grant access from Settings.");
  }

  // Opening the session is itself an event. Somebody looking and finding
  // nothing wrong is still somebody who looked.
  await crossTenant("pre-tenant").auditLog.create({
    data: {
      orgId,
      actorType: "SYSTEM",
      action: "support.session_open",
      entity: "SupportGrant",
      entityId: grant.id,
      after: { staffEmail: grant.staffEmail, canWrite: grant.canWrite, reason: grant.reason },
    },
  });

  return {
    orgId,
    grantId: grant.id,
    staffEmail: grant.staffEmail,
    canWrite: grant.canWrite,
    expiresAt: grant.expiresAt,
  };
}

/**
 * A tenant-scoped handle for support.
 *
 * Uses exactly the same RLS path as the customer's own requests — there
 * is no privileged connection. Support sees precisely what a member of
 * that brokerage would see, and nothing outside it, because the database
 * is enforcing it rather than the application promising to.
 */
export function supportDb(session: SupportSession) {
  if (session.expiresAt < new Date()) {
    throw new Error("That support session has expired. Ask the customer to grant it again.");
  }
  return forOrg(session.orgId);
}

/** Writing requires the second grant, checked at the point of use. */
export function assertCanWrite(session: SupportSession) {
  if (!session.canWrite) {
    throw new Error(
      "This grant is read-only. Ask the customer to grant write access, and tell them what you intend to change."
    );
  }
}

/**
 * Anything support does is recorded as support, not as the customer.
 *
 * The failure this avoids is the one that matters: an audit log showing
 * a brokerage's own manager deleting a lead, when in fact it was somebody
 * at the vendor. That is not a logging bug, it is a false accusation
 * sitting in a record the customer trusts.
 */
export async function auditAsSupport(
  session: SupportSession,
  entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown }
) {
  await crossTenant("pre-tenant").auditLog.create({
    data: {
      orgId: session.orgId,
      actorType: "SYSTEM",
      action: `support.${entry.action}`,
      entity: entry.entity,
      entityId: entry.entityId,
      before: entry.before as never,
      after: {
        ...(entry.after as object),
        _support: { staff: session.staffEmail, grant: session.grantId },
      } as never,
    },
  });
}

/** Runs hourly. Expiry is enforced, not merely recorded. */
export async function expireGrants() {
  const expired = await crossTenant("pre-tenant").supportGrant.findMany({
    where: { revokedAt: null, expiresAt: { lt: new Date() } },
    select: { id: true, orgId: true, staffEmail: true },
  });

  for (const g of expired) {
    await crossTenant("pre-tenant").auditLog.create({
      data: {
        orgId: g.orgId,
        actorType: "SYSTEM",
        action: "support.grant_expired",
        entity: "SupportGrant",
        entityId: g.id,
        after: { staffEmail: g.staffEmail },
      },
    });
  }
  return expired.length;
}
