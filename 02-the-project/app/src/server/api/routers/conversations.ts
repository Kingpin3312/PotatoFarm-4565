import { requestUpload, confirmUpload } from "@/server/lib/files/upload";
import { sendFile, libraryFor } from "@/server/lib/files/send";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { conversationScope, mineOnly, partyOf, partySelect, waNumber } from "@/server/lib/conversations/party";
import { audit } from "@/server/lib/audit";
import {
  messagingWindow, sendText, sendTemplate, WindowClosedError, WhatsAppError,
} from "@/server/lib/whatsapp";
import { getChannelCredentials } from "@/server/lib/secrets";

/**
 * The conversation, if the caller may act on it.
 *
 * `mute` and `takeover` updated by id alone, so any agent could silence
 * the assistant on — or take over — a colleague's buyer. Row-level
 * security keeps other brokerages out; this keeps one agent out of
 * another's threads.
 */
async function theirs(
  tx: { conversation: { findFirst(a: object): PromiseLike<unknown> } },
  ctx: { role: Parameters<typeof conversationScope>[0]; userId: string },
  id: string,
) {
  const c = await tx.conversation.findFirst({
    where: { id, ...conversationScope(ctx.role, ctx.userId) }, select: { id: true },
  });
  if (!c) throw new TRPCError({ code: "NOT_FOUND" });
}

/** The number to send to, or a refusal that says what to fix. */
function reachable(party: ReturnType<typeof partyOf>): string {
  const to = waNumber(party.phone);
  if (!to) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message: `${party.name ?? "They"} ha${party.name ? "s" : "ve"} no WhatsApp number we can read. Add it with the country code, e.g. +971 50 123 4567.`,
    });
  }
  return to;
}

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
      // `sendFile` finds the thread by id within the brokerage; whether
      // it is this agent's to send to is decided here.
      await theirs(ctx.db, ctx, input.conversationId);
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
        await theirs(tx, ctx, input.conversationId);
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

  /**
   * The inbox list, ordered by when the buyer last spoke.
   *
   * ## Not `updatedAt`, and the comment here used to say "most recent
   * activity" while sorting on something that is not activity
   *
   * `updatedAt` is Prisma's `@updatedAt`: it moves on **any** write to
   * the row. Muting the assistant on a thread, a handover flag, marking
   * one read, a lead being reassigned — each one lifts a conversation
   * to the top of the inbox as though the customer had just messaged.
   * An agent works this screen downwards, so the cost is not cosmetic:
   * the thing at the top is the thing they answer first, and an
   * administrative write can put a three-week-old dead thread there.
   *
   * It was invisible until the seed wrote real messages. Re-anchoring
   * eleven conversations touched eleven rows, and the whole inbox came
   * back stamped with the same minute — every thread claiming activity
   * that was a fixture script writing to the database.
   *
   * `lastInboundAt` is the honest signal for this screen, because this
   * screen is a queue of people waiting on a reply: it moves when, and
   * only when, somebody messages the brokerage. It is also the column
   * the 24-hour window is measured from, so the order now agrees with
   * the chip on each row instead of contradicting it.
   *
   * **The trade, stated:** a thread the agent has just answered does
   * not jump to the top, and a conversation an agent opened outbound
   * with no reply yet sorts last. Both are correct for a reply queue
   * and would be wrong for an activity feed. If this ever needs to be a
   * true "last message either way", that is a `lastMessageAt` column
   * maintained on send and on receive — not another sort on a timestamp
   * that means something else.
   *
   * `scripts/kyc-file.mjs` repeats this ordering so it can click the
   * row it then reads out of the database. It changes with this.
   */
  list: orgProcedure
    .input(z.object({
      filter: z.enum(["all", "unread", "handover", "mine"]).default("all"),
      cursor: z.string().nullish(),
      limit: z.number().min(1).max(50).default(25),
    }))
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db.conversation.findMany({
        // AND, not spread: the scope and "mine" are both an OR, and
        // spreading one over the other keeps only the second.
        where: {
          AND: [
            conversationScope(ctx.role, ctx.userId),
            ...(input.filter === "mine" ? [mineOnly(ctx.userId)] : []),
          ],
          ...(input.filter === "unread" && { unreadCount: { gt: 0 } }),
          ...(input.filter === "handover" && { humanHandover: true }),
        },
        take: input.limit + 1,
        cursor: input.cursor ? { id: input.cursor } : undefined,
        orderBy: [{ lastInboundAt: { sort: "desc", nulls: "last" } }, { id: "desc" }],
        select: {
          id: true, unreadCount: true, humanHandover: true,
          lastInboundAt: true, updatedAt: true,
          lead: {
            select: {
              id: true, name: true, phone: true, status: true, language: true,
              budgetMinFils: true, budgetMaxFils: true, intent: true,
              assignedTo: { select: { id: true, name: true } },
            },
          },
          vendor: { select: { id: true, name: true, phone: true } },
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
          party: partyOf(c),
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
        where: { id: input.conversationId, ...conversationScope(ctx.role, ctx.userId) },
        select: {
          id: true, humanHandover: true, handoverReason: true, lastInboundAt: true,
          // Whether the assistant is muted on this thread. The control
          // for it existed and was mounted nowhere, so the field it
          // reflects had never needed to be on the wire.
          assistantMuted: true,
          lead: { select: { id: true, name: true, phone: true, language: true, status: true } },
          vendor: partySelect.vendor,
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

      return { ...c, party: partyOf(c), messages: c.messages.reverse(), window: messagingWindow(c.lastInboundAt) };
    }),

  send: requirePermission("conversation:send")
    .input(z.object({
      conversationId: z.string(),
      body: z.string().trim().min(1).max(4096),
    }))
    .mutation(async ({ ctx, input }) => {
      const c = await ctx.db.conversation.findFirst({
        where: { id: input.conversationId, ...conversationScope(ctx.role, ctx.userId) },
        select: { id: true, lastInboundAt: true, channelId: true, ...partySelect },
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const to = reachable(partyOf(c));

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
          to,
          body: input.body,
        });

        // When we last spoke to them. Read by lead scoring and written by
        // nothing until now, so "days since we were last in touch" was
        // blank for every lead.
        await ctx.db.conversation.update({ where: { id: c.id }, data: { lastOutboundAt: new Date() } });
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
        where: { id: input.conversationId, ...conversationScope(ctx.role, ctx.userId) },
        select: { id: true, channelId: true, ...partySelect },
      });
      if (!c) throw new TRPCError({ code: "NOT_FOUND" });
      const party = partyOf(c);
      const to = reachable(party);

      const creds = await getChannelCredentials(ctx.orgId, c.channelId);
      const { externalId } = await sendTemplate({
        phoneNumberId: creds.phoneNumberId,
        accessToken: creds.accessToken,
        to,
        template: input.template,
        language: party.language,
        variables: input.variables,
      });

      await ctx.db.conversation.update({ where: { id: c.id }, data: { lastOutboundAt: new Date() } });
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
        await theirs(tx, ctx, input.conversationId);
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
