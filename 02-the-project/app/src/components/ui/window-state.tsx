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
export function WindowClosed({
  onTemplate, onAssign,
}: { onTemplate: () => void; onAssign: () => void }) {
  return (
    <div className="border border-rule border-l-2 border-l-danger-deep bg-sunk rounded-xl p-4">
      <p className="text-sm text-ink-2">
        <strong className="text-ink font-semibold">Quiet for more than 24 hours.</strong>{" "}
        WhatsApp only allows an approved template until they reply. This isn&rsquo;t us —
        it&rsquo;s Meta&rsquo;s rule for every business on the platform.
      </p>
      <div className="flex gap-2.5 mt-3.5 flex-wrap">
        <Button variant="primary" size="sm" onClick={onTemplate}>Send follow-up template</Button>
        <Button variant="secondary" size="sm" onClick={onAssign}>Assign an agent to call</Button>
      </div>
    </div>
  );
}
