import { z } from "zod";
import { can } from "@/server/auth/rbac";
import { randomBytes, createHash, timingSafeEqual } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { limitAll, keysFor } from "@/server/lib/ratelimit";
import { router, orgProcedure, publicProcedure, requirePermission } from "../trpc";
import { switchOrg } from "@/server/auth/session";
import { crossTenant } from "@/server/db/client";
import { audit } from "@/server/lib/audit";
import { sendInvite } from "@/server/lib/mail";
import { DAY_NAMES, DEFAULT_HOURS, hhmm, fromHhmm } from "@/server/lib/hours/defaults";

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

  /**
   * The listing feed a portal fetches.
   *
   * Brokerage-level, unlike the calendar feed above, because a portal
   * takes the firm's inventory rather than one agent's diary — and
   * `org:update` for the same reason: this is a credential for the
   * whole brokerage's advertising, not a personal convenience.
   */
  listingFeed: requirePermission("org:update").query(async ({ ctx }) => {
    const org = await ctx.db.organisation.findUnique({
      where: { id: ctx.orgId },
      select: { feedToken: true, feedTokenAt: true },
    });
    return {
      url: org?.feedToken
        ? `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/feed/${org.feedToken}/listings.xml`
        : null,
      createdAt: org?.feedTokenAt ?? null,
    };
  }),

  /**
   * Mint the feed URL, or replace the one that exists.
   *
   * One control for both, for the reason `calendarRotate` gives: the
   * moment somebody realises the link is in the wrong inbox, the useful
   * action is making the old one dead, and a separate revoke button is
   * how a live secret stays live.
   *
   * **Generating this is what turns the feed on.** There is no enabled
   * flag beside it — a feed nobody holds a URL for is off, and a
   * boolean next to a nullable token is two sources of truth for one
   * fact, which is how a screen comes to disagree with the system.
   */
  rotateListingFeed: requirePermission("org:update").mutation(async ({ ctx }) => {
    const token = randomBytes(32).toString("base64url");
    await ctx.db.organisation.update({
      where: { id: ctx.orgId },
      data: { feedToken: token, feedTokenAt: new Date() },
    });
    await audit(ctx.db, ctx.orgId, {
      actorId: ctx.userId,
      action: "listingFeed.rotate",
      entity: "Organisation",
      entityId: ctx.orgId,
      // Never the token. An audit row a manager can read is not where a
      // live credential belongs — same rule as the calendar feed.
      after: { rotated: true },
    });
    return {
      url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/feed/${token}/listings.xml`,
    };
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
  /**
   * The working week.
   *
   * Lives on the org router because it is a property of the brokerage,
   * not of a person — `WorkingHours` is keyed by `orgId` and day, and
   * `availableSlots()` reads it for whichever agent is being booked.
   *
   * Readable by anyone signed in: an agent needs to know why a Friday
   * morning is not on offer, and the hours are not sensitive. Writing
   * needs `org:update`.
   */
  hours: orgProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db.workingHours.findMany({ orderBy: { dayOfWeek: "asc" } });
    return DAY_NAMES.map((name, dow) => {
      const row = rows.find((r) => r.dayOfWeek === dow);
      /**
       * The fallback is `DEFAULT_HOURS`, not a flat nine-to-seven.
       *
       * It was the latter, which meant the form pre-filled Friday at
       * 09:00 while `seedHours` writes 14:30 — two answers to "what is
       * the default week", and whichever ran second won. A brokerage
       * that signed up got Friday afternoons; one that opened this
       * screen and pressed Save got Friday mornings nobody will attend.
       *
       * One source, so they cannot disagree.
       */
      const fallback = DEFAULT_HOURS.find((h) => h.dayOfWeek === dow);
      return {
        dayOfWeek: dow,
        name,
        // A missing row is not a closed day — it is a day nobody has
        // said anything about, and `availableSlots` skips it exactly as
        // if it were closed. Reported as `unset` so the screen can show
        // the difference the scheduler cannot.
        unset: !row,
        closed: row?.closed ?? fallback?.closed ?? false,
        start: hhmm(row?.startMin ?? fallback?.startMin ?? 9 * 60),
        end: hhmm(row?.endMin ?? fallback?.endMin ?? 19 * 60),
      };
    });
  }),

  setHours: requirePermission("org:update")
    .input(z.object({
      days: z.array(z.object({
        dayOfWeek: z.number().int().min(0).max(6),
        closed: z.boolean(),
        /** "09:00". Parsed on the server; minutes are the stored unit. */
        start: z.string().max(5),
        end: z.string().max(5),
      })).length(7),
    }))
    .mutation(async ({ ctx, input }) => {
      const rows = input.days.map((d) => {
        const start = fromHhmm(d.start);
        const end = fromHhmm(d.end);
        if (start === null || end === null) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${DAY_NAMES[d.dayOfWeek]}: use 24-hour times like 09:00.`,
          });
        }
        /**
         * A day that ends before it starts is refused rather than
         * stored.
         *
         * `availableSlots` steps `for (m = startMin; m + duration <=
         * endMin; ...)`, so an inverted day produces no slots and looks
         * exactly like a closed one — the brokerage would see Tuesday
         * quietly stop being bookable with nothing to explain it.
         * Closed days skip the check because their times are ignored.
         */
        if (!d.closed && end <= start) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `${DAY_NAMES[d.dayOfWeek]} ends before it starts. Close the day instead if you do not work it.`,
          });
        }
        return { dayOfWeek: d.dayOfWeek, closed: d.closed, startMin: start, endMin: end };
      });

      // One transaction: a half-written week is a week where some days
      // silently stopped being bookable.
      await ctx.db.$transaction(
        rows.map((r) =>
          ctx.db.workingHours.upsert({
            where: { orgId_dayOfWeek: { orgId: ctx.orgId, dayOfWeek: r.dayOfWeek } },
            create: { orgId: ctx.orgId, ...r },
            update: { closed: r.closed, startMin: r.startMin, endMin: r.endMin },
          })
        )
      );

      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId,
        action: "org.setHours",
        entity: "Organisation",
        entityId: ctx.orgId,
        after: {
          days: rows.map((r) =>
            r.closed ? `${DAY_NAMES[r.dayOfWeek]} closed`
                     : `${DAY_NAMES[r.dayOfWeek]} ${hhmm(r.startMin)}-${hhmm(r.endMin)}`),
        },
      });

      return { days: rows.length };
    }),
  /**
   * My own availability.
   *
   * **Nothing ever wrote an `AgentAvailability` row.** Routing reads it
   * for capacity, languages, communities and away-dates, and with no row
   * every agent silently defaults to capacity 40 and always available —
   * so an agent on leave kept receiving leads and a brokerage that
   * thought it had set a limit had not.
   *
   * `orgProcedure`, not a permission: this is a person editing their own
   * availability. Requiring a manager to mark somebody's holiday is how
   * holidays stop being marked.
   *
   * Returns the defaults rather than null when no row exists, because
   * the defaults are what routing actually applies — a screen showing
   * blanks would misreport a capacity that is already in force.
   */
  /**
   * When I do not want to be buzzed, and what happens instead.
   *
   * Nothing in this product ever wrote a `NotificationPrefs` row, so
   * `inQuietHours` was evaluated against `quietFromMin: null` every time
   * and returned false every time. Every notification of every kind
   * pushed immediately, at any hour, on any day — including the ones
   * `rules.ts` marks `digest` and describes as "sent at a civilised
   * hour".
   *
   * `urgency` was the field that revealed it. It is consulted in exactly
   * one place — whether an urgent notification may override quiet hours
   * — so with quiet hours unsettable it had no effect on anything at
   * all. A declared field that changes no behaviour is the same shape as
   * a module nothing calls.
   *
   * The cost is not being woken once. It is that the only lever an agent
   * had was switching notifications off at the phone, which takes every
   * alarm with it: the lead waiting mid-conversation, the deal slipping
   * its Form F date, the broker card that lapses in sixty days.
   */
  /**
   * How much of the board each agent can see, and how long they get
   * with their own numbers first.
   *
   * Nothing ever wrote a `TeamVisibility` row, so every brokerage in
   * the product ran on `RANKED` with a 24-hour head start whether that
   * suited them or not. Both defaults are defensible — that is why they
   * are the defaults — and neither was ever anybody's decision.
   *
   * `leaderboard.ts` records where these came from, and it is worth
   * repeating because it is the whole argument for the feature:
   *
   *   *"If I can see my own numbers before my manager does, it's a
   *   tool. If he sees them first, it's surveillance."*
   *
   * Readable by anyone, because an agent is entitled to know what their
   * colleagues can see about them. Writable by an admin, because it is
   * a brokerage-wide policy rather than a personal setting.
   */
  teamVisibility: orgProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.teamVisibility.findUnique({ where: { orgId: ctx.orgId } });
    return {
      // Again the distinction that matters: chose the defaults, or
      // never opened the screen.
      set: Boolean(row),
      mode: row?.mode ?? "RANKED",
      agentHeadStartHours: row?.agentHeadStartHours ?? 24,
      canChange: can(ctx.role, "org:update"),
    };
  }),

  setTeamVisibility: requirePermission("org:update")
    .input(z.object({
      mode: z.enum(["OPEN", "RANKED", "PRIVATE"]),
      /**
       * Zero is allowed and means no head start — a brokerage that
       * wants everyone on the same figures at the same moment. Capped
       * at a week, because beyond that a manager is not looking at a
       * leaderboard, they are looking at history.
       */
      agentHeadStartHours: z.number().int().min(0).max(168),
    }))
    .mutation(async ({ ctx, input }) => {
      const row = await ctx.db.teamVisibility.upsert({
        where: { orgId: ctx.orgId },
        create: { orgId: ctx.orgId, ...input },
        update: { ...input },
      });

      /**
       * Audited, and this one earns it more than most.
       *
       * Opening a board that was private, or removing the head start,
       * changes what a brokerage's staff can see about each other. An
       * agent who notices the change is entitled to find out when it
       * happened and who did it.
       */
      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId,
        action: "org.teamVisibility",
        entity: "TeamVisibility",
        entityId: row.id,
        after: { mode: input.mode, headStartHours: input.agentHeadStartHours },
      });

      return { ok: true as const };
    }),

  notifications: orgProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.notificationPrefs.findUnique({
      where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
    });
    const org = await ctx.db.organisation.findUnique({
      where: { id: ctx.orgId }, select: { timezone: true },
    });
    return {
      // `set` distinguishes "chose the defaults" from "never opened
      // this", which is the distinction the whole feature turned on.
      set: Boolean(row),
      push: row?.push ?? true,
      email: row?.email ?? false,
      quietFromMin: row?.quietFromMin ?? null,
      quietToMin: row?.quietToMin ?? null,
      daysOff: row?.daysOff ?? [],
      urgentOverridesQuiet: row?.urgentOverridesQuiet ?? false,
      // Quiet hours are evaluated in the brokerage's timezone, not the
      // phone's. Said on the screen so 22:00 is unambiguous.
      timezone: org?.timezone ?? "Asia/Dubai",
    };
  }),

  setNotifications: orgProcedure
    .input(z.object({
      push: z.boolean(),
      email: z.boolean(),
      /** Minutes from midnight, or null for "always available". */
      quietFromMin: z.number().int().min(0).max(1439).nullable(),
      quietToMin: z.number().int().min(0).max(1439).nullable(),
      /** 0 = Sunday. Agents here often take Monday, not Sunday. */
      daysOff: z.array(z.number().int().min(0).max(6)).max(7),
      urgentOverridesQuiet: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      /**
       * Half a range is refused rather than stored.
       *
       * `inQuietHours` returns false unless **both** ends are set, so a
       * row with a start and no end is a quiet period that silently
       * never applies — the agent sets 22:00, believes they are covered
       * and gets woken anyway. Exactly the shape of the inverted away
       * period above.
       */
      const half = (input.quietFromMin === null) !== (input.quietToMin === null);
      if (half) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Quiet hours need a start and an end, or neither.",
        });
      }
      if (input.quietFromMin !== null && input.quietFromMin === input.quietToMin) {
        // A zero-length range reads as "quiet from 22:00 to 22:00" and
        // silences nothing. The wrap-around arithmetic would also make
        // it ambiguous with a 24-hour range.
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Quiet hours cannot start and end at the same time.",
        });
      }
      if (input.daysOff.length === 7 && input.push) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Every day off means nothing ever reaches you. Turn push off instead — it is the same thing, said plainly.",
        });
      }

      const row = await ctx.db.notificationPrefs.upsert({
        where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
        create: { orgId: ctx.orgId, userId: ctx.userId, ...input },
        update: { ...input },
      });

      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId,
        action: "notifications.prefs",
        entity: "NotificationPrefs",
        entityId: row.id,
        after: {
          push: input.push, email: input.email,
          quiet: input.quietFromMin === null ? null : `${input.quietFromMin}-${input.quietToMin}`,
          daysOff: input.daysOff,
        },
      });

      return { ok: true as const };
    }),

  availability: orgProcedure.query(async ({ ctx }) => {
    const row = await ctx.db.agentAvailability.findUnique({
      where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
    });
    return {
      set: Boolean(row),
      acceptingLeads: row?.acceptingLeads ?? true,
      capacity: row?.capacity ?? 40,
      awayFrom: row?.awayFrom ?? null,
      awayTo: row?.awayTo ?? null,
      awayNote: row?.awayNote ?? null,
      languages: row?.languages ?? [],
      communities: row?.communities ?? [],
    };
  }),

  /**
   * Set my own.
   *
   * Capacity, languages and communities are deliberately **not** here —
   * they are a management decision about how work is shared out, and an
   * agent who can raise their own capacity to 400 has a lever nobody
   * asked them to have. What an agent owns is whether they are taking
   * work at all, and when they are away.
   */
  setAvailability: orgProcedure
    .input(z.object({
      acceptingLeads: z.boolean(),
      /** ISO dates, or null to clear the whole away period. */
      awayFrom: z.string().datetime().nullish(),
      awayTo: z.string().datetime().nullish(),
      awayNote: z.string().trim().max(140).nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const from = input.awayFrom ? new Date(input.awayFrom) : null;
      const to = input.awayTo ? new Date(input.awayTo) : null;

      /**
       * An away period that ends before it starts is refused.
       *
       * `available()` skips an agent while `awayUntil > now`, so an
       * inverted period simply never applies — the agent goes on holiday
       * and the leads keep arriving, with nothing on any screen to
       * explain it. The same shape as the working-hours check.
       */
      if (from && to && to <= from) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The last day away is before the first. Check the dates.",
        });
      }
      // Half a period is not a period: routing reads `awayTo` alone, so a
      // start with no end would be recorded and never do anything.
      if ((from && !to) || (!from && to)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Give both a first and a last day away, or neither.",
        });
      }

      const data = {
        acceptingLeads: input.acceptingLeads,
        awayFrom: from,
        awayTo: to,
        awayNote: input.awayNote ?? null,
      };

      await ctx.db.agentAvailability.upsert({
        where: { orgId_userId: { orgId: ctx.orgId, userId: ctx.userId } },
        create: { orgId: ctx.orgId, userId: ctx.userId, ...data },
        update: data,
      });

      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId,
        action: "availability.set",
        entity: "AgentAvailability",
        entityId: ctx.userId,
        after: {
          acceptingLeads: input.acceptingLeads,
          away: from && to ? `${from.toISOString().slice(0, 10)} to ${to.toISOString().slice(0, 10)}` : null,
        },
      });

      return { ok: true };
    }),

  /**
   * Everyone's, for whoever shares the work out.
   *
   * Includes members with no row, showing the defaults routing applies
   * to them — a list of only the configured half cannot show the gap,
   * and the gap is the point.
   */
  teamAvailability: requirePermission("member:update").query(async ({ ctx }) => {
    const [members, rows] = await Promise.all([
      ctx.db.membership.findMany({
        where: { role: "AGENT" },
        select: { userId: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
      ctx.db.agentAvailability.findMany(),
    ]);

    const now = new Date();
    return members.map((m) => {
      const r = rows.find((x) => x.userId === m.userId);
      return {
        userId: m.userId,
        name: m.user.name ?? m.user.email,
        set: Boolean(r),
        acceptingLeads: r?.acceptingLeads ?? true,
        capacity: r?.capacity ?? 40,
        languages: r?.languages ?? [],
        communities: r?.communities ?? [],
        // What routing is doing right now, not what was typed. An away
        // period in the past is not "away".
        awayNow: Boolean(r?.awayTo && r.awayTo > now && (!r.awayFrom || r.awayFrom <= now)),
        awayTo: r?.awayTo ?? null,
      };
    });
  }),

  /** Capacity and specialisms, which are a management decision. */
  setTeamAvailability: requirePermission("member:update")
    .input(z.object({
      userId: z.string(),
      capacity: z.number().int().min(1).max(500),
      languages: z.array(z.string().trim().min(1).max(20)).max(10),
      communities: z.array(z.string().trim().min(1).max(80)).max(30),
    }))
    .mutation(async ({ ctx, input }) => {
      const member = await ctx.db.membership.findFirst({
        where: { userId: input.userId },
        select: { userId: true },
      });
      if (!member) throw new TRPCError({ code: "NOT_FOUND", message: "Not a member of this brokerage." });

      const data = {
        capacity: input.capacity,
        languages: input.languages,
        communities: input.communities,
      };
      await ctx.db.agentAvailability.upsert({
        where: { orgId_userId: { orgId: ctx.orgId, userId: input.userId } },
        create: { orgId: ctx.orgId, userId: input.userId, ...data },
        update: data,
      });

      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId,
        action: "availability.setForMember",
        entity: "AgentAvailability",
        entityId: input.userId,
        after: data,
      });

      return { ok: true };
    }),
});
