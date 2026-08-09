import type { Prisma } from "@prisma/client";

/**
 * Audit logging.
 *
 * Written inside the same transaction as the change it records. If the
 * change commits, the log commits; if it rolls back, so does the log.
 * Logging after the fact means every failure between the two produces a
 * change nobody can account for — which is precisely the gap an auditor
 * asks about.
 */
type Entry = {
  actorId?: string | null;
  action: string;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string;
  userAgent?: string;
};

/** Fields that must never reach the log, however the caller passes them. */
const REDACT = new Set(["password", "token", "secretRef", "apiKey", "accessToken"]);

function scrub(value: unknown): unknown {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(scrub);
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      REDACT.has(k) ? [k, "[redacted]"] : [k, scrub(v)]
    )
  );
}

/**
 * Anything that can write an audit row.
 *
 * Typed structurally rather than as `Prisma.TransactionClient`, because
 * both callers are legitimate and only one of them is a transaction
 * client:
 *
 *   - a real `tx` inside `$transaction`, from the webhook and job paths
 *   - `ctx.db`, the org-scoped client `forOrg()` returns, from every
 *     router
 *
 * `forOrg()` returns a `$extends`-ed client, which is not structurally a
 * `TransactionClient`, so all twenty-two router call sites failed to
 * compile against the narrower type.
 *
 * **A caveat that outlives this fix.** The promise at the top of this
 * file — the log commits if and only if the change does — holds for the
 * `tx` callers and does not hold for the `ctx.db` ones, because
 * `forOrg()` wraps every single operation in its own transaction. The
 * change and its audit row are therefore two transactions, and a failure
 * between them leaves a change with no record. Closing that properly
 * means reworking `forOrg()` so a request shares one transaction, which
 * is a separate piece of work.
 */
export type AuditWriter = {
  auditLog: {
    create(args: { data: Prisma.AuditLogUncheckedCreateInput }): unknown;
  };
};

export async function audit(tx: AuditWriter, orgId: string, e: Entry) {
  await tx.auditLog.create({
    data: {
      orgId,
      actorId: e.actorId ?? null,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      before: scrub(e.before) as Prisma.InputJsonValue,
      after: scrub(e.after) as Prisma.InputJsonValue,
      ip: e.ip,
      userAgent: e.userAgent,
    },
  });
}
