import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, requirePermission } from "../trpc";
import { ingest } from "@/server/lib/ingest";

/**
 * A live enquiry, for a demonstration brokerage only.
 *
 * A demo without a real WhatsApp number shows a finished inbox, and a
 * finished inbox is a screenshot. What sells the product is the moment a
 * buyer writes and the room watches the lead appear, get routed, and a
 * reply get drafted. This produces that moment honestly: it builds the
 * payload Meta would send and hands it to the same `ingest` the webhook
 * calls — routing, the lead, the board, the draft, the notification, all
 * the real code. Nothing here is a mock of the product.
 *
 * Refused for any brokerage without `demo` set, and `demo` is not
 * settable from the app (the seed sets it). A real brokerage can never
 * invent a buyer.
 */

/** None of these share a name with anyone the seed puts in the demo — a
 *  second "James Whitfield" in the list reads as a bug, not a buyer. */
const PEOPLE = [
  { name: "Thomas Hartley", lang: "en", body: "Hi, saw your listing for the 2 bed in Dubai Marina on Bayut. Is it still available? Looking to move in next month, budget up to 180k a year." },
  { name: "Kavya Iyer", lang: "en", body: "Hello, we're a family of four relocating from Mumbai in January. Interested in a 3 bed villa in Arabian Ranches or Springs to buy, around 4.5M. Can we view this weekend?" },
  { name: "Olivia Brandt", lang: "en", body: "Hi there — is the Downtown apartment with the Burj view still on the market? Cash buyer, can move quickly." },
  { name: "خالد المنصوري", lang: "ar", body: "مرحبا، أبحث عن شقة غرفتين في دبي هيلز للشراء، الميزانية حوالي مليونين ونصف. هل يوجد شيء متاح؟" },
  { name: "Mohammed Al Hashimi", lang: "en", body: "Salam, I'm looking for an off-plan 1 bed in JVC as an investment, around 900k. What's the payment plan?" },
  { name: "سارة الكعبي", lang: "ar", body: "السلام عليكم، هل الفيلا في المرابع العربية متاحة للإيجار؟ نحتاجها من الشهر القادم." },
] as const;

export const demoRouter = router({
  enquiry: requirePermission("conversation:send")
    .input(z.object({
      // The presenter can type their own, in the room, in either language.
      name: z.string().trim().min(1).max(60).optional(),
      body: z.string().trim().min(1).max(1000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const org = await ctx.db.organisation.findUnique({
        where: { id: ctx.orgId }, select: { demo: true },
      });
      if (!org?.demo) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Live enquiries are for a demonstration brokerage only." });
      }
      const channel = await ctx.db.channel.findFirst({
        where: { type: "WHATSAPP", active: true },
        select: { identifier: true }, orderBy: { createdAt: "asc" },
      });
      if (!channel) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "This brokerage has no WhatsApp number to receive on. Add one in Settings → Channels." });
      }

      // In turn rather than at random: at random, the second press in a
      // meeting was the first buyer again as often as not.
      const before = await ctx.db.lead.count({ where: { phone: { startsWith: "+9715000" }, deletedAt: null } });
      const who = PEOPLE[before % PEOPLE.length]!;
      const name = input.name ?? who.name;
      const body = input.body ?? who.body;
      // A number in a range reserved for this: +971 50 0 followed by
      // digits, never delivered to (`DEMO_TOKEN`), and new each time so
      // every press is a new buyer rather than a second message.
      const from = `9715000${String(Math.floor(Math.random() * 1e5)).padStart(5, "0")}`;
      const externalId = `demo.inbound.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}`;

      await ingest({
        entry: [{ changes: [{ value: {
          metadata: { phone_number_id: channel.identifier },
          contacts: [{ profile: { name }, wa_id: from }],
          messages: [{ id: externalId, from, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body } }],
        } }] }],
      });

      const msg = await ctx.db.message.findUnique({
        where: { externalId }, select: { conversationId: true },
      });
      if (!msg) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "The enquiry was not recorded." });
      const [draft, replied] = await Promise.all([
        ctx.db.replyDraft.findFirst({
          where: { conversationId: msg.conversationId, state: "OPEN" }, select: { id: true },
        }),
        ctx.db.message.findFirst({
          where: { conversationId: msg.conversationId, direction: "OUTBOUND", author: "ASSISTANT" },
          select: { id: true },
        }),
      ]);
      return {
        conversationId: msg.conversationId,
        drafted: Boolean(draft),
        replied: Boolean(replied),
        // Said on screen rather than left as a missing reply.
        why: draft || replied ? null : process.env.ANTHROPIC_API_KEY?.trim()
          ? "The assistant handed this one to a person rather than reply."
          : "No reply was written: this environment has no ANTHROPIC_API_KEY.",
      };
    }),
});
