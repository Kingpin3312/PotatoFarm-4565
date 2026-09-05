import type { Role } from "@prisma/client";

/**
 * Permissions, not roles, are what the code checks.
 *
 * Every `if (role === "ADMIN")` scattered through a codebase is a place
 * the rules can drift apart. One table here, and adding a role is a data
 * change rather than a search-and-replace.
 */
/**
 * ## A permission nothing checks is worse than no permission
 *
 * Four used to sit in this list — `org:read`, `viewing:read`,
 * `profile:read` and `profile:write` — and no code anywhere asked for
 * any of them. They were removed rather than wired, because in this
 * codebase **reads are bounded by tenancy and writes by permission**:
 * row-level security decides which brokerage's rows exist at all, and
 * `leadScope` narrows a lead list to what the role may see. A member of
 * an organisation may read that organisation.
 *
 * The harm was not the dead entry. It was that `VIEWER` listed
 * `viewing:read`, so a reviewer reading this file would conclude the
 * viewings diary was gated on it — while `viewings.day` is an
 * `orgProcedure` and always was. That is precisely the shape of the
 * `auth.magicLink` bug: a rule sitting in a table, read as evidence of
 * a control, invoked by nothing.
 *
 * Removing them cannot change behaviour, and that is checkable rather
 * than asserted: `Permission` is a union of exactly this list, so any
 * surviving use is a type error.
 *
 * If a read genuinely needs gating later, add the permission **in the
 * same commit as the `requirePermission` that checks it.**
 */
export const PERMISSIONS = [
  "org:update", "org:delete", "org:billing",
  "member:invite", "member:update", "member:remove",
  "lead:read:own", "lead:read:all", "lead:create", "lead:update", "lead:delete", "lead:assign",
  "conversation:read", "conversation:send", "conversation:takeover",
  "listing:read", "listing:write",
  "viewing:write",
  "channel:read", "channel:write",
  "audit:read",
  "export:all",

  // The document register — broker cards, the brokerage licence,
  // Trakheesi permits. Read is wide because an agent needs to see that
  // their own card is about to lapse; write is not, because a document
  // recorded against the wrong owner alarms the wrong person. The one
  // exception is carved out in the router rather than here: an agent may
  // always record a document that belongs to them.
  "document:read",
  "document:write",

  // AML. Split deliberately: an agent needs to see that a file exists and
  // whether it is complete, so they know whether they can proceed. Only
  // the compliance officer sees the reports — telling a client one has
  // been filed is an offence in itself.
  "kyc:read",       // the file exists, its status, what is outstanding
  "kyc:write",      // collect and attach documents
  "kyc:approve",    // sign off the due diligence
  "compliance:read",   // reports, screening detail, risk rationale
  "compliance:file",   // decide to file, or decide not to
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const AGENT: Permission[] = [
  "lead:read:own", "lead:create", "lead:update",
  "conversation:read", "conversation:send", "conversation:takeover",
  "listing:read", "viewing:write",
  // An agent can see whether the file is done and chase what is missing.
  // They cannot approve it, and they cannot see the reports.
  "kyc:read", "kyc:write",
  // Seeing the register, including their own broker card. The card is
  // the document most likely to lapse unnoticed because it belongs to a
  // person rather than to a property.
  "document:read",
];

const MANAGER: Permission[] = [
  ...AGENT, "lead:read:all", "lead:assign", "lead:delete",
  "listing:write", "channel:read", "audit:read", "member:invite",
  "document:write",
];

const ADMIN: Permission[] = [
  ...MANAGER, "org:update",
  "member:update", "member:remove", "channel:write", "export:all",
  "kyc:approve",
  // Deliberately absent: compliance:read and compliance:file. An admin
  // can run the brokerage without being able to read a suspicious
  // transaction report, and that separation is the whole reason the
  // appointment is a legal requirement.
];

/**
 * The compliance officer.
 *
 * Not a superset of anything. They see every KYC file and every report,
 * across all leads, and they approve due diligence — and they have no
 * business changing billing, publishing listings or removing members.
 * Bundling compliance into ADMIN, which is the tempting shortcut, defeats
 * the separation the appointment exists to create.
 */
const COMPLIANCE: Permission[] = [
  "lead:read:all", "conversation:read",
  "kyc:read", "kyc:write", "kyc:approve",
  "compliance:read", "compliance:file",
  "audit:read", "export:all",
  // A client's passport and Emirates ID expiring is addressed to
  // COMPLIANCE by `expiry.ts`, so the officer has to be able to both see
  // the register and put the replacement in it.
  "document:read", "document:write",
];

export const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  VIEWER: ["lead:read:all", "conversation:read", "listing:read"],
  COMPLIANCE_OFFICER: COMPLIANCE,
  AGENT: AGENT,
  MANAGER: MANAGER,
  ADMIN: ADMIN,
  OWNER: [...ADMIN, "org:delete", "org:billing"],
};

export function can(role: Role, permission: Permission) {
  return ROLE_PERMISSIONS[role].includes(permission);
}

/**
 * Agents see their own leads; everyone above sees the lot. Returned as a
 * Prisma filter rather than checked after the fetch — filtering in memory
 * means the rows were already on the wire.
 */
export function leadScope(role: Role, userId: string) {
  return can(role, "lead:read:all") ? {} : { assignedToId: userId };
}
