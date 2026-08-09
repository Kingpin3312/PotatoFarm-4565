import { requestUpload, confirmUpload } from "@/server/lib/files/upload";
import { sendFile, libraryFor } from "@/server/lib/files/send";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { leadScope } from "@/server/auth/rbac";
import { audit } from "@/server/lib/audit";
import {
  messagingWindow, sendText, sendTemplate, WindowClosedError, WhatsAppError,
} from "@/server/lib/whatsapp";
import { getChannelCredentials } from "@/server/lib/secrets";

export const conversationsRouter = router({
  /**
   * Send a brochure, floor plan or payment plan.
   *
   * Refuses loudly rather than queuing. A file that fails silently is
   * worse than a text that does — an agent believes the buyer has the
   * floor plan and reads their silence as disinterest.
   *
   * Every refusal carries a `fix`, because "that didn't send" tells
   * somebody standing in a lobby nothing they can act on.
   */
  sendFile: requirePermission("conversation:send")
    .input(z.object({
      conversationId: z.string(),
      attachmentId: z.string(),
      caption: z.string().trim().max(1024).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await sendFile({
        orgId: ctx.orgId,
        conversationId: input.conversationId,
        attachmentId: input.attachmentId,
        actorId: ctx.userId,
        caption: input.caption,
      });
      if (!res.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: res.fix ? `${res.reason} ${res.fix}` : res.reason,
        });
      }
      return res;
    }),

  /**
   * Ask for somewhere to put a file.
   *
   * Returns a signed URL the browser uploads to directly. Nothing large
   * passes through this server — a 40MB brochure posted to a serverless
   * function is a timeout.
   */
  requestUpload: requirePermission("conversation:send")
    .input(z.object({
      fileName: z.string().trim().min(1).max(200),
      mimeType: z.string().trim().max(120),
      sizeBytes: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await requestUpload({ orgId: ctx.orgId, actorId: ctx.userId, ...input });
      if (!res.ok) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: res.fix ? `${res.reason} ${res.fix}` : res.reason,
        });
      }
      return res.ticket;
    }),

  /** Tell us it landed. The row is written only after the object exists. */
  confirmUpload: requirePermission("conversation:send")
    .input(z.object({
      storageRef: z.string(),
      listingId: z.string().optional(),
      fileName: z.string().trim().max(200),
      mimeType: z.string().trim().max(120),
      sizeBytes: z.number().int().positive(),
      kind: z.enum(["BROCHURE","FLOOR_PLAN","PAYMENT_PLAN","PHOTO","DOCUMENT","OTHER"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await confirmUpload({ orgId: ctx.orgId, actorId: ctx.userId, ...input });
      if (!res.ok) throw new TRPCError({ code: "BAD_REQUEST", message: res.reason });
      return res;
    }),

  /** What is already uploaded against this listing, ready to send. */
  files: requirePermission("conversation:read")
    .input(z.object({ listingId: z.string() }))
    .query(({ ctx, input }) => libraryFor(ctx.orgId, input.listingId)),

  /**
   * Silence the assistant on this conversation only.
   *
   * Distinct from the org-wide kill switch, which is an emergency
   * control that stops everything. This is an agent saying "I have this
   * one" — a buyer they are handling carefully, a negotiation, a
   * complaint.
   *
   * Without it the only options were "the assistant answers all my
   * buyers" or "nobody's assistant answers anybody", and an agent asked
   * to choose between those does not trust either.
   */
  mute: requirePermission("conversation:takeover")
    .input(z.object({ conversationId: z.string(), muted: z.boolean() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const c = await tx.conversation.update({
          where: { id: input.conversationId },
          data: {
            assistantMuted: input.muted,
            assistantMutedBy: input.muted ? ctx.userId : null,
            assistantMutedAt: input.muted ? new Date() : null,
          },
        });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: input.muted ? "conversation.muted" : "conversation.unmuted",
          entity: "Conversation",
          entityId: c.id,
        });
        return { muted: c.assistantMuted };
      })
    ),

  /** The inbox list. Ordered by most recent activity, not by lead age. */
  list: orgProcedure
    .input(z.object({
      filter: z.enum(["all", "unread", "handover", "mine"]).default("all"),
      cursor: z.string().nullish(),
      limit: z.number().min(1).max(50).default(25),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.conversation.findMany({
        where: {
          lead: { deletedAt: null, ...leadScope(ctx.role, ctx.userId) },
          ...(input.filter === "unread" && { unreadCount: { gt: 0 } }),
          ...(input.filter === "handover" && { humanHandover: true }),
          ...(input.filter === "mine" && { lead: { assignedToId: ctx.userId } }),
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        select: {
          id: true, unreadCount: true, humanHandover: true,
          lastInboundAt: true, updatedAt: true,
          lead: {
            select: {
              id: true, name: true, phone: true, status: true, language: true,
              budgetMin: true, budgetMax: true, intent: true,
              assignedTo: { select: { id: true, name: true } },
            },
          },
          messages: {
            take: 1,
            orderBy: { sentAt: "desc" },
            select: { body: true, direction: true, sentAt: true, status: true },
          },
        },
      });

      const nextCursor = rows.length > input.limit ? rows.pop()!.id : null;

      return {
        nextCursor,
        rows: rows.map((c) => ({
          ...c,
          // The window state travels with the row so the list can show a
          // closed conversation without a second round trip per item.
          window: messagingWindow(c.lastInboundAt),
        })),
      };
    }),

  thread: orgProcedure
    .input(z.object({ conversationId: z.string(), limit: z.number().max(200).default(60) }))
    .query(async ({ ctx, input }) => {
      const c = await ctx.db.conversation.findFirst({
        where: { id: input.conversationId, lead: leadScope(ctx.role, ctx.userId) },
        select: {
          id: true, humanHandover: true, handoverReason: true, lastInboundAt: true,
          lead: { select: { id: true, name: true, phone: true, language: true, status: true } },
          messages: {
            take: input.limit,
            orderBy: { sentAt: "desc" },
            select: {
              id: true, body: true, direction: true, author: true,
              status: true, sentAt: true, failure: true, templateName: true,
            },
          },
        },
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });

      // Reading it clears the badge. Done here rather than on the client so
      // it cannot drift between web and mobile.
      await ctx.db.conversation.update({
        where: { id: c.id },
        data: { unreadCount: 0 },
      });

      return { ...c, messages: c.messages.reverse(), window: messagingWindow(c.lastInboundAt) };
    }),

  send: requirePermission("conversation:send")
    .input(z.object({
      conversationId: z.string(),
      body: z.string().trim().min(1).max(4096),
    }))
    .mutation(async ({ ctx, input }) => {
      const c = await ctx.db.conversation.findFirst({
        where: { id: input.conversationId, lead: leadScope(ctx.role, ctx.userId) },
        select: { id: true, lastInboundAt: true, channelId: true, lead: { select: { phone: true } } },
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });

      // Checked server side, always. The UI disables the composer when the
      // window is shut, but a disabled input is a courtesy, not a control.
      if (!messagingWindow(c.lastInboundAt).open) {
        throw new TRPCError({ code: "BAD_REQUEST", message: new WindowClosedError().message });
      }

      const creds = await getChannelCredentials(ctx.orgId, c.channelId);

      // Recorded as PENDING before the send, so a message that leaves but
      // never returns an id is visible as stuck rather than lost.
      const pending = await ctx.db.message.create({
        data: {
          orgId: ctx.orgId,
          conversationId: c.id,
          direction: "OUTBOUND",
          author: "AGENT",
          authorId: ctx.userId,
          body: input.body,
          status: "PENDING",
        },
      });

      try {
        const { externalId } = await sendText({
          phoneNumberId: creds.phoneNumberId,
          accessToken: creds.accessToken,
          to: c.lead.phone.replace("+", ""),
          body: input.body,
        });

        return ctx.db.message.update({
          where: { id: pending.id },
          data: { externalId, status: "SENT" },
        });
      } catch (err) {
        const wa = err as WhatsAppError;
        await ctx.db.message.update({
          where: { id: pending.id },
          data: { status: "FAILED", failure: wa.message },
        });
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          // Pass Meta's own wording through. "Send failed" gives an agent
          // nothing; "this number has blocked you" ends the guessing.
          message: wa.message,
        });
      }
    }),

  /** Outside the window, the only thing that sends is an approved template. */
  sendTemplate: requirePermission("conversation:send")
    .input(z.object({
      conversationId: z.string(),
      template: z.string(),
      variables: z.array(z.string()).max(10).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const c = await ctx.db.conversation.findFirst({
        where: { id: input.conversationId, lead: leadScope(ctx.role, ctx.userId) },
        select: { id: true, channelId: true, lead: { select: { phone: true, language: true } } },
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });

      const creds = await getChannelCredentials(ctx.orgId, c.channelId);
      const { externalId } = await sendTemplate({
        phoneNumberId: creds.phoneNumberId,
        accessToken: creds.accessToken,
        to: c.lead.phone.replace("+", ""),
        template: input.template,
        language: c.lead.language ?? "en",
        variables: input.variables,
      });

      return ctx.db.message.create({
        data: {
          orgId: ctx.orgId,
          conversationId: c.id,
          direction: "OUTBOUND",
          author: "AGENT",
          authorId: ctx.userId,
          body: `[template: ${input.template}]`,
          templateName: input.template,
          externalId,
          status: "SENT",
        },
      });
    }),

  /**
   * Take over from the assistant. While handover is on, the assistant
   * sends nothing — it does not "assist", it stops. A bot talking over an
   * agent mid-negotiation is the fastest way to lose a deal.
   */
  takeover: requirePermission("conversation:takeover")
    .input(z.object({ conversationId: z.string(), on: z.boolean(), reason: z.string().max(200).optional() }))
    .mutation(async ({ ctx, input }) =>
      ctx.db.$transaction(async (tx) => {
        const row = await tx.conversation.update({
          where: { id: input.conversationId },
          data: {
            humanHandover: input.on,
            handoverAt: input.on ? new Date() : null,
            handoverReason: input.on ? input.reason ?? "Agent took over" : null,
          },
        });
        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: input.on ? "conversation.takeover" : "conversation.release",
          entity: "Conversation",
          entityId: row.id,
        });
        return row;
      })
    ),
});
