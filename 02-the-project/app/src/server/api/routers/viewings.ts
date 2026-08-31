import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { router, orgProcedure, requirePermission } from "../trpc";
import { audit } from "@/server/lib/audit";
import { availableSlots, offerable, humanSlot } from "@/server/lib/scheduling";

/** Postgres raises this when the exclusion constraint refuses an overlap. */
const EXCLUSION_VIOLATION = "23P01";

export const viewingsRouter = router({
  /**
   * Today, for the agent asking.
   *
   * Their own viewings by default — a manager's day view is a different
   * question and a different screen. Returns the address fields so the
   * card can offer directions without a second round trip.
   */
  day: orgProcedure
    .input(z.object({ date: z.date(), agentId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const start = new Date(input.date); start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start.getTime() + 86_400_000);

      const rows = await ctx.db.viewing.findMany({
        where: {
          agentId: input.agentId ?? ctx.userId,
          scheduledAt: { gte: start, lt: end },
          status: { not: "CANCELLED" },
        },
        orderBy: { scheduledAt: "asc" },
        select: {
          id: true, scheduledAt: true, durationMins: true,
          address: true, building: true, lat: true, lng: true, accessNote: true,
          lead: { select: { name: true, phone: true } },
          listing: { select: { reference: true } },
        },
      });

      return {
        viewings: rows.map((v) => ({
          id: v.id,
          scheduledAt: v.scheduledAt,
          durationMins: v.durationMins,
          leadName: v.lead?.name ?? null,
          leadPhone: v.lead?.phone ?? null,
          reference: v.listing?.reference ?? null,
          address: v.address,
          building: v.building,
          lat: v.lat,
          lng: v.lng,
          accessNote: v.accessNote,
        })),
      };
    }),

  slots: orgProcedure
    .input(z.object({
      /**
       * Whose diary. Defaults to the caller.
       *
       * The booking screen wanted its own user id and reached for
       * `org.mine`, which returns the brokerages you belong to and has no
       * `userId` on it — there is no "who am I" procedure. An agent
       * booking their own viewing should not have to look themselves up,
       * and the server already knows who is asking.
       */
      agentId: z.string().optional(),
      listingId: z.string().optional(),
      days: z.number().min(1).max(21).default(7),
    }))
    .query(async ({ ctx, input }) => {
      const agentId = input.agentId ?? ctx.userId;
      const listing = input.listingId
        ? await ctx.db.listing.findUnique({
            where: { id: input.listingId },
            select: { community: true },
          })
        : null;

      const { slots, configured } = await availableSlots({
        orgId: ctx.orgId,
        agentId,
        from: new Date(),
        days: input.days,
        community: listing?.community,
      });

      // `configured` travels with the slots so the screen can tell "your
      // week is full" from "nobody has set the working hours" — which
      // are the same empty list and opposite instructions.
      return {
        configured,
        slots: offerable(slots).map((s) => ({ ...s, label: humanSlot(s) })),
      };
    }),

  /**
   * Hold a slot while the lead decides.
   *
   * Written as a real row rather than a lock in memory, so a restart does
   * not free every held slot at once, and so the agent's own diary shows
   * the hold. Fifteen minutes: long enough to answer a WhatsApp message,
   * short enough that an unanswered offer does not block a Saturday.
   */
  hold: orgProcedure
    .input(z.object({
      leadId: z.string(),
      /** Defaults to the caller, as `slots` does — an agent booking their
       *  own viewing should not have to name themselves. A manager
       *  booking on someone else's diary still passes it. */
      agentId: z.string().optional(),
      listingId: z.string().optional(),
      start: z.date(),
      /**
       * Bounded, because this value reaches a generated Postgres column
       * and a `gist` exclusion constraint rather than just a form.
       *
       * `z.number()` alone accepted both ends of the range and both were
       * faults. A negative duration puts the upper bound of `timespan`
       * before the lower, which Postgres rejects outright — and the catch
       * below only handles an exclusion violation, so it surfaced as an
       * unhandled 500. A very large one creates a range spanning
       * centuries, and the exclusion constraint then blocks every future
       * booking for that agent until somebody finds and deletes the row.
       *
       * Eight hours is the longest plausible viewing; five minutes the
       * shortest useful one.
       */
      durationMins: z.number().int().min(5).max(480).default(30),
    }))
    .mutation(async ({ ctx, input }) => {
      /**
       * The agent must be in this brokerage.
       *
       * `agentId` arrives from the client and is written straight to the
       * row. Row-level security does not catch it: `orgId` comes from the
       * session so the insert is legitimately in-tenant, and `User` is a
       * global table, so an id belonging to another brokerage resolves
       * perfectly well.
       *
       * Two things went wrong without this. `notify/sweep.ts` dispatches
       * the reminder with `assignedToId: v.agentId`, and `sendPush`
       * resolves devices by user id with no org filter — so a push
       * carrying a buyer's name and the property left the tenant
       * entirely. And because `audience()` returns only the assigned user
       * at rung 0, nobody *inside* the brokerage was told either: the
       * viewing simply fell off every list.
       *
       * `leads.assign` and `pipeline.bulkAssign` have always done this.
       * This procedure took the same class of input and did not.
       */
      const agentId = input.agentId ?? ctx.userId;
      if (agentId !== ctx.userId) {
        const member = await ctx.db.membership.findUnique({
          where: { orgId_userId: { orgId: ctx.orgId, userId: agentId } },
          select: { userId: true },
        });
        if (!member) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "That agent isn't in your team." });
        }
      }

      try {
        return await ctx.db.viewing.create({
          data: {
            orgId: ctx.orgId,
            leadId: input.leadId,
            listingId: input.listingId,
            agentId,
            scheduledAt: input.start,
            durationMins: input.durationMins,
            status: "SCHEDULED",
            heldUntil: new Date(Date.now() + 15 * 60_000),
          },
        });
      } catch (err) {
        // The constraint did the work. This is the race that a
        // check-then-insert would have lost silently.
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === EXCLUSION_VIOLATION) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That slot has just gone. Offer them another one.",
          });
        }
        throw err;
      }
    }),

  confirm: orgProcedure
    .input(z.object({ viewingId: z.string() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const v = await tx.viewing.update({
          where: { id: input.viewingId },
          data: { status: "CONFIRMED", heldUntil: null },
        });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: "viewing.confirm",
          entity: "Viewing", entityId: v.id,
        });
        return v;
      })
    ),

  reschedule: requirePermission("viewing:write")
    .input(z.object({ viewingId: z.string(), start: z.date() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await ctx.db.$transaction(async (tx) => {
          const before = await tx.viewing.findUnique({ where: { id: input.viewingId } });
          if (!before) throw new TRPCError({ code: "NOT_FOUND" });

          const after = await tx.viewing.update({
            where: { id: input.viewingId },
            data: {
              scheduledAt: input.start,
              status: "SCHEDULED",
              // A moved viewing needs its reminders again. Leaving these
              // set means the lead is reminded about the old time and
              // nobody about the new one.
              remindedLeadAt: null,
              remindedAgentAt: null,
            },
          });

          await audit(tx, ctx.orgId, {
            actorId: ctx.userId, action: "viewing.reschedule",
            entity: "Viewing", entityId: after.id,
            before: { scheduledAt: before.scheduledAt },
            after: { scheduledAt: after.scheduledAt },
          });
          return after;
        });
      } catch (err) {
        if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === EXCLUSION_VIOLATION) {
          throw new TRPCError({ code: "CONFLICT", message: "The agent already has something then." });
        }
        throw err;
      }
    }),

  /**
   * Outcome. The field the whole pipeline hangs on and the one agents
   * never fill in — so it is two taps, and the reminder chases it.
   */
  outcome: requirePermission("viewing:write")
    .input(z.object({
      viewingId: z.string(),
      status: z.enum(["COMPLETED", "NO_SHOW", "CANCELLED"]),
      note: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const v = await tx.viewing.update({
          where: { id: input.viewingId },
          data: { status: input.status, outcome: input.note },
        });

        // A no-show is a signal, not an ending. The lead goes back to the
        // pipeline rather than quietly disappearing, because a buyer who
        // missed a Saturday is not a buyer who has gone away.
        if (input.status === "NO_SHOW") {
          await tx.lead.update({
            where: { id: v.leadId },
            data: { status: "QUALIFIED", stageEnteredAt: new Date() },
          });
        }

        await audit(tx, ctx.orgId, {
          actorId: ctx.userId, action: `viewing.${input.status.toLowerCase()}`,
          entity: "Viewing", entityId: v.id, after: { note: input.note },
        });
        return v;
      })
    ),

  /** Today and tomorrow, for the agent's own screen. */
  mine: orgProcedure
    .input(z.object({ days: z.number().min(1).max(14).default(2) }))
    .query(({ ctx, input }) =>
      ctx.db.viewing.findMany({
        where: {
          agentId: ctx.userId,
          status: { in: ["SCHEDULED", "CONFIRMED"] },
          scheduledAt: {
            gte: new Date(),
            lte: new Date(Date.now() + input.days * 86_400_000),
          },
        },
        orderBy: { scheduledAt: "asc" },
        include: {
          lead: { select: { id: true, name: true, phone: true, budgetMaxFils: true } },
          listing: { select: { reference: true, title: true, community: true } },
        },
      })
    ),
});
