import { directions, dial, apart } from "@/lib/contact";
import { cn } from "@/lib/cn";

/**
 * A viewing an agent can actually get to.
 *
 * Before this, a viewing showed a time and a name. The agent test:
 * *"Where is it. How do I get there. Which building, which entrance,
 * which tower — Marina has six towers with almost the same name."*
 *
 * Everything here is what somebody would tell you on the phone and
 * nobody writes down.
 */
export function ViewingCard({
  viewing,
  previous,
}: {
  viewing: {
    id: string;
    scheduledAt: Date;
    durationMins: number;
    leadName: string | null;
    leadPhone: string | null;
    reference: string | null;
    address: string | null;
    building: string | null;
    lat: number | null;
    lng: number | null;
    accessNote: string | null;
  };
  /** The stop before this one, so we can warn about the drive. */
  previous?: { lat: number | null; lng: number | null; scheduledAt: Date } | null;
}) {
  const map = directions(viewing);
  const tel = dial(viewing.leadPhone);
  const km = previous ? apart(previous, viewing) : null;
  const gapMins = previous
    ? Math.round((viewing.scheduledAt.getTime() - previous.scheduledAt.getTime()) / 60_000)
    : null;

  // Rough, and deliberately pessimistic — Dubai traffic is not 60km/h.
  const tight = km != null && gapMins != null && km / 25 * 60 > gapMins - 30;

  return (
    <article className="border-b border-rule py-4">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-[15px] font-semibold text-ink tabular">
          {time(viewing.scheduledAt)}
        </span>
        <span className="text-[15px] text-ink font-semibold">
          {viewing.leadName ?? viewing.leadPhone ?? "Viewing"}
        </span>
        <span className="ml-auto font-mono text-[11px] text-ink-3">
          {viewing.durationMins}m
        </span>
      </div>

      {/* Building first. It is the thing an agent reads while driving. */}
      {viewing.building && (
        <p className="text-[15px] text-ink mt-1.5 font-medium">{viewing.building}</p>
      )}
      {viewing.address && (
        <p className="text-sm text-ink-2">{viewing.address}</p>
      )}
      {viewing.reference && (
        <p className="font-mono text-[11px] text-ink-3 mt-1">{viewing.reference}</p>
      )}

      {viewing.accessNote && (
        <p className="text-sm text-ink-2 mt-2 pl-3 border-l-2 border-rule">
          {viewing.accessNote}
        </p>
      )}

      {tight && (
        // Said before they set off rather than discovered on the road.
        <p role="alert" className="text-sm text-danger-deep mt-2 font-medium">
          {km}km from your last one with {gapMins} minutes between. That is tight.
        </p>
      )}

      <div className="flex gap-2 mt-3">
        {map && (
          <a
            href={map}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-h-11 rounded-full bg-accent text-on-accent font-semibold text-[15px] grid place-items-center no-underline"
          >
            Directions
          </a>
        )}
        {tel && (
          <a
            href={tel}
            className="flex-1 min-h-11 rounded-full border border-rule text-ink font-medium text-[15px] grid place-items-center no-underline"
            aria-label={`Call ${viewing.leadName ?? "the buyer"}`}
          >
            Call
          </a>
        )}
      </div>

      {!map && (
        <p className="text-sm text-ink-3 mt-2">
          No address on this one. Worth adding before you set off.
        </p>
      )}
    </article>
  );
}

const time = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai",
  }).format(d);
