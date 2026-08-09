import { cn } from "@/lib/cn";

/**
 * Pauses on hover AND on keyboard focus, and stops entirely under
 * reduced-motion. An unstoppable marquee is a WCAG 2.2.2 failure.
 */
export function Marquee({
  children,
  className,
  speed = 26,
}: {
  children: React.ReactNode;
  className?: string;
  speed?: number;
}) {
  return (
    <div
      tabIndex={0}
      className={cn(
        "group overflow-hidden focus-visible:outline-2 focus-visible:outline-signal",
        "[mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]",
        className
      )}
    >
      <div
        style={{ animationDuration: `${speed}s` }}
        className={cn(
          "flex w-max gap-11 animate-marquee",
          "group-hover:[animation-play-state:paused]",
          "group-focus-within:[animation-play-state:paused]",
          "motion-reduce:animate-none"
        )}
      >
        {children}
        {/* Duplicated for a seamless loop. aria-hidden so screen readers
            don't read every logo twice. */}
        <div aria-hidden className="flex gap-11">
          {children}
        </div>
      </div>
    </div>
  );
}
