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

export async function audit(tx: Prisma.TransactionClient, orgId: string, e: Entry) {
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
