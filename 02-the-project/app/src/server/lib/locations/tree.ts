/**
 * The starting tree: Dubai, the communities this product already knows
 * by name (`lib/places.ts`), and the sub-communities and buildings the
 * demonstration brokerage's listings stand in.
 *
 * Names only. Property Finder's own ids come from its location list,
 * imported with `npm run locations:import`; none is written here,
 * because an id that is almost right files a property in the wrong
 * building and nothing errors.
 *
 * Names follow the way Property Finder writes them ("Dubai Hills
 * Estate", "Jumeirah Village Circle"), so an import finds these nodes
 * and adds its ids to them rather than creating a second Dubai Marina
 * beside the first.
 */
export type Node = { name: string; children?: Node[] };

export const STARTING_TREE: Node = {
  name: "Dubai",
  children: [
    { name: "Arabian Ranches", children: [{ name: "Palmera 3" }] },
    { name: "Arabian Ranches III", children: [{ name: "Joy" }] },
    { name: "Business Bay", children: [{ name: "The Sterling" }] },
    { name: "Dubai Creek Harbour", children: [{ name: "Creek Rise" }] },
    { name: "Dubai Hills Estate", children: [{ name: "Grove" }, { name: "Park Heights", children: [{ name: "Park Heights 2" }] }] },
    { name: "Dubai Marina", children: [{ name: "Marina Gate", children: [{ name: "Marina Gate 1" }, { name: "Marina Gate 2" }] }] },
    { name: "Dubai South", children: [{ name: "The Pulse" }] },
    { name: "Emirates Hills", children: [{ name: "Sector W" }] },
    { name: "Jumeirah Village Circle", children: [{ name: "Belgravia Heights" }, { name: "Bloom Towers" }] },
    { name: "Palm Jumeirah", children: [{ name: "Garden Homes" }] },
    { name: "Town Square", children: [{ name: "Zahra" }] },
    // Communities known to the product with nothing beneath them yet.
    // Property Finder's list fills them in on import.
    { name: "Al Barari" }, { name: "Al Furjan" }, { name: "Bluewaters Island" },
    { name: "City Walk" }, { name: "DAMAC Hills" }, { name: "DIFC" },
    { name: "Downtown Dubai" }, { name: "Emaar Beachfront" }, { name: "Jumeirah" },
    { name: "Jumeirah Beach Residence" }, { name: "Jumeirah Lake Towers" },
    { name: "Meydan City" }, { name: "Tilal Al Ghaf" },
  ],
};

/** The level a node sits at, by depth: city, community, sub-community, building. */
export const LEVEL_BY_DEPTH = ["CITY", "COMMUNITY", "SUB_COMMUNITY", "BUILDING"] as const;
