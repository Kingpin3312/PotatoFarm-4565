import { z } from "zod";
import { TRPCError } from "@trpc/server";
import type { Prisma } from "@prisma/client";
import { router, requirePermission } from "../trpc";
import { audit } from "@/server/lib/audit";
import { aedToFils } from "@/lib/money";
import { entryStageId } from "@/server/lib/pipeline/defaults";
import { defaultExpiry } from "@/server/lib/matching/requirements";
import { FIELDS, planImport, tally, type Verdict } from "@/server/lib/import/plan";

/**
 * Leads from a spreadsheet, mapped, previewed, then written.
 *
 * The audit's A4: the only import in the product inspected a file and
 * recorded what was wrong with it, and nothing ever turned a row into a
 * lead — a brokerage arriving with three thousand contacts in another
 * CRM had to type them. This is the missing half:
 *
 *   1. The browser reads the file (`lib/csv.ts`) and guesses which
 *      column is which; the person corrects the guesses.
 *   2. `preview` returns a verdict per row — new, already on file, a
 *      repeat of an earlier line, or an error with its line number and
 *      reason — and writes nothing.
 *   3. `commit` writes the new ones (and, if asked, fills blanks on the
 *      ones already on file), tags every row with the batch so it can be
 *      found and undone from the leads list, and returns the same
 *      verdicts so the person can download what did not come in.
 *
 * Matching an existing lead is by normalised phone, then email — so
 * "050 100 0041" in the file and "+971501000041" on file are one person.
 */
const rows = z.array(z.record(z.string(), z.string().nullable()))
  .max(20_000, "That file has more than 20,000 rows. Split it and import each part.");
const mapping = z.object(Object.fromEntries(FIELDS.map((f) => [f, z.string().optional()])) as Record<(typeof FIELDS)[number], z.ZodOptional<z.ZodString>>)
  .refine((m) => !!m.phone, { message: "Choose the column that holds the phone number." });

type Ctx = { db: any; orgId: string };

async function lookups(ctx: Ctx, input: { rows: Record<string, string | null>[] }) {
  const [leads, members] = await Promise.all([
    ctx.db.lead.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true, phone: true, email: true },
    }) as Promise<{ id: string; name: string | null; phone: string; email: string | null }[]>,
    ctx.db.membership.findMany({ select: { user: { select: { id: true, email: true, name: true } } } }) as
      Promise<{ user: { id: string; email: string; name: string | null } }[]>,
  ]);
  const byPhone = new Map(leads.map((l) => [l.phone, { id: l.id, name: l.name }]));
  const byEmail = new Map(leads.filter((l) => l.email).map((l) => [l.email!.toLowerCase(), { id: l.id, name: l.name }]));
  const agents = new Map<string, string>();
  for (const m of members) {
    agents.set(m.user.email.toLowerCase(), m.user.id);
    if (m.user.name) agents.set(m.user.name.toLowerCase(), m.user.id);
  }
  return { byPhone, byEmail, agents, count: input.rows.length };
}

/** What the screen shows: the counts, and the rows worth reading. */
function report(v: Verdict[]) {
  return {
    counts: tally(v),
    // Every problem, and a sample of the rest. A 20,000-row preview does
    // not need to send 20,000 "fine" rows back to be believed.
    problems: v.filter((x) => x.status === "error" || x.status === "repeat" || x.warnings.length).slice(0, 2_000)
      .map((x) => ({
        line: x.line, status: x.status, warnings: x.warnings,
        reason: x.status === "error" ? x.reason : x.status === "repeat" ? `Same number as line ${x.of}.` : null,
        name: "lead" in x ? x.lead.name : null,
      })),
    sample: v.filter((x) => x.status === "new" || x.status === "exists").slice(0, 20).map((x) => ({
      line: x.line, status: x.status,
      name: "lead" in x ? x.lead.name : null, phone: "lead" in x ? x.lead.phone : null,
      existing: x.status === "exists" ? x.existing.name : null,
    })),
  };
}

