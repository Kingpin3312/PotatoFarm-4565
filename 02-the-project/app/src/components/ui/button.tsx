import { forwardRef } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

/**
 * Buttons, matching the website.
 *
 * Two things carried over that are not style:
 *
 * **`min-h-11` is 44px** and it lives in the base class, not remembered
 * per instance. An agent using this in a car with one thumb is the
 * primary case, not an accessibility afterthought.
 *
 * **The label on teal is navy, never white.** White on `#0099B8`
 * measures 3.36:1 and is unreadable on a phone in sunlight. That is why
 * `--on-accent` exists rather than hardcoding a colour here.
 */
const button = cva(
  [
    "inline-flex items-center justify-center gap-2 min-h-11 rounded-full",
    // Medium, not semibold. The direction asks for "medium/semibold"
    // and "never excessively bold"; at 15px on a filled button, 600
    // is the weight that reads as shouting and 500 is the one every
    // Apple control uses.
    "font-sans font-medium whitespace-nowrap border",
    "transition-[background-color,border-color,color] duration-200 ease-out",
    "focus-visible:outline-none focus-visible:shadow-[var(--glow-focus)]",
    /**
     * Disabled is a different colour, not a faded one.
     *
     * `opacity-40` over a cream ground read as "not yet"; over white it
     * reads as a rendering fault — a pale peach button with a grey
     * ghost of a label. WCAG exempts a disabled control from contrast,
     * so this is not a violation, and "not a violation" is a low bar
     * for a product asking to be called premium.
     *
     * The neutral fill with a real border says unavailable and stays
     * legible, and it is the direction's own warm grey rather than a
     * new colour.
     */
    "disabled:cursor-not-allowed disabled:bg-sunk disabled:text-ink-3",
    "disabled:border-rule-strong disabled:shadow-none",
  ],
  {
    variants: {
      variant: {
        // Teal. The everyday action.
        primary: "bg-accent border-accent text-on-accent hover:not-disabled:bg-accent-hover",
        // Royal blue. Weightier — the one action on a page that matters most.
        surface: "bg-surface border-surface text-on-surface hover:not-disabled:brightness-110",
        secondary: "bg-transparent border-rule text-ink hover:not-disabled:border-ink-2",
        quiet: "bg-transparent border-transparent text-ink-2 hover:not-disabled:text-ink",
        // Destructive. Red now means only this, which was the point of
        // dropping it as the brand colour.
        danger: "bg-transparent border-danger-deep text-danger-deep hover:not-disabled:bg-danger-deep hover:not-disabled:text-white",
      },
      size: {
        // 44px even on the compact size. The visual weight comes from
        // type size and padding, not from a smaller hit area — a button
        // an agent has to aim at in a moving car is a button they miss.
        sm: "text-note px-4 py-2 min-h-11",
        md: "text-ui px-5 py-3",
      },
      full: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "secondary", size: "md", full: false },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, full, loading, children, disabled, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(button({ variant, size, full }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading ? (
        <>
          <span aria-hidden className="size-[14px] rounded-full border-2 border-current border-e-transparent animate-spin" />
          <span className="sr-only">Working…</span>
        </>
      ) : (
        children
      )}
    </button>
  )
);
Button.displayName = "Button";
