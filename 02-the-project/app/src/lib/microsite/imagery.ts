import { DEMO_PHOTOS, type DemoRole } from "./demo-photos";

/**
 * Every picture on an agent's microsite, and where each one comes from.
 *
 * The page is image-led, so it must never show a grey box, a broken image
 * or an empty card — and it must never mislead. Those two rules decide the
 * order every slot is filled in:
 *
 * 1. **The real thing.** The agent's own portrait and cover, a property's
 *    own photographs, from the CRM.
 * 2. **Area photography, labelled as the area.** A picture of Dubai Marina
 *    beside the words "Dubai Marina" is true for any brokerage, so these
 *    come from the photo pack for everyone (`demo-photos.ts`).
 * 3. **Demo photography — demonstration brokerages only.** A portrait of a
 *    stranger shown as a real agent, or a stock flat shown as the property
 *    a client is about to enquire about, would be a misrepresentation (and
 *    for a Dubai advertisement, a regulatory one). So stand-in portraits
 *    and property photos appear only where `Organisation.demo` is set.
 * 4. **Drawn artwork.** A dusk skyline, a marina, a villa street, in the
 *    brand's own greys and pink (`components/microsite/art.tsx`). Always
 *    available, never pretends to be a photograph of anything.
 *
 * A picture is data, not markup: the slot decides the crop, so a real
 * photo replaces a stand-in without the layout changing.
 */
export type Scene = "towers" | "marina" | "palm" | "spire" | "villas" | "creek" | "interior";

export type Picture =
  | { kind: "photo"; src: string; srcSet?: string; alt: string; credit?: string; label?: string }
  | { kind: "art"; scene: Scene; seed: string; alt: string; label?: string };

type AreaKey =
  | "marina" | "palm" | "downtown" | "business-bay" | "creek" | "hills" | "ranches" | "jbr" | "jlt" | "jvc"
  | "emirates-hills" | "bluewaters" | "beachfront" | "difc" | "city-walk" | "jumeirah" | "damac" | "meydan"
  | "south" | "furjan" | "barari" | "tilal" | "town-square";

/**
 * A line for each community the place list knows, for the area tiles.
 * Descriptive, not promotional: what the place is, in a phrase a buyer
 * would recognise. A community not listed here gets its own name and no
 * line, never an invented one.
 */
const AREAS: { key: AreaKey; match: RegExp; scene: Scene; blurb: string }[] = [
  { key: "marina", match: /dubai marina/i, scene: "marina", blurb: "Waterfront towers around the marina promenade." },
  { key: "jbr", match: /jumeirah beach residence|\bjbr\b/i, scene: "marina", blurb: "Beachfront living on The Walk." },
  { key: "palm", match: /palm jumeirah/i, scene: "palm", blurb: "Island villas and seafront apartments." },
  { key: "downtown", match: /downtown/i, scene: "spire", blurb: "City living beside the Burj Khalifa." },
  { key: "business-bay", match: /business bay/i, scene: "towers", blurb: "Canal-side apartments in the business district." },
  { key: "difc", match: /\bdifc\b/i, scene: "towers", blurb: "The financial centre, its galleries and restaurants." },
  { key: "creek", match: /creek harbour/i, scene: "creek", blurb: "A new waterfront district on Dubai Creek." },
  { key: "hills", match: /dubai hills/i, scene: "villas", blurb: "Villas and apartments around the golf course and park." },
  { key: "ranches", match: /arabian ranches/i, scene: "villas", blurb: "Family villa communities in the desert green." },
  { key: "emirates-hills", match: /emirates hills/i, scene: "villas", blurb: "Mansions on the lakes and fairways." },
  { key: "jlt", match: /jumeirah lake towers|\bjlt\b/i, scene: "towers", blurb: "Lakeside towers between the marina and the city." },
  { key: "jvc", match: /jumeirah village circle|\bjvc\b/i, scene: "towers", blurb: "Townhouses and mid-rise apartments, well connected." },
  { key: "bluewaters", match: /bluewaters/i, scene: "marina", blurb: "Island residences beside Ain Dubai." },
  { key: "beachfront", match: /emaar beachfront/i, scene: "marina", blurb: "Private-beach towers between the marina and the Palm." },
  { key: "city-walk", match: /city walk/i, scene: "towers", blurb: "Low-rise streets of shops, cafés and apartments." },
  { key: "jumeirah", match: /^jumeirah$/i, scene: "villas", blurb: "Established beachside villas." },
  { key: "damac", match: /damac hills/i, scene: "villas", blurb: "A golf community of villas and townhouses." },
  { key: "meydan", match: /meydan/i, scene: "towers", blurb: "New homes around the racecourse and lagoons." },
  { key: "south", match: /dubai south/i, scene: "towers", blurb: "The new city by the airport and the Expo site." },
  { key: "furjan", match: /al furjan/i, scene: "villas", blurb: "Townhouses and villas near the metro." },
  { key: "barari", match: /al barari/i, scene: "villas", blurb: "Villas set in gardens and woodland." },
  { key: "tilal", match: /tilal al ghaf/i, scene: "villas", blurb: "Lagoon-side villas and townhouses." },
  { key: "town-square", match: /town square/i, scene: "villas", blurb: "Townhouses around a central park." },
];

