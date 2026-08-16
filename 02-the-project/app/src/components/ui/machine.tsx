import { cn } from "@/lib/cn";

/**
 * A panel holding words a machine wrote.
 *
 * ## Why this exists rather than a class on each panel
 *
 * The direction reserves Soft Orange (#FFF1E8) for "AI insight panels".
 * Taken as decoration that is a colour looking for somewhere to go —
 * `--accent-soft` was declared in `tokens.css` and read by nothing,
 * which is the exact shape CLAUDE.md warns about twice.
 *
 * Taken as a rule it is worth having, and the rule is this product's
 * rather than the palette's: **an agent must be able to tell, without
 * reading, which sentences came from the model and which came from the
 * database.** Everything the assistant produces is a claim about a
 * customer that the agent is about to repeat to them. `guardrails.ts`
 * is the last code between the model and a buyer's phone and it is not
 * perfect — the ungrounded-figure check catches a price the model
 * invented, and cannot catch a plausible one it attributed to the wrong
 * building. The person reading the screen is the check after that, and
 * they can only be it if they know which half to check.
 *
 * So the soft orange is not "AI is exciting". It is "this sentence has
 * not been verified by anything except a language model", and it stops
 * at the boundary of the generated text — the surrounding chrome, the
 * numbers pulled from Postgres and the agent's own input stay white.
 *
 * ## Why the label is not optional
 *
 * A colour alone fails for the ~8% of men with a colour vision
 * deficiency, and #FFF1E8 against #FFFFFF is a 1.11:1 difference — it
 * is a tint, not a signal, and on a bright phone outdoors it is nearly
 * nothing. The word carries the meaning and the tint reinforces it,
 * the same way round as the status dots in `tokens.css`.
 *
 * `tone="refused"` is the one variant that is not a claim: a refusal is
 * the guardrail working, and it takes the edge marker rather than the
 * tint so it does not read as another sentence to check.
 */
export function Machine({
  children,
  label = "Drafted",
  tone = "claim",
  className,
}: {
  children: React.ReactNode;
  /** What the machine did. Shown, not implied by colour alone. */
  label?: string;
  tone?: "claim" | "refused";
  className?: string;
}) {
  const refused = tone === "refused";
  return (
    <div
      data-machine={tone}
      className={cn(
        "rounded-xl p-4",
        refused
          ? "border-l-[3px] border-l-accent-edge bg-sunk"
          : "bg-accent-soft",
        className,
      )}
    >
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
        {label}
      </p>
      {children}
    </div>
  );
}
