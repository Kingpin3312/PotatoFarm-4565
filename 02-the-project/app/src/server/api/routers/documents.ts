import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, requirePermission } from "../trpc";
import { can } from "@/server/auth/rbac";
import { audit } from "@/server/lib/audit";
import { recordDocument, typesFor, expiryRule } from "@/server/lib/documents/record";
import { state, RULES } from "@/server/lib/documents/expiry";
import type { DocumentOwner, DocumentType } from "@prisma/client";

/**
 * The document register.
 *
 * `documents.expiry` has been sweeping this table nightly since the
 * first schema, and nothing in the codebase could put a row in it. The
 * job ran, found nothing, and reported success — which is the exact
 * silent failure the module was written to prevent, occurring in the
 * module itself.
 */

const OWNERS = ["LEAD", "LISTING", "DEAL", "USER", "ORGANISATION"] as const;

const TYPES = [
  "PASSPORT", "EMIRATES_ID", "VISA", "TRADE_LICENCE",
  "TITLE_DEED", "NOC", "SERVICE_CHARGE_CLEARANCE", "EJARI", "TENANCY_CONTRACT",
  "FORM_F", "SPA", "FLOOR_PLAN",
  "RERA_BROKER_CARD", "BROKERAGE_LICENCE", "TRAKHEESI_PERMIT", "OTHER",
] as const;

