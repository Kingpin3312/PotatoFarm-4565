/**
 * What the browser and HTTP checks leave in the demo brokerage when a run
 * dies before its own clean-up — and it does: a container restart, a
 * timeout, a failed assertion that exits early.
 *
 * Found preparing the first client demo: six "Test sales number"
 * channels, a "Meta check" and two "Website check" channels on the
 * Channels screen and in the "where they come from" report, and four
 * unassigned leads on the board — two of them named after the demo
 * owner. Every one of those is on a screen a prospect is shown.
 *
 * Used twice: at the start of each check that writes into the demo
 * brokerage (so one crashed run cannot accumulate), and by the seed (so
 * "reseed before a demo" always gives a clean one). Recognised by the
 * markers the checks themselves use, never by guessing at real data.
 */

/** Channel labels only checks create. */
export const CHECK_CHANNEL_LABELS = ["Test sales number", "Duplicate attempt", "Meta check", "Routing test", "Availability test"];
/** Label prefixes with a run stamp after them. */
export const CHECK_CHANNEL_PREFIXES = ["Website check "];
/** Email shapes only checks write: web.check.<stamp>@, alt.<stamp>@, meta.check.<stamp>@ on example.com. */
const CHECK_EMAIL = /^(web\.check|alt|meta\.check)\.\d+@example\.com$/;
/** Buyers made by "Try a live enquiry" in rehearsal (`demo.enquiry`). */
const LIVE_ENQUIRY_PHONE = /^\+9715000\d{5}$/;

export async function clearCheckDebris(db, orgId) {
  const channels = await db.channel.findMany({
    where: {
      orgId,
      OR: [
        { label: { in: CHECK_CHANNEL_LABELS } },
        ...CHECK_CHANNEL_PREFIXES.map((p) => ({ label: { startsWith: p } })),
      ],
    },
    select: { id: true },
  });
  const channelIds = channels.map((c) => c.id);

  const leads = (await db.lead.findMany({
    where: { orgId, email: { endsWith: "@example.com" } },
    select: { id: true, email: true },
  })).filter((l) => CHECK_EMAIL.test(l.email ?? "")).map((l) => l.id);

  // Rehearsal enquiries: pressed while practising the demo, and not
  // wanted at the top of the inbox when the real one starts.
  const rehearsed = (await db.lead.findMany({
    where: { orgId, phone: { startsWith: "+9715000" }, deletedAt: null },
    select: { id: true, phone: true, conversation: { select: { id: true } } },
  })).filter((l) => LIVE_ENQUIRY_PHONE.test(l.phone ?? ""));
  const rehearsedConvos = rehearsed.flatMap((l) => (l.conversation ? [l.conversation.id] : []));
  if (rehearsedConvos.length) {
    const where = { conversationId: { in: rehearsedConvos } };
    // "Reply ready" and "new lead" alerts point at these by id.
    const drafts = await db.replyDraft.findMany({ where, select: { id: true } });
    await db.notification.deleteMany({
      where: { orgId, subjectId: { in: [...drafts.map((d) => d.id), ...rehearsed.map((l) => l.id), ...rehearsedConvos] } },
    });
    await db.replyDraft.deleteMany({ where });
    await db.conversationCharge.deleteMany({ where });
    await db.assistantUsage.deleteMany({ where });
    await db.message.deleteMany({ where });
    await db.conversation.deleteMany({ where: { id: { in: rehearsedConvos } } });
  }
  if (rehearsed.length) {
    await db.lead.updateMany({ where: { id: { in: rehearsed.map((l) => l.id) } }, data: { deletedAt: new Date() } });
  }

  if (channelIds.length) {
    const convos = await db.conversation.findMany({ where: { channelId: { in: channelIds } }, select: { id: true } });
    const convoIds = convos.map((c) => c.id);
    if (convoIds.length) {
      await db.replyDraft.deleteMany({ where: { conversationId: { in: convoIds } } }).catch(() => {});
      await db.message.deleteMany({ where: { conversationId: { in: convoIds } } });
      await db.conversation.deleteMany({ where: { id: { in: convoIds } } });
    }
    await db.enquiry.deleteMany({ where: { channelId: { in: channelIds } } });
    await db.channel.deleteMany({ where: { id: { in: channelIds } } });
  }
  if (leads.length) {
    // Set aside rather than deleted: a lead has a long tail of rows, and
    // removed from every list is what matters on a screen.
    await db.lead.updateMany({ where: { id: { in: leads } }, data: { deletedAt: new Date() } });
  }
  return { channels: channelIds.length, leads: leads.length, rehearsed: rehearsed.length };
}
