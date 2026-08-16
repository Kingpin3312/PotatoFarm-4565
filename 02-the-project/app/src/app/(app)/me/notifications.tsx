"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * When not to buzz me.
 *
 * Nothing ever wrote a `NotificationPrefs` row, so `inQuietHours` was
 * evaluated against `quietFromMin: null` every time and returned false
 * every time. **Every notification of every kind pushed immediately, at
 * any hour, on any day** — including the ones `rules.ts` marks `digest`
 * and describes as "sent at a civilised hour".
 *
 * The `urgency` field is what gives it away. It is read in exactly one
 * place, to decide whether an urgent notification may override quiet
 * hours, so with quiet hours unsettable it changed nothing at all.
 *
 * ## Why this is on an agent's own screen
 *
 * The same argument as availability beside it. The only lever an agent
 * had was switching notifications off at the phone, and that takes every
 * alarm with it — the lead waiting mid-conversation, the deal slipping
 * its Form F date, the broker card lapsing in sixty days. A product that
 * makes "all of it" the only alternative to "at 3am" gets "all of it".
 */

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Minutes from midnight ⇄ the `<input type="time">` value. */
const toTime = (m: number | null) =>
  m === null ? "" : `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const fromTime = (v: string) => {
  if (!v) return null;
  const [h, m] = v.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export function MyNotifications() {
  const { data } = api.org.notifications.useQuery();
  const utils = api.useUtils();

  const [push, setPush] = useState(true);
  const [email, setEmail] = useState(false);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [daysOff, setDaysOff] = useState<number[]>([]);
  const [urgent, setUrgent] = useState(false);
  const [saved, setSaved] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  // Copied in once the query lands, so a half-finished edit survives a
  // background refetch.
  useEffect(() => {
    if (!data) return;
    setPush(data.push);
    setEmail(data.email);
    setFrom(toTime(data.quietFromMin));
    setTo(toTime(data.quietToMin));
    setDaysOff(data.daysOff);
    setUrgent(data.urgentOverridesQuiet);
  }, [data]);

  const save = api.org.setNotifications.useMutation({
    onSuccess: () => { setFailed(null); setSaved(true); void utils.org.notifications.invalidate(); },
    onError: (e) => { setSaved(false); setFailed(e.message); },
  });

  if (!data) return null;

  return (
    <section className="mt-12">
      <h2 className="font-sans font-semibold -tracking-[0.024em] text-[22px] text-accent-deep mb-1">
        When not to buzz you
      </h2>
      <p className="text-sm text-ink-2 max-w-[52ch]">
        Anything that arrives while you are off is held and sent once you are back, in one
        message rather than eleven. Nothing is lost.
      </p>
      {/* The state everybody was in until this existed, named rather
          than left to be inferred from empty fields. */}
      {!data.set && (
        <p className="text-sm text-ink mt-3 max-w-[52ch]">
          You have never set these, so nothing is held — every alert reaches you the moment
          it happens, at any hour.
        </p>
      )}

      {failed && (
        <p role="alert" className="mt-4 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">{failed}</p>
      )}
      {saved && !failed && (
        <p role="status" className="mt-4 px-3 py-2.5 border border-rule text-sm rounded-[3px] text-ink-2">
          Saved.
        </p>
      )}

      <form
        className="border-t border-ink mt-5 pt-5 flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          setSaved(false);
          setFailed(null);
          save.mutate({
            push, email,
            quietFromMin: fromTime(from),
            quietToMin: fromTime(to),
            daysOff,
            urgentOverridesQuiet: urgent,
          });
        }}
      >
        <label className="flex items-start gap-3">
          <input type="checkbox" checked={push} onChange={(e) => setPush(e.target.checked)}
                 className="size-5 mt-0.5 accent-[var(--accent)]" />
          <span>
            <span className="block text-[15px] text-ink">Push to my phone</span>
            <span className="block text-[13px] text-ink-3 max-w-[46ch] leading-snug">
              Off means nothing reaches you at all. Quiet hours are the gentler version.
            </span>
          </span>
        </label>

        <label className="flex items-start gap-3">
          <input type="checkbox" checked={email} onChange={(e) => setEmail(e.target.checked)}
                 className="size-5 mt-0.5 accent-[var(--accent)]" />
          <span className="block text-[15px] text-ink">Email me as well</span>
        </label>

        <div>
          <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
            Quiet hours
          </span>
          <div className="flex gap-3 flex-wrap items-end">
            <label className="flex flex-col gap-1">
              <span className="text-[13px] text-ink-3">From</span>
              <input type="time" value={from} onChange={(e) => setFrom(e.target.value)}
                     aria-label="Quiet hours start"
                     className="min-h-11 px-3 text-[16px] bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink" />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-[13px] text-ink-3">Until</span>
              <input type="time" value={to} onChange={(e) => setTo(e.target.value)}
                     aria-label="Quiet hours end"
                     className="min-h-11 px-3 text-[16px] bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink" />
            </label>
            {(from || to) && (
              <button type="button" onClick={() => { setFrom(""); setTo(""); }}
                      className="min-h-11 px-2 bg-transparent border-0 text-[14px] text-accent-deep underline cursor-pointer">
                Clear
              </button>
            )}
          </div>
          {/* The timezone is the brokerage's, not the phone's. Without
              saying so, 22:00 is ambiguous for anyone travelling. */}
          <p className="mt-2 text-[13px] text-ink-3 max-w-[46ch] leading-snug">
            {data.timezone.replace("_", " ")} time, so it does not move when you travel.
          </p>
        </div>

        <div>
          <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
            Days off
          </span>
          <div className="flex gap-2 flex-wrap">
            {DAYS.map((d, i) => (
              <button
                key={d}
                type="button"
                aria-pressed={daysOff.includes(i)}
                onClick={() => setDaysOff((o) => o.includes(i) ? o.filter((x) => x !== i) : [...o, i])}
                className={cn(
                  "min-h-11 px-3 rounded-lg border text-[15px]",
                  daysOff.includes(i)
                    ? "bg-accent text-on-accent border-accent-edge font-semibold"
                    : "border-rule text-ink",
                )}
              >
                {d}
              </button>
            ))}
          </div>
          {/* Friday and Saturday is the UAE weekend, and plenty of
              agents work it and take Monday instead. No default is
              offered for that reason. */}
          <p className="mt-2 text-[13px] text-ink-3 max-w-[46ch] leading-snug">
            Whichever days you actually take. Plenty of agents here work Saturday.
          </p>
        </div>

        <label className="flex items-start gap-3">
          <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)}
                 className="size-5 mt-0.5 accent-[var(--accent)]" />
          <span>
            <span className="block text-[15px] text-ink">Let urgent things through anyway</span>
            <span className="block text-[13px] text-ink-3 max-w-[46ch] leading-snug">
              A buyer waiting mid-conversation, or a viewing in an hour. Off by default,
              because a setting that wakes you should be one you chose.
            </span>
          </span>
        </label>

        <div className="flex">
          <Button type="submit" variant="primary" loading={save.isPending} className="ml-auto">
            Save
          </Button>
        </div>
      </form>
    </section>
  );
}
