import type { LeadStatus, Prisma } from "@prisma/client";

/**
 * The stages a new brokerage starts with.
 *
 * **Nothing in this codebase created a PipelineStage.** The model was
 * read in three places — the board, the stage list, the move — and
 * written in none, which is the exact shape `reachability.py` exists to
 * catch: a complete, tested, documented feature with nothing that writes
 * its first row.
 *
 * The symptom was not an error. `pipeline.board` returned
 * `{ columns: [] }`, the screen rendered its empty state, and the empty
 * state said *"Leads appear here the moment an enquiry arrives"* — to a
 * brokerage that already had thirteen. Every lead sat with `stageId:
 * null`, invisible on the board, for as long as the brokerage existed.
 * Drag-and-drop, the conflict detection, the NUMERIC ordering, the
 * weighted column values: all of it correct, all of it unreachable.
 *
 * They are seeded at signup rather than lazily on first view, because a
 * lazy default writes rows from a read path — and two agents opening the
 * board at the same moment would race to create the same five stages,
 * which `@@unique([orgId, name])` would turn into an error on a screen
 * that was only being looked at.
 *
 * ## Why these five
 *
 * They map to `LeadStatus`, which is what reporting counts, so a
 * brokerage that renames "Qualifying" to "Chasing" keeps its numbers.
 * A stage is a label on a status, never a replacement for it.
 *
 * `staleAfterDays` is the number that makes the board tell you something
 * you did not already know. It is deliberately shortest where a lead is
 * hottest: a buyer who asked for a viewing three days ago and has not
 * had one is the most expensive silence in this business. Won and Lost
 * are `null` — a closed lead is not going cold, and flagging it would
 * train agents to ignore the flag.
 */
export const DEFAULT_STAGES: readonly Omit<
  Prisma.PipelineStageCreateManyInput,
  "orgId"
>[] = [
  { name: "New", position: 1000, maps: "NEW", staleAfterDays: 2 },
  { name: "Qualifying", position: 2000, maps: "QUALIFYING", staleAfterDays: 4 },
  { name: "Viewing booked", position: 3000, maps: "VIEWING_BOOKED", staleAfterDays: 3 },
  { name: "Negotiating", position: 4000, maps: "NEGOTIATING", staleAfterDays: 5 },
  { name: "Won", position: 5000, maps: "WON", staleAfterDays: null, isWon: true },
  { name: "Lost", position: 6000, maps: "LOST", staleAfterDays: null, isLost: true },
];

/**
 * Create them for one organisation.
 *
 * `skipDuplicates` so this is safe to run against a brokerage that
 * already has some — a backfill for the orgs created before this
 * existed must not fail on the first one it has already fixed.
 *
 * Takes a transaction client so it can be part of the signup
 * transaction: a brokerage that exists without a pipeline is the state
 * this whole file is here to make impossible, and it should not be
 * reachable by a crash halfway through.
 */
export async function seedStages(
  tx: Prisma.TransactionClient,
  orgId: string,
): Promise<number> {
  const { count } = await tx.pipelineStage.createMany({
    data: DEFAULT_STAGES.map((s) => ({ ...s, orgId })),
    skipDuplicates: true,
  });
  return count;
}

/**
 * Anything that can read this brokerage's stages.
 *
 * Structural, for the reason `AuditWriter` in `lib/audit.ts` is: the
 * three callers are a real `tx` inside `$transaction` (WhatsApp and
 * portal ingest) and `ctx.db`, the `$extends`-ed client `forOrg()`
 * returns (the intake path). The latter is not structurally a
 * `Prisma.TransactionClient`, so the narrower type does not compile.
 */

/**
 * The stage a newly created lead belongs in.
 *
 * **Every path that created a lead left `stageId` null.** WhatsApp
 * ingest, the portal feeds and the intake form all wrote a complete,
 * correct lead that the pipeline board could not show, because the board
 * selects by `stageId` and nothing ever set one. Seeding stages at
 * signup fixed the empty board; it did not fix this, and on its own it
 * would have produced six beautiful empty columns beside a Leads screen
 * full of people.
 *
 * Resolution is by `status` first — a lead arriving already qualified
 * belongs in Qualifying, not in New — and falls back to the first column
 * so a lead is never invisible merely because its status has no stage.
 * Returning `null` is reserved for a brokerage with no stages at all,
 * which after `seedStages` should not exist and is not worth failing an
 * inbound WhatsApp message over.
 *
 * One query per lead created, on paths that already run several. Worth
 * it: the alternative is a cached map that goes stale the moment an
 * owner renames a column.
 */
export type StageReader = {
  pipelineStage: {
    findMany(args: {
      where: { orgId: string; archived: boolean };
      select: { id: true; maps: true };
      orderBy: { position: "asc" };
    }): PromiseLike<{ id: string; maps: LeadStatus }[]>;
  };
};

export async function entryStageId(
  tx: StageReader,
  orgId: string,
  status: LeadStatus,
): Promise<string | null> {
  const stages = await tx.pipelineStage.findMany({
    where: { orgId, archived: false },
    select: { id: true, maps: true },
    orderBy: { position: "asc" },
  });
  if (stages.length === 0) return null;
  return (stages.find((s) => s.maps === status) ?? stages[0])?.id ?? null;
}
