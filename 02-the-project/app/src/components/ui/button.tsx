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
 * **The label on the orange fill is ink, never white.** White on
 * `#E86A2C` measures 3.22:1 and is unreadable on a phone in sunlight;
 * ink is 5.57:1. That is why `--on-accent` exists rather than
 * hardcoding a colour here — and it is the rule that caught the danger
 * button below, whose hover had gone white against the same fill.
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
        // The everyday action, and the only filled orange on a screen.
        primary: "bg-accent border-accent text-on-accent hover:not-disabled:bg-accent-hover",
        secondary: "bg-transparent border-rule text-ink hover:not-disabled:border-ink-2",
        quiet: "bg-transparent border-transparent text-ink-2 hover:not-disabled:text-ink",
        /**
         * Destructive, and it is told apart by *shape*, not by hue.
         *
         * There is one orange now, so "the red one" is not available:
         * this is outlined where `primary` is filled, and the label says
         * the word. That is the same reasoning the state tokens in
         * `tokens.css` were built on — colour reinforces, words carry.
         *
         * The hover label is ink and not white. It was `text-white`,
         * which was correct when `--danger-deep` resolved to `#A0431B`
         * (white on it, 6.34:1). Collapsing the ramp to one orange moved
         * it to `#E86A2C` and took that to **3.22:1** — under the 4.5:1
         * floor — without changing this line, so the button kept a
         * contrast failure that no colour edit here could have shown.
         * A hover state is the easiest thing in a palette move to miss:
         * nothing renders it until somebody points at it.
         */
        danger: "bg-transparent border-danger-deep text-danger-deep hover:not-disabled:bg-danger-deep hover:not-disabled:text-on-accent",
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