/** Sentence case from a SCREAMING_ENUM, so the UI holds no second copy. */
function label(type: DocumentType) {
  const words = type.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export const documentsRouter = router({
  /**
   * Everything live, worst first.
   *
   * "Worst" is expired before expiring before valid, and within each,
   * soonest first. Sorting by date alone puts a passport that lapsed
   * yesterday above a broker card that lapses tomorrow, and only one of
   * those stops a transaction.
   */
  register: requirePermission("document:read")
    .input(z.object({ filter: z.enum(["all", "expiring"]).default("all") }).default({ filter: "all" }))
    .query(async ({ ctx, input }) => {
      const docs = await ctx.db.document.findMany({
        where: { supersededById: null },
        orderBy: { createdAt: "desc" },
      });

      // Owner names resolved in three queries rather than one per row.
      // The register is small, but it is rendered as a list of people and
      // properties and an id in that list is unreadable.
      const ids = (t: DocumentOwner) => docs.filter((d) => d.ownerType === t).map((d) => d.ownerId);
      const [users, listings, leads] = await Promise.all([
        ctx.db.user.findMany({ where: { id: { in: ids("USER") } }, select: { id: true, name: true, email: true } }),
        ctx.db.listing.findMany({ where: { id: { in: ids("LISTING") } }, select: { id: true, reference: true, title: true } }),
        ctx.db.lead.findMany({ where: { id: { in: ids("LEAD") } }, select: { id: true, name: true } }),
      ]);

      const named = new Map<string, string>();
      for (const u of users) named.set(u.id, u.name ?? u.email ?? "an agent");
      for (const l of listings) named.set(l.id, l.reference ?? l.title ?? "a property");
      for (const l of leads) named.set(l.id, l.name ?? "a client");

      const now = new Date();
      const rank = { expired: 0, expiring: 1, valid: 2 } as const;

      const rows = docs
        .map((d) => {
          const s = state(d.type, d.expiresAt, now);
          return {
            id: d.id,
            type: d.type,
            typeLabel: label(d.type),
            reference: d.reference,
            fileName: d.fileName,
            hasFile: d.storageRef !== null,
            ownerType: d.ownerType,
            ownerId: d.ownerId,
            // ORGANISATION is the brokerage itself, which has exactly one
            // row and no id worth showing.
            ownerName: d.ownerType === "ORGANISATION" ? ctx.orgName : named.get(d.ownerId) ?? "—",
            expiresAt: d.expiresAt,
            verifiedAt: d.verifiedAt,
            state: s.state,
            daysLeft: s.daysLeft,
            blocking: s.rule?.blocking ?? false,
            consequence: s.rule?.consequence ?? null,
          };
        })
        .sort((a, b) => {
          if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
          return (a.expiresAt?.getTime() ?? Infinity) - (b.expiresAt?.getTime() ?? Infinity);
        });

      const attention = rows.filter((r) => r.state !== "valid");

      return {
        rows: input.filter === "expiring" ? attention : rows,
        // Both counts always, so the screen can offer the other filter
        // without a second query and without claiming a total it filtered.
        total: rows.length,
        needingAttention: attention.length,
        blockingCount: attention.filter((r) => r.blocking).length,
        canWrite: can(ctx.role, "document:write"),
      };
    }),

  /**
   * What can be recorded, and against what.
   *
   * Served rather than hard-coded in the screen so the type lists and
   * the lead times stay in `expiry.ts`. A copy in the UI is a copy that
   * disagrees with the job the first time a rule changes.
   */
  options: requirePermission("document:read").query(async ({ ctx }) => {
    const [people, listings] = await Promise.all([
      ctx.db.membership.findMany({
        select: { userId: true, user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
      ctx.db.listing.findMany({
        where: { deletedAt: null },
        select: { id: true, reference: true, title: true },
        orderBy: { createdAt: "desc" },
        take: 200,
      }),
    ]);

    return {
      owners: OWNERS.map((o) => ({ value: o, types: typesFor(o).map((t) => ({ value: t, label: label(t) })) })),
      rules: RULES.map((r) => ({
        type: r.type, warnDays: r.warnDays, blocking: r.blocking,
        notify: r.notify, consequence: r.consequence,
      })),
      people: people.map((m) => ({ id: m.userId, name: m.user.name ?? m.user.email ?? "an agent" })),
      listings: listings.map((l) => ({ id: l.id, name: l.reference ?? l.title ?? l.id })),
      orgName: ctx.orgName,
      me: ctx.userId,
    };
  }),

  /**
   * Record one.
   *
   * Gated on `document:read` and not `document:write`, with the stricter
   * check done inside — because an agent must be able to record **their
   * own** broker card. Requiring a manager to enter it is how it stops
   * being entered, and then it lapses mid-deal, which is the single
   * failure this whole module exists to prevent.
   */
  record: requirePermission("document:read")
    .input(z.object({
      ownerType: z.enum(OWNERS),
      /** Ignored for ORGANISATION, which is the brokerage itself. */
      ownerId: z.string().optional(),
      type: z.enum(TYPES),
      reference: z.string().max(80).optional(),
      issuedAt: z.date().nullish(),
      expiresAt: z.date().nullish(),
    }))
    .mutation(async ({ ctx, input }) => {
      const ownerId = input.ownerType === "ORGANISATION" ? ctx.orgId : input.ownerId;
      if (!ownerId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Say who or what this document belongs to." });
      }

      const ownDocument = input.ownerType === "USER" && ownerId === ctx.userId;
      if (!ownDocument && !can(ctx.role, "document:write")) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can record your own documents. A manager records everyone else's.",
        });
      }

      /**
       * An expiring type with no date is refused, not accepted quietly.
       *
       * The register's whole job is the date. A broker card filed with
       * no expiry sits in the list looking handled and is invisible to
       * the sweep for ever — worse than not filing it, because somebody
       * has now ticked it off.
       */
      const rule = expiryRule(input.type);
      if (rule && !input.expiresAt) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `A ${label(input.type).toLowerCase()} expires — record the date, or the register cannot warn anyone.`,
        });
      }

      // Guards against a typo putting a card 200 years out, which is
      // silently never warned about.
      if (input.expiresAt && input.expiresAt.getTime() > Date.now() + 30 * 365 * 86_400_000) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That expiry date is more than thirty years away." });
      }

      const result = await ctx.db.$transaction(async (tx) => {
        const written = await recordDocument(tx, {
          orgId: ctx.orgId,
          actorId: ctx.userId,
          ownerType: input.ownerType,
          ownerId,
          type: input.type,
          reference: input.reference,
          issuedAt: input.issuedAt ?? null,
          expiresAt: input.expiresAt ?? null,
        });

        await audit(tx, ctx.orgId, {
          actorId: ctx.userId,
          action: "document.record",
          entity: "Document",
          entityId: written.id,
          after: {
            type: input.type,
            ownerType: input.ownerType,
            expiresAt: input.expiresAt?.toISOString() ?? null,
            superseded: written.superseded,
          },
        });

        return written;
      });

      return result;
    }),

  /**
   * Somebody has looked at it.
   *
   * `verifiedAt` is not set on record on purpose — the schema comment
   * says a stored document is not a verified one, and an agent typing
   * their own card number in is not a check. This is the separate act.
   */
  verify: requirePermission("document:write")
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const doc = await ctx.db.document.findFirst({ where: { id: input.id }, select: { id: true, verifiedAt: true } });
      if (!doc) throw new TRPCError({ code: "NOT_FOUND", message: "That document is not in the register." });
      if (doc.verifiedAt) return { id: doc.id, verifiedAt: doc.verifiedAt };

      const updated = await ctx.db.document.update({
        where: { id: doc.id },
        data: { verifiedAt: new Date(), verifiedById: ctx.userId },
        select: { id: true, verifiedAt: true },
      });

      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId, action: "document.verify",
        entity: "Document", entityId: doc.id, after: { verifiedAt: updated.verifiedAt },
      });

      return updated;
    }),
});
