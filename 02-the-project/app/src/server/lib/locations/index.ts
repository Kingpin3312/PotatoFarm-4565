import type { LocationLevel, Prisma, PrismaClient } from "@prisma/client";
import { crossTenant } from "@/server/db/client";
import { LEVEL_BY_DEPTH, type Node } from "./tree";

/**
 * The location tree: where a listing is, exactly.
 *
 * Property Finder files every listing under one node of its tree —
 * city, community, sub-community, building — and a listing whose place
 * it cannot match is rejected or shown in the wrong area. Free text
 * ("Marina Gate 1, Dubai Marina") cannot be matched reliably; a node
 * can. So a listing points at a node, and "exact" means the most
 * specific node the tree has there: a building, or a villa's
 * sub-community, never a community that has buildings under it.
 *
 * `crossTenant("global-key")`: the tree is shared reference data with
 * no `orgId`, the same for every brokerage, and nothing here reads a
 * brokerage's rows.
 */
export const SEPARATOR = " > ";

export type LocationHit = {
  id: string;
  path: string;
  level: LocationLevel;
  exact: boolean;
  pfLocationId: number | null;
};

/** A few words typed by an agent, matched against the whole path. */
export async function searchLocations(q: string, limit = 12): Promise<LocationHit[]> {
  const words = q.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!words.length) return [];
  const rows = await crossTenant("global-key").location.findMany({
    where: { AND: words.map((w) => ({ path: { contains: w, mode: "insensitive" as const } })) },
    select: { id: true, path: true, level: true, pfLocationId: true, _count: { select: { children: true } } },
    // Exact places first, then the shortest path: "Marina Gate 1" before
    // everything whose path merely mentions it.
    orderBy: [{ path: "asc" }],
    take: 60,
  });
  return rows
    .map((r) => ({ id: r.id, path: r.path, level: r.level, exact: r._count.children === 0, pfLocationId: r.pfLocationId }))
    .sort((a, b) => Number(b.exact) - Number(a.exact) || a.path.length - b.path.length || a.path.localeCompare(b.path))
    .slice(0, limit);
}

export type Resolved = {
  id: string;
  path: string;
  exact: boolean;
  pfLocationId: number | null;
  city: string | null;
  community: string | null;
  subCommunity: string | null;
  building: string | null;
};

/** A node and the names above it, by level. Null if there is no such node. */
export async function resolveLocation(id: string): Promise<Resolved | null> {
  const db = crossTenant("global-key");
  const node = await db.location.findUnique({
    where: { id },
    select: { id: true, path: true, pfLocationId: true, parentId: true, level: true, name: true, _count: { select: { children: true } } },
  });
  if (!node) return null;
  const named: Partial<Record<LocationLevel, string>> = { [node.level]: node.name };
  let parentId = node.parentId;
  for (let guard = 0; parentId && guard < 6; guard++) {
    const p = await db.location.findUnique({ where: { id: parentId }, select: { level: true, name: true, parentId: true } });
    if (!p) break;
    named[p.level] = p.name;
    parentId = p.parentId;
  }
  return {
    id: node.id, path: node.path, exact: node._count.children === 0, pfLocationId: node.pfLocationId,
    city: named.CITY ?? null, community: named.COMMUNITY ?? null,
    subCommunity: named.SUB_COMMUNITY ?? null, building: named.BUILDING ?? null,
  };
}

/**
 * What a listing's `community` and `building` columns hold, from its
 * node: the names search, matching and the buyer's page already read.
 * The building column takes the most specific name below the community,
 * so a villa in "Palmera 3" reads as that rather than as blank.
 */
export function listingNames(r: Resolved) {
  return { community: r.community, building: r.building ?? r.subCommunity };
}

type Writer = PrismaClient | Prisma.TransactionClient;

/**
 * Find or create each node down a path of names, returning the last.
 * Used by the seed and the Property Finder import; the application
 * role cannot write this table.
 */
export async function ensurePath(db: Writer, names: string[], pfLocationId?: number | null) {
  let parentId: string | null = null;
  let path = "";
  let node: { id: string } | null = null;
  for (const [depth, raw] of names.entries()) {
    const name = raw.trim();
    path = path ? `${path}${SEPARATOR}${name}` : name;
    const level = LEVEL_BY_DEPTH[Math.min(depth, LEVEL_BY_DEPTH.length - 1)]!;
    const last = depth === names.length - 1;
    const found: { id: string; pfLocationId: number | null } | null =
      await db.location.findFirst({ where: { parentId, name }, select: { id: true, pfLocationId: true } });
    if (found) {
      if (last && pfLocationId != null && found.pfLocationId !== pfLocationId) {
        await db.location.update({ where: { id: found.id }, data: { pfLocationId } });
      }
      node = found;
    } else {
      node = await db.location.create({
        data: { parentId, name, level, path, pfLocationId: last ? pfLocationId ?? null : null },
        select: { id: true },
      });
    }
    parentId = node.id;
  }
  return node;
}

/** Every path from the root to each node of a nested tree. */
export function pathsOf(node: Node, above: string[] = []): string[][] {
  const here = [...above, node.name];
  return [here, ...(node.children ?? []).flatMap((c) => pathsOf(c, here))];
}
