import type { LeadStatus, Prisma } from "@prisma/client";

/**
 * Put a lead at a status, and on the board column that means it.
 *
 * Status and column are two fields that must agree, and a no-show set
 * the status back to QUALIFIED while leaving the card in "Viewing
 * booked" — the list and the board then said different things about the
 * same person. And confirming a viewing moved nothing at all, so a buyer
 * who had seen three properties was still "Qualifying" (found by the
 * journey check).
 *
 * `forwardOnly` for events that are progress: booking a viewing for
 * somebody already negotiating must not drag them back a column.
 */
const ORDER: LeadStatus[] = ["NEW", "QUALIFYING", "QUALIFIED", "VIEWING_BOOKED", "NEGOTIATING", "WON"];

export async function moveLeadTo(
  tx: Prisma.TransactionClient,
  leadId: string,
  status: LeadStatus,
  opts: { forwardOnly?: boolean } = {},
): Promise<boolean> {
  const lead = await tx.lead.findUnique({ where: { id: leadId }, select: { status: true } });
  if (!lead) return false;
  if (lead.status === status) return false;
  if (lead.status === "LOST" || lead.status === "WON") return false;
  if (opts.forwardOnly && ORDER.indexOf(lead.status) >= ORDER.indexOf(status)) return false;
  const stage = await tx.pipelineStage.findFirst({
    where: { maps: status, archived: false }, orderBy: { position: "asc" }, select: { id: true },
  });
  await tx.lead.update({
    where: { id: leadId },
    data: { status, stageEnteredAt: new Date(), ...(stage ? { stageId: stage.id } : {}) },
  });
  return true;
}
