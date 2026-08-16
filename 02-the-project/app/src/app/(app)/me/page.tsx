"use client";

import { api } from "@/lib/trpc";
import { aed } from "@/lib/money";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";
import { MyAvailability } from "./availability";
import { MyNotifications } from "./notifications";

/**
 * My numbers.
 *
 * The agent test in one line: *"if I can see my own numbers before my
 * manager does, it's a tool. If he sees them first, it's surveillance."*
 *
 * So this screen exists, it is the agent's, and it shows the current
 * window while a manager's view runs a day behind. Commission is at the
 * top because it is the first thing anybody looks at and every other
 * system buries it.
 */
export default function Me() {
  /**
   * Rounded to the day, and that is the difference between this screen
   * rendering and not.
   *
   * These were `new Date(Date.now() - 30 days)` and `new Date()`,
   * recomputed on every render. React Query keys by the serialised
   * input, so a timestamp that moves by a millisecond is a new key: the
   * query refetched, the refetch re-rendered, the re-render made new
   * dates, and round it went. `reports.leaderboard` fired in a loop and
   * `isLoading` never settled, so **the screen sat on its skeleton
   * forever** — "Loading your figures", permanently, for everybody.
   *
   * Nothing errored and nothing in the type-check could see it. Found
   * by watching the network while trying to add a section to the page.
   *
   * Midnight-to-midnight UTC also makes the window mean something
   * steadier than "the last 720 hours from whenever you opened it".
   */
  const to = new Date();
  to.setUTCHours(0, 0, 0, 0);
  const from = new Date(to.getTime() - 30 * 86_400_000);

  const { data: money, isLoading: l1, isError: e1, refetch: r1, error } =
    api.commission.mine.useQuery({});
  const { data: board, isLoading: l2 } =
    api.reports.leaderboard.useQuery({ from, to });

  if (e1) return <QueryError retry={() => void r1()} what="your figures" error={error} />;
  if (l1 || l2) return <Skeleton />;

  const me = board?.rows.find((r) => r.isMe);

  return (
    <div className="max-w-[760px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-2">
        <span className="t-label text-ink-3 block mb-3">
          Last 30 days
        </span>
        <h1 className="font-sans font-semibold text-page text-ink">
          Yours.
        </h1>
        {/* Stated plainly. An agent who suspects their manager is
            watching in real time behaves differently from one who knows
            exactly when the numbers are shared. */}
        <p className="text-sm text-ink-2 mt-3 max-w-[46ch]">
          You see these first. Your manager&rsquo;s view runs{" "}
          {board?.headStartHours ?? 24} hours behind.
        </p>
      </header>

      <div className="grid grid-cols-3 max-[600px]:grid-cols-1 border-t border-ink mt-8">
        <Fig label="Owed to you" value={money?.owed ?? "—"} highlight />
        <Fig label="Paid" value={money?.paid ?? "—"} />
        <Fig label="Forecast" value={money?.forecast ?? "—"} muted />
      </div>

      {me && (
        <>
          <h2 className="font-sans font-semibold text-section text-ink mt-12 mb-1">
            Where you are
          </h2>
          <p className="text-sm text-ink-3 max-w-[52ch]">
            Ranked on viewings booked, not on how fast you reply. Reply speed is a number
            worth improving and a terrible one to compete on.
          </p>

          <div className="grid grid-cols-3 max-[600px]:grid-cols-1 border-t border-ink mt-5">
            <Fig label={`of ${board!.rows.length} agents`} value={`#${me.rank}`} highlight />
            <Fig label="Viewings booked" value={String(me.viewingsBooked)} />
            <Fig
              label="Median first reply"
              value={me.medianFirstReplyMins != null ? `${me.medianFirstReplyMins}m` : "—"}
              muted
            />
          </div>
        </>
      )}

      {board && board.mode !== "PRIVATE" && (
        <>
          <h2 className="font-sans font-semibold text-section text-ink mt-12 mb-4">
            The board
          </h2>
          <div className="border-t border-ink">
            {board.rows.map((r) => (
              <div
                key={r.userId}
                className={cn(
                  "flex items-baseline gap-4 py-3.5 border-b border-rule",
                  r.isMe && "bg-sunk -mx-3 px-3"
                )}
              >
                <span className="font-mono text-note text-ink-3 tabular w-6">{r.rank}</span>
                <span className={cn("text-ui", r.isMe ? "text-ink font-medium" : "text-ink-2")}>
                  {r.name}
                </span>
                <span className="ml-auto font-mono text-note text-ink tabular">
                  {/* -1 means the brokerage chose not to share figures.
                      Shown as a dash rather than a zero, because a zero
                      is a claim and a dash is an absence. */}
                  {r.viewingsBooked >= 0 ? r.viewingsBooked : "—"}
                </span>
              </div>
            ))}
          </div>
          {board.mode === "RANKED" && (
            <p className="text-sm text-ink-3 mt-4 max-w-[48ch]">
              Positions are shared, figures aren&rsquo;t. Your brokerage can open this up in
              settings if everyone wants it.
            </p>
          )}
        </>
      )}

      {/* Below the figures, because it is a setting rather than a
          number — but on this screen rather than in Settings, because
          it is the agent's own and the agent is the one who knows they
          are away next week. */}
      <MyAvailability />
      <MyNotifications />
    </div>
  );
}

function Fig({ label, value, highlight, muted }: {
  label: string; value: string; highlight?: boolean; muted?: boolean;
}) {
  return (
    <div className="px-5 py-5 border-r border-b border-rule last:border-r-0 max-[600px]:border-r-0">
      <div className={cn(
        "font-sans font-semibold text-title leading-none tabular",
        highlight ? "text-accent" : muted ? "text-ink-3" : "text-ink"
      )}>
        {value}
      </div>
      <div className="t-label text-ink-3 mt-2">{label}</div>
    </div>
  );
}

function Skeleton() {
  return (
    <div className="max-w-[760px] mx-auto px-6 pt-10" aria-busy>
      <span className="sr-only">Loading your figures</span>
      <div className="h-10 w-40 bg-sunk rounded-sm" />
      <div className="grid grid-cols-3 gap-px mt-8">
        {[...Array(3)].map((_, i) => <div key={i} className="h-24 bg-sunk rounded-sm" />)}
      </div>
    </div>
  );
}
