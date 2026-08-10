"use client";

import { api } from "@/lib/trpc";
import { aed } from "@/lib/money";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";

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
  const from = new Date(Date.now() - 30 * 86_400_000);
  const to = new Date();

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
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-ink-3 block mb-3">
          Last 30 days
        </span>
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.75rem)] text-ink -tracking-[0.026em] leading-none">
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
          <h2 className="font-sans font-semibold text-[22px] text-ink -tracking-[0.02em] mt-12 mb-1">
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
          <h2 className="font-sans font-semibold text-[22px] text-ink -tracking-[0.02em] mt-12 mb-4">
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
                <span className="font-mono text-[13px] text-ink-3 tabular w-6">{r.rank}</span>
                <span className={cn("text-[15px]", r.isMe ? "text-ink font-semibold" : "text-ink-2")}>
                  {r.name}
                </span>
                <span className="ml-auto font-mono text-[13px] text-ink tabular">
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
    </div>
  );
}

function Fig({ label, value, highlight, muted }: {
  label: string; value: string; highlight?: boolean; muted?: boolean;
}) {
  return (
    <div className="px-5 py-5 border-r border-b border-rule last:border-r-0 max-[600px]:border-r-0">
      <div className={cn(
        "font-sans font-semibold text-[28px] leading-none -tracking-[0.02em] tabular",
        highlight ? "text-accent" : muted ? "text-ink-3" : "text-ink"
      )}>
        {value}
      </div>
      <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-ink-3 mt-2">{label}</div>
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
