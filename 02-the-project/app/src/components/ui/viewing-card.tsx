"use client";

// State, since the card now hosts the outcome form and the
// reschedule panel. Both callers are already client components, so
// this changes nothing at runtime — it states the requirement so a
// future server-rendered caller fails at the boundary rather than
// at the first click.

import { useState } from "react";

import { directions, dial, whatsapp, apart } from "@/lib/contact";
import { Outcome } from "@/app/(app)/viewings/outcome";
import { Reschedule } from "@/app/(app)/viewings/reschedule";
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
  onChanged,
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
    /** Whose diary and which property — `Reschedule` needs both. */
    agentId?: string | null;
    listingId?: string | null;
    status?: string;
  };
  /** Refetch the day after an outcome or a move. */
  onChanged?: () => void;
  /** The stop before this one, so we can warn about the drive. */
  previous?: { lat: number | null; lng: number | null; scheduledAt: Date } | null;
}) {
  const map = directions(viewing);
  const tel = dial(viewing.leadPhone);
  /**
   * WhatsApp, and it was the missing one.
   *
   * This is a WhatsApp-first CRM and there was **no WhatsApp link on
   * any screen in it**. `whatsapp()` had been written in `contact.ts`
   * from the start; the only thing that called it was `contact-row.tsx`,
   * which nothing imports and which therefore has never rendered. A
   * helper with one caller and that caller unmounted is the same as no
   * helper at all.
   *
   * It goes to the **buyer**, not to the brokerage. On this card the
   * agent is standing outside a building wanting to say "I'm here" to
   * the person meeting them, and the message is pre-filled with exactly
   * that — the thing an agent types twenty times a week.
   */
  const wa = whatsapp(
    viewing.leadPhone,
    `Hi${viewing.leadName ? ` ${viewing.leadName.split(" ")[0]}` : ""}, ` +
    `I'm at ${viewing.building ?? "the property"} for our ${time(viewing.scheduledAt)} viewing.`
  );
  const km = previous ? apart(previous, viewing) : null;
  const gapMins = previous
    ? Math.round((viewing.scheduledAt.getTime() - previous.scheduledAt.getTime()) / 60_000)
    : null;

  // Rough, and deliberately pessimistic — Dubai traffic is not 60km/h.
  const tight = km != null && gapMins != null && km / 25 * 60 > gapMins - 30;

  const [moving, setMoving] = useState(false);
  // A slot that has been and gone. The outcome question belongs here and
  // the offer to move it does not.
  const past = new Date(viewing.scheduledAt).getTime() < Date.now();

  return (
    <article className="border-b border-rule py-4">
      <div className="flex items-baseline gap-3">
        <span className="font-mono text-ui font-medium text-ink tabular">
          {time(viewing.scheduledAt)}
        </span>
        <span className="text-ui text-ink font-medium">
          {viewing.leadName ?? viewing.leadPhone ?? "Viewing"}
        </span>
        <span className="ms-auto font-mono text-label text-ink-3">
          {viewing.durationMins}m
        </span>
      </div>

      {/* Building first. It is the thing an agent reads while driving. */}
      {viewing.building && (
        <p className="text-ui text-ink mt-1.5 font-medium">{viewing.building}</p>
      )}
      {viewing.address && (
        <p className="text-sm text-ink-2">{viewing.address}</p>
      )}
      {viewing.reference && (
        <p className="font-mono text-label text-ink-3 mt-1">{viewing.reference}</p>
      )}

      {viewing.accessNote && (
        <p className="text-sm text-ink-2 mt-2 ps-3 border-s-2 border-rule">
          {viewing.accessNote}
        </p>
      )}

      {tight && (
        // Said before they set off rather than discovered on the road.
        <p role="alert" className="text-sm text-danger-deep mt-2 font-medium">
          {km}km from your last one with {gapMins} minutes between. That is tight.
        </p>
      )}

      {/* The row is capped, the buttons still stretch inside it.
          `flex-1` on both is right on the phone this card was designed
          for — an agent in a car park needs the whole width for a thumb
          — and at 1440 it made two 310px bars, one of them solid
          orange, twice per viewing. A max-width fixes the desktop
          without a breakpoint: on a 390px screen the column is narrower
          than the cap, so nothing about the phone layout changes. */}
      {/* Three actions, one of them the point of the product.
          The cap widened with the third button; on a phone the column
          is narrower than the cap, so the phone layout is unchanged. */}
      <div className="flex gap-2 mt-3 max-w-[560px]">
        {map && (
          <a
            href={map}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-h-11 rounded-full bg-accent text-on-accent font-medium text-ui grid place-items-center no-underline"
          >
            Directions
          </a>
        )}
        {wa && (
          <a
            href={wa}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-h-11 rounded-full border border-rule text-ink font-medium text-ui grid place-items-center no-underline"
            aria-label={`WhatsApp ${viewing.leadName ?? "the buyer"}`}
          >
            WhatsApp
          </a>
        )}
        {tel && (
          <a
            href={tel}
            className="flex-1 min-h-11 rounded-full border border-rule text-ink font-medium text-ui grid place-items-center no-underline"
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

      {/* Recording what happened, and moving it — both were written,
          both were finished, and neither had ever been on a screen.
          
          `outcome.tsx` says of itself: "Asked once, in three taps, and
          only after the slot has passed. An outcome form that appears
          before the viewing is a form nobody trusts." So the card
          follows its own instruction: past slots get the question,
          future ones get the offer to move it. */}
      {past ? (
        <div className="mt-4">
          <Outcome viewingId={viewing.id} onDone={onChanged} />
        </div>
      ) : (
        <div className="mt-3">
          <button
            onClick={() => setMoving((m) => !m)}
            aria-expanded={moving}
            className="min-h-11 px-2 t-label text-ink-3 hover:text-ink"
          >
            {moving ? "Never mind" : "Move it"}
          </button>
          {moving && viewing.agentId && (
            <div className="mt-2">
              <Reschedule
                viewingId={viewing.id}
                agentId={viewing.agentId}
                listingId={viewing.listingId ?? undefined}
                onDone={() => { setMoving(false); onChanged?.(); }}
              />
            </div>
          )}
        </div>
      )}
    </article>
  );
}

const time = (d: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai",
  }).format(d);
