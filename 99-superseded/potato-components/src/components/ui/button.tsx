import { forwardRef } from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

const button = cva(
  // Base. min-h-11 is 44px — the touch target floor, applied everywhere
  // rather than remembered case by case.
  [
    "inline-flex items-center justify-center gap-2 min-h-11 rounded-full",
    "font-body font-medium whitespace-nowrap border border-transparent",
    "transition-[background-color,border-color,transform,box-shadow]",
    "duration-fast ease-out",
    "focus-visible:outline-2 focus-visible:outline-offset-[3px] focus-visible:outline-signal",
    "disabled:opacity-40 disabled:cursor-not-allowed disabled:transform-none",
  ],
  {
    variants: {
      variant: {
        primary:
          "bg-brass text-inverse hover:not-disabled:bg-brass-lift hover:not-disabled:-translate-y-px hover:not-disabled:shadow-brass",
        signal:
          "text-signal border-signal/35 hover:not-disabled:bg-signal/10",
        ghost:
          "text-primary border-border-strong hover:not-disabled:bg-surface-high hover:not-disabled:border-white/30",
        subtle:
          "text-secondary hover:not-disabled:text-primary hover:not-disabled:bg-surface-high",
      },
      size: {
        sm: "text-sm px-[18px] py-[9px] min-h-[38px]",
        md: "text-[0.9375rem] px-6 py-3",
        lg: "text-base px-[30px] py-[15px] min-h-[52px]",
      },
      full: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", full: false },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof button> {
  /** Render as the child element — for wrapping a Next <Link>. */
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, full, asChild, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(button({ variant, size, full }), className)}
        disabled={disabled || loading}
        aria-busy={loading || undefined}
        {...props}
      >
        {loading ? (
          <>
            <span
              aria-hidden
              className="size-[15px] rounded-full border-2 border-current border-r-transparent animate-spin"
            />
            <span className="sr-only">Working…</span>
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";
