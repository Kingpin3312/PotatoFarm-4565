import { cache } from "react";
import { auth } from "./config";
import { crossTenant } from "@/server/db/client";
import type { Role } from "@prisma/client";

export type ActiveMembership = { orgId: string; orgName: string; role: Role };

/**
 * Resolves which brokerage the current request is acting for.
 *
 * The rule: **the stored organisation is a preference, never a grant.**
 * Membership is re-read on every request. If an agent is removed from a
 * brokerage while signed in, their next request drops out of it — rather
 * than continuing until a token happens to expire.
 *
 * `cache()` dedupes this within a single render pass, so the layout, the
 * page and any server component share one query rather than three.
 */
export const getActiveMembership = cache(async (): Promise<ActiveMembership | null> => {
  const session = await auth();
  if (!session?.user?.id) return null;

  const memberships = await crossTenant("pre-tenant").membership.findMany({
    where: { userId: session.user.id, org: { deletedAt: null } },
    select: { orgId: true, role: true, org: { select: { name: true } } },
    orderBy: { createdAt: "asc" },
  });

  if (memberships.length === 0) return null;

  const stored = await crossTenant("pre-tenant").session.findFirst({
    where: { userId: session.user.id, expires: { gt: new Date() } },
    select: { activeOrgId: true },
    orderBy: { lastActiveAt: "desc" },
  });

  // Fall back to the first membership if the stored org is stale, gone, or
  // one this user was never in.
  const active =
    memberships.find((m) => m.orgId === stored?.activeOrgId) ?? memberships[0];

  return { orgId: active.orgId, orgName: active.org.name, role: active.role };
});

/** Everything a signed-in request needs, in one call. */
export const getSessionContext = cache(async () => {
  const [session, membership] = await Promise.all([auth(), getActiveMembership()]);
  return { session, membership };
});

export async function switchOrg(userId: string, orgId: string) {
  // Verified against Membership, not trusted from the request. Without
  // this check the org switcher is an authorisation bypass with a nice UI.
  const member = await crossTenant("pre-tenant").membership.findUnique({
    where: { orgId_userId: { orgId, userId } },
  });
  if (!member) throw new Error("Not a member of that brokerage.");

  await crossTenant("pre-tenant").session.updateMany({
    where: { userId },
    data: { activeOrgId: orgId },
  });
  return member.role;
}
