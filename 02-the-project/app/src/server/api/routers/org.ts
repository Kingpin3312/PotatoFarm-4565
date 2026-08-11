import { z } from "zod";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { limitAll, keysFor } from "@/server/lib/ratelimit";
import { router, orgProcedure, publicProcedure, requirePermission } from "../trpc";
import { switchOrg } from "@/server/auth/session";
import { crossTenant } from "@/server/db/client";
import { audit } from "@/server/lib/audit";
import { sendInvite } from "@/server/lib/mail";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

export const orgRouter = router({
  /** Brokerages this user belongs to, for the switcher. */
  /**
   * The agent's own calendar feed URL.
   *
   * `orgProcedure`, not a permission — this is a person's own diary and
   * every role that can see a viewing can subscribe to their own.
   *
   * Returns null until they ask for one. A capability URL that exists is
   * one that can leak, so nobody gets a live secret minted for them by
   * default; `calendarRotate` is the only thing that creates it.
   */
  calendarFeed: orgProcedure.query(async ({ ctx }) => {
    const m = await ctx.db.membership.findUnique({
      where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
      select: { calendarToken: true, calendarTokenAt: true, calendarLastReadAt: true },
    });
    return {
      url: m?.calendarToken
        ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/calendar/${m.calendarToken}`
        : null,
      createdAt: m?.calendarTokenAt ?? null,
      /** So "is it still working" has an answer other than a shrug. */
      lastReadAt: m?.calendarLastReadAt ?? null,
    };
  }),

  /**
   * Mint a feed URL, or replace the one that exists.
   *
   * One button does both, deliberately. The moment an agent realises
   * they have pasted the link into a group chat, the useful action is
   * "make the old one dead", and making them find a separate revoke
   * control first is how a live secret stays live.
   *
   * 32 random bytes, base64url. Rotating clears `calendarLastReadAt`,
   * because the old feed's last read says nothing about the new one and
   * a stale timestamp there would read as "working".
   */
  calendarRotate: orgProcedure.mutation(async ({ ctx }) => {
    const token = randomBytes(32).toString("base64url");
    await ctx.db.membership.update({
      where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
      data: { calendarToken: token, calendarTokenAt: new Date(), calendarLastReadAt: null },
    });
    await audit(ctx.db, ctx.orgId, {
      actorId: ctx.userId,
      action: "calendar.rotate",
      entity: "Membership",
      entityId: ctx.userId,
      // The token itself is never audited. An audit row a manager can
      // read is not where a live credential belongs.
      after: { rotated: true },
    });
    return { url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/calendar/${token}` };
  }),

  mine: orgProcedure.query(async ({ ctx }) => {
    const rows = await crossTenant("user-scoped").membership.findMany({
      where: { userId: ctx.userId, org: { deletedAt: null } },
      select: { role: true, org: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: "asc" },
    });
    return rows.map((r) => ({ ...r.org, role: r.role, active: r.org.id === ctx.orgId }));
  }),

  switch: orgProcedure
    .input(z.object({ orgId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const role = await switchOrg(ctx.userId, input.orgId);
      return { orgId: input.orgId, role };
    }),

  members: requirePermission("member:invite").query(async ({ ctx }) => {
    const [members, pending] = await Promise.all([
      ctx.db.membership.findMany({
        select: {
          id: true, role: true, createdAt: true,
          user: { select: { id: true, name: true, email: true, lastSeenAt: true } },
        },
        orderBy: { createdAt: "asc" },
      }),
      ctx.db.invitation.findMany({
        where: { acceptedAt: null, expiresAt: { gt: new Date() } },
        select: { id: true, email: true, role: true, expiresAt: true },
      }),
    ]);
    return { members, pending };
  }),

  invite: requirePermission("member:invite")
    .input(z.object({
      email: z.string().trim().toLowerCase().email(),
      role: z.enum(["ADMIN", "MANAGER", "AGENT", "VIEWER"]),
    }))
    .mutation(async ({ ctx, input }) => {
      // An ADMIN cannot mint an OWNER. Enforced by the enum above rather
      // than by hoping nobody posts one — privilege escalation through an
      // unvalidated role field is the oldest bug in multi-tenant software.
      if (input.role === "ADMIN" && ctx.role !== "OWNER" && ctx.role !== "ADMIN") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Only an owner or admin can invite admins." });
      }

      const token = randomBytes(32).toString("base64url");

      const invite = await ctx.db.$transaction(async (tx) => {
        const row = await tx.invitation.upsert({
          where: { orgId_email: { orgId: ctx.orgId, email: input.email } },
          create: {
            orgId: ctx.orgId,
            email: input.email,
            role: input.role,
            tokenHash: hash(token),
            invitedById: ctx.userId,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
          // Re-inviting replaces the token, so the old link stops working.
          update: {
            role: input.role,
            tokenHash: hash(token),
            acceptedAt: null,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
        });

        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "member.invite",
          entity: "Invitation",
          entityId: row.id,
          // The token is never logged. Neither is its hash.
          after: { email: input.email, role: input.role },
        });

        return row;
      });

      await sendInvite({ to: input.email, token, orgName: ctx.orgName });
      return { id: invite.id };
    }),

  /**
   * Accepting an invitation. Public, because the invitee may not have an
   * account yet — which is exactly why every check below matters.
   */
  acceptInvite: publicProcedure
    .input(z.object({ token: z.string().min(20) }))
    .mutation(async ({ ctx, input }) => {
      const session = ctx.session;
      if (!session?.user?.id) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in first, then open the link again." });
      }

      /**
       * Throttled, which it was not.
       *
       * `ratelimit.ts` has declared an `org.acceptInvite` rule since it
       * was written and nothing ever called it — `billing.signup` was
       * the only action actually limited. This mutation takes a token,
       * looks it up by hash, and on a hit puts the caller inside a
       * brokerage. Unthrottled, that is an offline guessing attack with
       * no cost to the attacker and no trace beyond rows that look like
       * ordinary failed lookups.
       *
       * Keyed on the user, not the IP: the caller is signed in by this
       * point, so the account is the precise thing to limit, and an
       * office behind one NAT is not punished for it.
       */
      const verdict = await limitAll("org.acceptInvite", keysFor({
        ip: ctx.ip,
        email: session.user.email ?? null,
      }));
      if (!verdict.ok) {
        throw new TRPCError({
          code: "TOO_MANY_REQUESTS",
          message: `Too many attempts. Try again in ${Math.ceil(verdict.retryAfterSeconds / 60)} minutes.`,
        });
      }

      const invite = await crossTenant("user-scoped").invitation.findUnique({
        where: { tokenHash: hash(input.token) },
        include: { org: { select: { id: true, name: true, deletedAt: true } } },
      });

      // One message for every failure. Distinguishing "no such invite"
      // from "expired" from "wrong person" tells an attacker which
      // addresses have pending invitations.
      const bad = () =>
        new TRPCError({ code: "BAD_REQUEST", message: "That invitation is no longer valid." });

      if (!invite || invite.acceptedAt || invite.expiresAt < new Date()) throw bad();
      if (invite.org.deletedAt) throw bad();

      // Constant-time compare on the email so timing cannot be used to
      // probe which address an invite belongs to.
      const a = Buffer.from(invite.email);
      const b = Buffer.from(session.user.email?.toLowerCase() ?? "");
      if (a.length !== b.length || !timingSafeEqual(a, b)) throw bad();

      await crossTenant("user-scoped").$transaction(async (tx) => {
        await tx.membership.upsert({
          where: { orgId_userId: { orgId: invite.orgId, userId: session.user.id } },
          create: { orgId: invite.orgId, userId: session.user.id, role: invite.role },
          update: {},
        });
        await tx.invitation.update({
          where: { id: invite.id },
          data: { acceptedAt: new Date() },
        });
        await audit(tx, invite.orgId, {
          actorId: session.user.id,
          action: "member.join",
          entity: "Membership",
          entityId: session.user.id,
          after: { role: invite.role },
        });
      });

      await switchOrg(session.user.id, invite.orgId);
      return { orgId: invite.orgId, orgName: invite.org.name };
    }),

  removeMember: requirePermission("member:remove")
    .input(z.object({ userId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (input.userId === ctx.userId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "You can't remove yourself." });
      }

      const target = await ctx.db.membership.findUnique({
        where: { orgId_userId: { orgId: ctx.orgId, userId: input.userId } },
      });
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });

      // Only an owner can remove an owner, and never the last one — an
      // organisation with no owner cannot be billed, transferred or closed.
      if (target.role === "OWNER") {
        if (ctx.role !== "OWNER") {
          throw new TRPCError({ code: "FORBIDDEN", message: "Only an owner can remove an owner." });
        }
        const owners = await ctx.db.membership.count({ where: { role: "OWNER" } });
        if (owners <= 1) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "A brokerage must keep at least one owner." });
        }
      }

      await ctx.db.$transaction(async (tx) => {
        await tx.membership.delete({ where: { id: target.id } });

        // Their leads stay with the brokerage. Losing an agent must not
        // lose the pipeline — unassign rather than cascade.
        await tx.lead.updateMany({
          where: { assignedToId: input.userId },
          data: { assignedToId: null, assignedAt: null },
        });

        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "member.remove",
          entity: "Membership",
          entityId: input.userId,
          before: { role: target.role },
        });
      });

      // Drop any session still pointing at this brokerage, so removal
      // takes effect on their next request rather than at token expiry.
      await crossTenant("user-scoped").session.updateMany({
        where: { userId: input.userId, activeOrgId: ctx.orgId },
        data: { activeOrgId: null },
      });

      return { ok: true };
    }),
});
