import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * The type scale's own names, declared to tailwind-merge.
 *
 * ## The bug this exists to stop, which had already happened
 *
 * `twMerge` resolves conflicts by putting every class in a group and
 * keeping the last one. It knows Tailwind's built-in scale — `text-sm`,
 * `text-lg` — and it has a rule for everything else: an unrecognised
 * `text-<word>` is assumed to be a **colour**.
 *
 * So `cn("text-title", "text-ink-3")` put a size and a colour in the
 * same group, decided they conflicted, and returned only `text-ink-3`.
 * The size was deleted. On `/listings` and `/me` a 28px figure rendered
 * at the inherited 16px, and there was nothing to see in the source:
 * the class is right there in the file, the utility exists in the
 * stylesheet, and every check that reads source or reads CSS passes.
 * Only a browser reading computed `font-size` catches it — which is how
 * it was caught.
 *
 * Fourteen call sites were affected. It would have been silent.
 *
 * ## Keeping this list correct
 *
 * Every name here must exist as a `--text-*` entry in `globals.css`,
 * and every one there must be here. `browser:type` asserts each step
 * resolves to its intended pixel size *and* carries a line height,
 * which is what fails if the two lists drift — an unmapped step
 * computes to the inherited 16px with `normal` spacing, which looks
 * plausible and is not.
 */
const SIZES = [
  "display", "h1", "h2", "h3",
  "page", "title", "stat", "section",
  "sub", "body-lg", "ui", "control", "note", "label",
] as const;

const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: [...SIZES] }],
    },
  },
});

/** Merge Tailwind classes without letting duplicates fight each other. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
