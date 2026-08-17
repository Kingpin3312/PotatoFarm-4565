import { cn } from "@/lib/cn";
import type { Author, Direction, MessageStatus } from "@prisma/client";

/**
 * A message in the thread.
 *
 * Matches the website's conversation demo, with one deliberate
 * difference: the site shows bubbles because it is selling the feel of
 * WhatsApp. This is a transcript — ruled rows, labelled speakers,
 * monospaced metadata — because when somebody is arguing about what was
 * said, evidence beats atmosphere.
 *
 * Outbound is marked by a teal rule down the left rather than a filled
 * bubble. At forty messages, forty filled bubbles is a wall.
 */
const LABEL: Record<Author, string> = {
  LEAD: "Lead",
  ASSISTANT: "PotatoFarm.io",
  AGENT: "You",
  SYSTEM: "System",
};

export function Message({
  author, direction, body, sentAt, status, failure,
}: {
  author: Author;
  direction: Direction;
  body: string;
  sentAt: Date;
  status: MessageStatus;
  failure?: string | null;
}) {
  const outbound = direction === "OUTBOUND";

  return (
    <article
      className={cn(
        "px-6 py-4 border-b border-rule",
        outbound && "border-s-2 border-s-accent ps-[22px]",
        author === "SYSTEM" && "bg-sunk"
      )}
    >
      <div
        className={cn(
          "t-label mb-1.5",
          outbound ? "text-accent" : "text-ink-3"
        )}
      >
        {LABEL[author]}
      </div>

      <p className={cn("text-ui", author === "SYSTEM" ? "text-ink-2" : "text-ink")}>{body}</p>

      <div className="t-label text-ink-3 mt-2 tabular">
        {new Intl.DateTimeFormat("en-GB", {
          hour: "2-digit", minute: "2-digit", timeZone: "Asia/Dubai",
        }).format(sentAt)}
        {outbound && ` · ${status.toLowerCase()}`}
        {/* Meta's own wording, passed straight through. "Send failed"
            gives an agent nothing; "this number has blocked you" ends
            the guessing. */}
        {failure && <span className="text-danger"> · {failure}</span>}
      </div>
    </article>
  );
}
