import type { MigrationState } from "@prisma/client";

/**
 * Going live.
 *
 * The part of a migration that actually frightens people, and the part
 * most tooling ignores because it is not a data problem.
 *
 * A brokerage does not switch CRM on a Tuesday and forget the old one on
 * Wednesday. They run both for a fortnight, and during that fortnight
 * every lead arrives twice. If that is not planned for, the first week on
 * the new system is a week of duplicates, and they conclude it does not
 * work.
 */

export const STAGES: { state: MigrationState; title: string; exitCriteria: string[] }[] = [
  {
    state: "DRAFT",
    title: "Agreeing the mapping",
    exitCriteria: [
      "Every source field is mapped or explicitly dropped",
      "Every deal stage in the export maps to one of ours",
      "Every agent in the export is either on the team or marked as departed",
    ],
  },
  {
    state: "STAGED",
    title: "Loaded and counted",
    exitCriteria: [
      "Counts staged against counts claimed, with any difference explained",
      "Blockers resolved or the records deliberately excluded",
      "The source export archived somewhere we can get back to",
    ],
  },
  {
    state: "RECONCILED",
    title: "Checked by the brokerage",
    exitCriteria: [
      // The critical one. Nobody signs off on a total.
      "Someone at the brokerage has opened ten leads they know well and confirmed them",
      "Every open deal is at the stage they expect it to be",
      "Decisions on duplicates and unknown owners recorded, not assumed",
    ],
  },
  {
    state: "PARALLEL",
    title: "Both systems live",
    exitCriteria: [
      "Portals pointing here, and still pointing there",
      "Duplicate suppression on, keyed on the source identifier",
      "A fortnight with no missing leads",
    ],
  },
  { state: "COMPLETE", title: "Done", exitCriteria: [] },
];

/**
 * Parallel running.
 *
 * Both systems receive the same portal enquiries. The new one must not
 * treat an enquiry it has already seen in the old system as new, or the
 * pipeline fills with duplicates and the agent stops trusting the board.
 *
 * Keyed on the source's own identifier where there is one, and on phone
 * plus listing where there is not — which is not perfect, and is stated
 * as such rather than presented as certainty.
 */
export function duplicateKey(e: {
  sourceRef?: string | null;
  phone: string;
  listingRef?: string | null;
  at: Date;
}) {
  if (e.sourceRef) return `src:${e.sourceRef}`;
  // Same person, same property, same day. Good enough during a fortnight
  // of parallel running; not good enough to keep on afterwards.
  return `heur:${e.phone}:${e.listingRef ?? "-"}:${e.at.toISOString().slice(0, 10)}`;
}

/**
 * Rollback.
 *
 * The question every brokerage asks and most migrations answer with a
 * shrug. The answer here is boring on purpose: the source export is
 * archived, the old system was never switched off, and cutover does not
 * delete anything anywhere.
 *
 * Going back is therefore a decision rather than a recovery — which is
 * the whole point, because a rollback that needs a recovery is one nobody
 * will risk asking for.
 */
export const ROLLBACK = {
  sourceRemainsLive: true,
  exportArchived: true,
  nothingDeletedOnCutover: true,
  /** Past this, going back means losing work done here. Said up front. */
  pointOfNoReturnDays: 14,
  note:
    "Nothing is deleted at cutover and the old system stays running. Going back " +
    "in the first fortnight costs you whatever was done here, and nothing else.",
};

/**
 * What the tool does, and what it does not.
 *
 * Reapit quotes six weeks, with a named customer success manager and
 * regular check-ins. That is not tooling, it is people, and the honest
 * version of our story says so rather than implying a button does it.
 */
export const HONEST_SCOPE = {
  toolDoes: [
    "Reads the export and maps the obvious fields",
    "Finds the duplicates, dead numbers, unknown owners and unmapped stages",
    "Stages everything and counts it against what the source claimed",
    "Suppresses duplicates while both systems are live",
  ],
  personDoes: [
    "Decides the mappings the tool cannot",
    "Sits with the brokerage while they check ten leads they know",
    "Agrees what happens to the leads of agents who have left",
    "Is on the phone in the first week, when it matters",
  ],
  realistically: "Two to three weeks for a brokerage with a few thousand contacts, most of it waiting on decisions rather than on the import.",
};
