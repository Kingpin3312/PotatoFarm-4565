import { forOrg } from "@/server/db/client";

/**
 * The board.
 *
 * The first agent test asked for this and then explained why, which is
 * the part worth keeping:
 *
 *   *"I know that sounds like ego. It isn't — it's how I know whether to
 *   worry. Every agent I've worked with checks the board. Take it out and
 *   the tool feels like it belongs to management."*
 *
 * And separately:
 *
 *   *"If I can see my own numbers before my manager does, it's a tool.
 *   If he sees them first, it's surveillance."*
 *
 * Both shaped this file more than any product decision did.
 */

export type Row = {
  userId: string;
  name: string;
  isMe: boolean;
  rank: number;
  viewingsBooked: number;
  dealsWon: number;
  medianFirstReplyMins: number | null;
};

export type Board = {
  mode: "OPEN" | "RANKED" | "PRIVATE";
  headStartHours: number;
  rows: Row[];
};

/**
 * Ranked by **viewings booked**, not by response time.
 *
 * Response time is what we sell to the owner and it is the wrong thing
 * to rank agents on. Rank on it and within a fortnight everybody is
 * replying "ok" at eleven at night to move a number — which measures
 * nothing and costs the buyer a real answer.
 *
 * Viewings booked is closer to the job and much harder to fake. Deals
 * won is closer still and too slow to be a weekly signal.
 */
export async function leaderboard(args: {
  orgId: string;
  userId: string;
  from: Date;
  to: Date;
}): Promise<Board> {
  const db = forOrg(args.orgId);

  const policy = await db.teamVisibility.findUnique({ where: { orgId: args.orgId } });
  const mode = (policy?.mode ?? "RANKED") as Board["mode"];
  const headStartHours = policy?.agentHeadStartHours ?? 24;

  const members = await db.membership.findMany({
    where: { role: "AGENT" },
    select: { userId: true, user: { select: { name: true } } },
  });

  const rows: Row[] = [];
  for (const m of members) {
    const [viewings, won, replies] = await Promise.all([
      db.viewing.count({
        where: { agentId: m.userId, scheduledAt: { gte: args.from, lte: args.to } },
      }),
      /**
       * Deals that actually completed, not deals agreed.
       *
       * An agreed deal is a deal that can still collapse — and roughly
       * one in five here does, usually on a mortgage or an NOC. Counting
       * agreements would flatter everybody and reward the agent who
       * agrees fastest rather than the one who gets to a transfer.
       */
      db.deal.count({
        where: {
          stage: "COMPLETED",
          completedAt: { gte: args.from, lte: args.to },
          listing: { viewings: { some: { agentId: m.userId } } },
        },
      }),
      db.message.findMany({
        where: {
          author: "AGENT", direction: "OUTBOUND",
          sentAt: { gte: args.from, lte: args.to },
        },
        select: { sentAt: true, conversation: { select: { lastInboundAt: true } } },
        take: 500,
      }),
    ]);

    const gaps = replies
      .map((r) => r.conversation?.lastInboundAt
        ? (r.sentAt.getTime() - r.conversation.lastInboundAt.getTime()) / 60_000
        : null)
      .filter((n): n is number => n !== null && n >= 0)
      .sort((a, b) => a - b);

    rows.push({
      userId: m.userId,
      name: m.user.name,
      isMe: m.userId === args.userId,
      rank: 0,
      viewingsBooked: viewings,
      dealsWon: won,
      // Median, not mean. One agent away for a week drags a mean into
      // nonsense and nobody trusts the column again.
      medianFirstReplyMins: gaps.length
        ? Math.round(gaps[Math.floor(gaps.length / 2)]!)
        : null,
    });
  }

  rows.sort((a, b) => b.viewingsBooked - a.viewingsBooked);
  rows.forEach((r, i) => { r.rank = i + 1; });

  /**
   * `RANKED` is the default and the interesting one: your own row with
   * real figures, everyone else's position without theirs. Enough to
   * know whether to worry, not enough to humiliate anybody in a Monday
   * meeting.
   */
  if (mode === "PRIVATE") return { mode, headStartHours, rows: rows.filter((r) => r.isMe) };
  if (mode === "RANKED") {
    return {
      mode, headStartHours,
      rows: rows.map((r) =>
        r.isMe
          ? r
          : { ...r, name: `Agent ${r.rank}`, viewingsBooked: -1, dealsWon: -1, medianFirstReplyMins: null }
      ),
    };
  }
  return { mode, headStartHours, rows };
}

/**
 * The head start.
 *
 * A manager asking for the team's numbers gets everything up to
 * `headStartHours` ago. The agent sees the current window first.
 *
 * Twenty-four hours by default — enough for somebody to notice a bad day
 * and raise it themselves, which is the entire point. **A number your
 * manager raises first is a number you learn to manage rather than
 * improve.**
 */
export function managerWindow(to: Date, headStartHours: number) {
  return new Date(to.getTime() - headStartHours * 3_600_000);
}