export const importsRouter = router({
  previewLeads: requirePermission("lead:import")
    .input(z.object({ rows, mapping }))
    .mutation(async ({ ctx, input }) => {
      const l = await lookups(ctx, input);
      return report(planImport({ rows: input.rows, mapping: input.mapping, ...l, batchTag: null }));
    }),

  commitLeads: requirePermission("lead:import")
    .input(z.object({
      rows, mapping,
      /** Leads already on file: leave them, or fill what they are missing. */
      onExisting: z.enum(["skip", "fill"]).default("skip"),
      /** Everybody to one agent, when the file does not say. */
      agentId: z.string().nullable().default(null),
      label: z.string().trim().max(40).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const l = await lookups(ctx, input);
      if (input.agentId && ![...l.agents.values()].includes(input.agentId)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That agent isn't on your team." });
      }
      const batchTag = (input.label?.trim() || `import ${new Date().toISOString().slice(0, 10)}`).slice(0, 40);
      const verdicts = planImport({ rows: input.rows, mapping: input.mapping, ...l, batchTag });
      const fresh = verdicts.filter((v): v is Extract<Verdict, { status: "new" }> => v.status === "new");
      const known = verdicts.filter((v): v is Extract<Verdict, { status: "exists" }> => v.status === "exists");

      let created = 0, filled = 0;
      // Chunks, each its own transaction: one bad chunk must not hold a
      // connection for a whole book, and what did land is reported.
      for (let i = 0; i < fresh.length; i += 500) {
        const chunk = fresh.slice(i, i + 500);
        await ctx.db.$transaction(async (scoped) => {
          const tx = scoped as unknown as Prisma.TransactionClient;
          const stageId = await entryStageId(tx, ctx.orgId, "NEW");
          const now = new Date();
          const made = await tx.lead.createManyAndReturn({
            data: chunk.map(({ lead }) => {
              const agent = lead.agentId ?? input.agentId;
              return {
                orgId: ctx.orgId, phone: lead.phone, name: lead.name, email: lead.email,
                source: lead.source, notes: lead.notes, tags: lead.tags, status: "NEW" as const,
                ...(stageId ? { stageId } : {}),
                ...(lead.budgetMaxAed ? { budgetMaxFils: aedToFils(lead.budgetMaxAed) } : {}),
                ...(agent ? { assignedToId: agent, assignedAt: now } : {}),
              };
            }),
            // A number that arrived between preview and now is skipped,
            // not an error that loses the other 499.
            skipDuplicates: true,
            select: { id: true, phone: true, assignedToId: true },
          });
          created += made.length;
          const byPhone = new Map(chunk.map((c) => [c.lead.phone, c.lead]));
          const wants = made.flatMap((m) => {
            const p = byPhone.get(m.phone)!;
            return p.communities.length || p.bedrooms !== null || p.budgetMaxAed !== null ? [{ m, p }] : [];
          });
          if (wants.length) {
            await tx.requirement.createMany({
              data: wants.map(({ m, p }) => ({
                orgId: ctx.orgId, leadId: m.id, purpose: "SALE" as const,
                communities: p.communities, bedroomsMin: p.bedrooms,
                budgetMaxFils: p.budgetMaxAed ? aedToFils(p.budgetMaxAed) : null,
                // From the brokerage's own records: theirs, not a guess.
                source: "AGENT" as const, confirmedAt: now, expiresAt: defaultExpiry(null),
              })),
            });
          }
          const owned = made.filter((m) => m.assignedToId);
          if (owned.length) {
            await tx.leadOwnership.createMany({
              data: owned.map((m) => ({
                orgId: ctx.orgId, leadId: m.id, userId: m.assignedToId!, reason: "MANUAL" as const, actorId: ctx.userId,
              })),
            });
          }
        });
      }

      if (input.onExisting === "fill" && known.length) {
        // Blanks only, and the batch tag. Nothing an agent typed is
        // overwritten by a spreadsheet.
        for (let i = 0; i < known.length; i += 200) {
          const chunk = known.slice(i, i + 200);
          await ctx.db.$transaction(async (scoped) => {
            const tx = scoped as unknown as Prisma.TransactionClient;
            const current = await tx.lead.findMany({
              where: { id: { in: chunk.map((k) => k.existing.id) } },
              select: { id: true, name: true, email: true, notes: true, tags: true },
            });
            const byId = new Map(current.map((c) => [c.id, c]));
            for (const k of chunk) {
              const c = byId.get(k.existing.id);
              if (!c) continue;
              await tx.lead.update({
                where: { id: c.id },
                data: {
                  ...(c.name ? {} : k.lead.name ? { name: k.lead.name } : {}),
                  ...(c.email ? {} : k.lead.email ? { email: k.lead.email } : {}),
                  ...(c.notes ? {} : k.lead.notes ? { notes: k.lead.notes } : {}),
                  tags: [...new Set([...c.tags, ...k.lead.tags])],
                },
              });
              filled++;
            }
          });
        }
      }

      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId,
        action: "lead.import",
        entity: "Lead",
        entityId: `${created} leads`,
        after: { created, filled, tag: batchTag, rows: input.rows.length, ...tally(verdicts) },
      });
      return { created, filled, tag: batchTag, ...report(verdicts) };
    }),
});
