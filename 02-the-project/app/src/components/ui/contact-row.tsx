import { dial, whatsapp } from "@/lib/contact";
import { cn } from "@/lib/cn";

/**
 * Call, WhatsApp, message.
 *
 * The first agent test opened with "I can't call anyone", and it was
 * right — there was no dialable number anywhere in the product. An agent
 * calls all day: a buyer who ignores WhatsApp picks up, and a buyer ten
 * minutes late to a viewing gets a call, not a message.
 *
 * **Call is first and it is the widest.** Not because it is used most
 * but because it is used when something has gone wrong, which is when
 * hunting for a button is worst.
 */
export function ContactRow({
  phone,
  name,
  onMessage,
  compact,
  quiet,
}: {
  phone: string | null;
  name?: string | null;
  onMessage?: () => void;
  compact?: boolean;
  /**
   * Quiet, for a header rather than a card.
   *
   * The weighting below is right where it was designed to be used — a
   * viewing card, where Call is the widest because it is what an agent
   * reaches for when something has gone wrong. Dropped into the thread
   * header unchanged, that same weighting put a full-width orange
   * button next to the buyer's name and made it the loudest thing on
   * the screen the agent spends the day in.
   *
   * Same actions, same order, no fill.
   */
  quiet?: boolean;
}) {
  const tel = dial(phone);
  const wa = whatsapp(phone);

  if (!tel) {
    return (
      <p className="text-sm text-ink-3">
        No number on this lead — they came in without one.
      </p>
    );
  }

  const shell = quiet
    ? "min-h-9 rounded-full border border-rule px-4 text-ui text-ink"
    : "min-h-11 rounded-full text-ui font-medium";

  return (
    <div className={cn("flex gap-2", compact ? "flex-wrap" : "")}>
      <a
        href={tel}
        className={cn(
          "grid place-items-center no-underline", shell,
          quiet ? "" : "flex-[2] bg-accent text-on-accent"
        )}
        aria-label={name ? `Call ${name}` : "Call this lead"}
      >
        Call
      </a>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className={cn("grid place-items-center no-underline", shell, quiet ? "" : "flex-1 border border-rule font-medium")}
          // Opens the real WhatsApp thread. An agent who wants to send a
          // voice note will go there anyway; making it one tap from our
          // record keeps them starting here rather than in Contacts.
          aria-label="Open in WhatsApp"
        >
          WhatsApp
        </a>
      )}
      {onMessage && (
        <button
          onClick={onMessage}
          className={cn(shell, quiet ? "" : "flex-1 border border-rule font-medium")}
        >
          Reply here
        </button>
      )}
    </div>
  );
}
