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
}: {
  phone: string | null;
  name?: string | null;
  onMessage?: () => void;
  compact?: boolean;
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

  return (
    <div className={cn("flex gap-2", compact ? "flex-wrap" : "")}>
      <a
        href={tel}
        className="flex-[2] min-h-11 rounded-full bg-accent text-on-accent font-semibold text-[15px] grid place-items-center no-underline"
        aria-label={name ? `Call ${name}` : "Call this lead"}
      >
        Call
      </a>
      {wa && (
        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-1 min-h-11 rounded-full border border-rule text-ink font-medium text-[15px] grid place-items-center no-underline"
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
          className="flex-1 min-h-11 rounded-full border border-rule text-ink font-medium text-[15px]"
        >
          Reply here
        </button>
      )}
    </div>
  );
}
