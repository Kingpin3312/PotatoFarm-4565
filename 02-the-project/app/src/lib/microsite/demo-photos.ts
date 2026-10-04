/**
 * The photo pack: real photographs, licensed for this use, served from
 * `public/microsite/demo/<file>-<640|1280|1920>.webp`.
 *
 * Written by `npm run microsite:photos`, which downloads them from
 * Unsplash (free to use, including commercially, without attribution —
 * credits are kept anyway, in `public/microsite/demo/CREDITS.md`) and
 * makes the three widths. Empty until that has run: every slot then falls
 * back to drawn artwork, so the pages are complete either way.
 *
 * Which roles may appear where is `imagery.ts`'s decision: area photos
 * for every brokerage, labelled as the area; portraits, hero and property
 * stand-ins only for demonstration brokerages.
 */
export type DemoRole =
  | "hero" | "portrait" | "interior"
  | "property:apartment" | "property:villa" | "property:penthouse"
  | `area:${string}`;

export type DemoPhoto = { file: string; credit: string };

export const DEMO_PHOTOS: Partial<Record<DemoRole, DemoPhoto[]>> = {};
