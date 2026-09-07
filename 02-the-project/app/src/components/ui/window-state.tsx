import { cn } from "@/lib/cn";
import { Button } from "./button";

/**
 * The 24-hour window, made visible.
 *
 * The most important piece of state in the inbox and the one an agent
 * will otherwise not know exists. Outside the window a free-form message
 * is accepted by Meta and never delivered — so if this component is
 * wrong, the failure is silent and the agent thinks the lead ignored
 * them.
 *
 * **Open is a hollow dot, closed is a filled one.** It used to be cyan
 * versus red, and the palette is two colours now — so hue alone would
 * have made the two states identical, on the one component in the
 * product where being wrong is silent. Shape carries it instead, and
 * the words say it outright either way.
 */
export function WindowState({ open, hoursLeft }: { open: boolean; hoursLeft: number | null }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 t-label",
        open ? "text-ink-3" : "text-danger-deep"
      )}
    >
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          open ? "border border-ink-3" : "bg-accent",
        )}
      />
      {open ? `Reply window open · ${hoursLeft}h left` : "Reply window closed"}
    </div>
  );
}

/** Replaced, not disabled — a greyed box leaves somebody typing into nothing. */
/**
 * `WindowClosed` used to live here and has been folded into
 * `inbox/thread-controls.tsx`.
 *
 * It rendered the right explanation with two buttons wired to
 * `() => {}` — "Send follow-up template" and "Assign an agent to call",
 * neither of which did anything, on the one screen where a message that
 * cannot be delivered costs a deal. `ThreadControls` had the working
 * mutations all along and was imported by nothing, so the two halves of
 * a finished feature sat in separate files, one visible and inert, the
 * other functional and unreachable.
 *
 * The banner's markup went with it, so nothing was lost but the
 * duplication. `WindowState` below is unaffected and still the
 * open-window counterpart.
 */