export function areaInfo(name: string) {
  const a = AREAS.find((x) => x.match.test(name.trim()));
  return { key: a?.key ?? null, scene: a?.scene ?? ("towers" as Scene), blurb: a?.blurb ?? null };
}

/** A stable choice from a list, so the same page always draws the same picture. */
function pick<T>(list: readonly T[], seed: string): T | undefined {
  if (!list.length) return undefined;
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  return list[(h >>> 0) % list.length];
}

function fromPack(role: DemoRole, seed: string, alt: string, label?: string): Picture | null {
  const p = pick(DEMO_PHOTOS[role] ?? [], seed);
  if (!p) return null;
  return {
    kind: "photo", alt, label, credit: p.credit,
    src: `/microsite/demo/${p.file}-1280.webp`,
    srcSet: [640, 1280, 1920].map((w) => `/microsite/demo/${p.file}-${w}.webp ${w}w`).join(", "),
  };
}

/** A community's picture: its photograph from the pack, or its drawn scene. */
export function areaPicture(name: string): Picture {
  const info = areaInfo(name);
  return (info.key && fromPack(`area:${info.key}` as DemoRole, name, name, name))
    ?? { kind: "art", scene: info.scene, seed: name, alt: "", label: name };
}

/** The wide picture behind the agent's name. */
export function heroPicture(o: { cover: string | null; areas: string[]; demo: boolean; seed: string }): Picture {
  if (o.cover) return { kind: "photo", src: o.cover, alt: "" };
  if (o.demo) { const p = fromPack("hero", o.seed, ""); if (p) return p; }
  if (o.areas[0]) return areaPicture(o.areas[0]);
  return { kind: "art", scene: "spire", seed: o.seed, alt: "" };
}

/**
 * The agent's portrait, or null — and null is drawn as their monogram,
 * never as somebody else's face. Only a demonstration brokerage borrows a
 * stand-in portrait.
 */
export function portraitPicture(o: { photo: string | null; demo: boolean; seed: string; name: string }): Picture | null {
  if (o.photo) return { kind: "photo", src: o.photo, alt: o.name };
  if (o.demo) return fromPack("portrait", o.seed, `${o.name} (demonstration)`);
  return null;
}

/**
 * A property's picture: its own cover; for a demonstration brokerage a
 * stand-in by type; otherwise its community, labelled as the area so it
 * is never mistaken for the property.
 */
export function propertyPicture(o: { cover: string | null; title: string; community: string | null; propertyType: string | null; demo: boolean; seed: string }): Picture {
  if (o.cover) return { kind: "photo", src: o.cover, alt: o.title };
  if (o.demo) {
    const role: DemoRole = o.propertyType === "VILLA" || o.propertyType === "TOWNHOUSE" ? "property:villa"
      : o.propertyType === "PENTHOUSE" ? "property:penthouse" : "property:apartment";
    const p = fromPack(role, o.seed, o.title);
    if (p) return p;
  }
  if (o.community) return { ...areaPicture(o.community), alt: "", label: `${o.community} · area` };
  return { kind: "art", scene: o.propertyType === "VILLA" || o.propertyType === "TOWNHOUSE" ? "villas" : "interior", seed: o.seed, alt: "" };
}

/** A supporting picture for the introduction and the closing call to action. */
export function moodPicture(o: { demo: boolean; seed: string; areas: string[]; scene: Scene }): Picture {
  if (o.demo) { const p = fromPack("interior", o.seed, ""); if (p) return p; }
  if (o.areas[1] ?? o.areas[0]) return areaPicture((o.areas[1] ?? o.areas[0])!);
  return { kind: "art", scene: o.scene, seed: o.seed, alt: "" };
}
