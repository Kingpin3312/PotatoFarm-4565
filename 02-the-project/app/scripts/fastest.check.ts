/**
 * "Fastest to reply" routes to the agent who actually replies fastest.
 *
 * `FASTEST` is a selectable routing strategy — the schema calls it "by
 * median first-response time" and the settings screen offers it — and
 * **both** places that built a routing candidate hardcoded
 * `medianFirstResponseSeconds: null`. Every agent compared equal, so a
 * brokerage that chose performance-based routing silently got whoever
 * came first out of the query, every time, for ever.
 *
 * Nothing looked broken, and the reason is worth keeping: the strategy's
 * own explanation was honest — "no response history — next in rotation" —
 * so the screen told the truth while the setting did nothing. That is
 * CLAUDE.md's third diagnostic question, and the answer was the bad one:
 * *if this setting were ignored, what would look different?* Nothing.
 *
 * This builds two agents with deliberately different reply histories and
 * asks the strategy to choose. If it ever goes back to sorting by null,
 * the fast agent stops winning and this fails.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { assignmentFor } from "../src/server/lib/routing/apply";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "✓" : "✗"} ${label}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failures++;
}

const tag = randomUUID().slice(0, 8);
const ago = (mins: number) => new Date(Date.now() - mins * 60_000);

async function main() {
  console.log("\nFastest to reply means fastest to reply\n");

  const org = await db.organisation.create({
    data: { name: `Fastest ${tag}`, slug: `fastest-${tag}` },
    select: { id: true },
  });
  const channel = await db.channel.create({
    data: { orgId: org.id, type: "WHATSAPP", label: "n", identifier: `F-${tag}`, active: true },
    select: { id: true },
  });

  /** An agent, and a history of answering in `replyMins`. */
  async function agentWho(name: string, replyMins: number[]) {
    const u = await db.user.create({
      data: { email: `${name}-${tag}@example.invalid`, name },
      select: { id: true },
    });
    await db.membership.create({ data: { orgId: org.id, userId: u.id, role: "AGENT" } });

    for (const [i, mins] of replyMins.entries()) {
      const askedAt = ago(60 * 24 * (i + 2));
      const lead = await db.lead.create({
        data: { orgId: org.id, name: `${name} lead ${i}`,
                phone: `+9715${Math.floor(Math.random() * 90000000 + 10000000)}`,
                assignedToId: u.id },
        select: { id: true },
      });
      await db.enquiry.create({
        data: { orgId: org.id, leadId: lead.id, channelId: channel.id, createdAt: askedAt },
      });
      const convo = await db.conversation.create({
        data: { orgId: org.id, leadId: lead.id, channelId: channel.id },
        select: { id: true },
      });
      // The reply, `mins` after they asked.
      await db.message.create({
        data: {
          orgId: org.id, conversationId: convo.id, direction: "OUTBOUND",
          author: "AGENT", authorId: u.id, body: "On my way",
          sentAt: new Date(askedAt.getTime() + mins * 60_000),
        },
      });
    }
    return u.id;
  }

  const quick = await agentWho("Quick", [3, 4, 5]);
  const slow = await agentWho("Slow", [180, 240, 300]);

  await db.assignmentRule.create({
    data: { orgId: org.id, name: "Fastest wins", priority: 1000, active: true, strategy: "FASTEST" },
  });

  const first = await assignmentFor(db as never, { orgId: org.id, source: "REFERRAL" });
  ok("it picks the agent who actually replies fastest",
     first.userId === quick, first.userId === slow ? "picked the slow one" : String(first.userId));
  ok("and says so with the number it decided on",
     /median/.test(first.why), first.why);

  /**
   * The assertion that would have caught the original bug.
   *
   * With both medians null every candidate compares equal and the pool
   * order decides. "Quick" is created first, so a broken FASTEST would
   * still pick them — and pass. Reversing the pool is what tells the two
   * apart: sorted by data the fast agent wins from either end, sorted by
   * nothing the first one does.
   */
  await db.membership.update({
    where: { orgId_userId: { orgId: org.id, userId: quick } },
    data: { createdAt: new Date() },
  });
  const second = await assignmentFor(db as never, { orgId: org.id, source: "REFERRAL" });
  ok("and still picks them when they are last in the pool",
     second.userId === quick,
     "sorted by nothing, the first candidate always wins — this is the difference");

  await db.message.deleteMany({ where: { orgId: org.id } });
  await db.conversation.deleteMany({ where: { orgId: org.id } });
  await db.enquiry.deleteMany({ where: { orgId: org.id } });
  await db.leadOwnership.deleteMany({ where: { orgId: org.id } });
  await db.lead.deleteMany({ where: { orgId: org.id } });
  await db.assignmentRule.deleteMany({ where: { orgId: org.id } });
  await db.channel.deleteMany({ where: { orgId: org.id } });
  const mems = await db.membership.findMany({ where: { orgId: org.id }, select: { userId: true } });
  await db.membership.deleteMany({ where: { orgId: org.id } });
  await db.user.deleteMany({ where: { id: { in: mems.map((m) => m.userId) } } });
  await db.organisation.delete({ where: { id: org.id } });
  await db.$disconnect();

  console.log(failures === 0
    ? "\n  the setting changes the answer.\n"
    : `\n  ${failures} failure(s)\n`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => { console.error(e); await db.$disconnect(); process.exit(1); });
