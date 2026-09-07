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
  /**
   * The window the figures were actually counted over.
   *
   * Returned because it is not always the window that was asked for —
   * a manager's board stops `headStartHours` short — and a screen that
   * shows a date it did not measure is lying politely.
   */
  countedTo: Date;
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
  /**
   * Whether this viewer sees the whole team. The head start applies to
   * them and to nobody else.
   */
  seesEveryone: boolean;
}): Promise<Board> {
  const db = forOrg(args.orgId);

  const policy = await db.teamVisibility.findUnique({ where: { orgId: args.orgId } });
  const mode = (policy?.mode ?? "RANKED") as Board["mode"];
  const headStartHours = policy?.agentHeadStartHours ?? 24;

  /**
   * The head start is applied **here**, before anything is counted.
   *
   * It was applied at the call site, to the `to` field of the response,
   * *after* the board had already been built over the full window. So a
   * manager received today's real figures with a timestamp twenty-four
   * hours old — not a head start, a mislabelled one. The agent's
   * protection was a date on a screen.
   *
   * `managerWindow` was correct and exported and the one line that
   * mattered used it in the wrong place, which is worse than not having
   * it: the file reads as though the feature works.
   *
   * Owned by the module that owns the policy, so a second caller cannot
   * forget it. `reports.leaderboard` was the only one, and it did.
   */
  const countedTo = args.seesEveryone
    ? managerWindow(args.to, headStartHours)
    : args.to;

  const members = await db.membership.findMany({
    where: { role: "AGENT" },
    // Email too: `User.name` is optional, because a magic-link sign-in
    // creates a user from an address and nothing else. A leaderboard
    // row reading "null" is worse than one reading their email.
    select: { userId: true, user: { select: { name: true, email: true } } },
  });

  const rows: Row[] = [];
  for (const m of members) {
    const [viewings, won, replies] = await Promise.all([
      db.viewing.count({
        where: { agentId: m.userId, scheduledAt: { gte: args.from, lte: countedTo } },
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
          completedAt: { gte: args.from, lte: countedTo },
          listing: { viewings: { some: { agentId: m.userId } } },
        },
      }),
      db.message.findMany({
        where: {
          author: "AGENT", direction: "OUTBOUND",
          sentAt: { gte: args.from, lte: countedTo },
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
      name: m.user.name ?? m.user.email,
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
   * The mode governs what an **agent** sees of other agents. A manager
   * sees the team, delayed.
   *
   * This masked every row that was not the viewer's own — and a manager
   * is not any of the agents, so on the default mode a manager's board
   * was a list of hidden figures. Every row `-1`, every name "Agent 3".
   *
   * Which also made the head start pointless in the one place it was
   * applied: `reports.leaderboard` carefully computed a manager's window
   * and handed it to a board that was going to hide the numbers anyway.
   * Two mechanisms, both aimed at the same protection, and between them
   * they produced a screen with nothing on it.
   *
   * `seesEveryone` is the permission `lead:read:all`, which is manager
   * and above. The head start is what protects an agent from their
   * manager; the mode is what protects them from each other. Conflating
   * the two is what produced the empty board.
   */
  if (args.seesEveryone) return { mode, headStartHours, countedTo, rows };

  if (mode === "PRIVATE") return { mode, headStartHours, countedTo, rows: rows.filter((r) => r.isMe) };
  if (mode === "RANKED") {
    return {
      mode, headStartHours, countedTo,
      rows: rows.map((r) =>
        r.isMe
          ? r
          : { ...r, name: `Agent ${r.rank}`, viewingsBooked: -1, dealsWon: -1, medianFirstReplyMins: null }
      ),
    };
  }
  return { mode, headStartHours, countedTo, rows };
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
