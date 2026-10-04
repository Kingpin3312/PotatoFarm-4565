import { z } from "zod";
import { TRPCError } from "@trpc/server";
import qrcode from "qrcode-generator";
import { router, requirePermission } from "../trpc";
import { can } from "@/server/auth/rbac";
import { crossTenant } from "@/server/db/client";
import { audit } from "@/server/lib/audit";
import { validateForPublish, blocking } from "@/server/lib/feeds/validate";
import { PUBLIC_REQUIREMENTS } from "@/server/lib/listings/public";
import { photoList } from "@/lib/listing-paths";
import { PHOTO_MAX_BYTES, PHOTO_TYPES } from "@/server/lib/listings/photos";
import { deleteObject, objectExists, readObjectHead, signGet, signPut, storageConfigured } from "@/server/lib/files/storage";
import { matchesType } from "@/server/lib/files/signature";
import {
  checkContent, completeness, contentSchema, emptyContent, LANGUAGES, micrositePath, readContent, slugify, slugProblem,
  SOCIAL, SOCIAL_KEYS, SPECIALISMS, LIMITS, type MicrositeContent,
} from "@/lib/microsite/content";
import { ACCENTS, allowedAccents, ACCENT_KEYS, isAccent } from "@/lib/microsite/palette";
import { appOrigin, orgForMicrosites, resolveParts } from "@/server/lib/microsite/public";
import { micrositeStats } from "@/server/lib/microsite/events";

/**
 * Agent microsites, from the CRM side.
 *
 * An agent edits their own (`microsite:own`); an admin can edit, approve
 * or take down anybody's and sets the rules (`microsite:manage`). Every
 * procedure that takes a `userId` is an admin acting on an agent's site —
 * without `microsite:manage` it is refused rather than quietly ignored,
 * so a forged id cannot reach somebody else's site.
 *
 * What the editor sends is checked by the same rules the editor shows
 * (`lib/microsite/content.ts`) and then against this brokerage: chosen
 * properties must be its own, areas must be places in the tree, the
 * accent must be one it allows, WhatsApp to the agent's own number only
 * if it allows that. A save changes the draft only; the public page
 * changes on publish (or on approval, if the brokerage approves).
 */

const ROLES_WITH_SITES = ["AGENT", "MANAGER", "ADMIN", "OWNER"] as const;

const editable = contentSchema.omit({ photo: true, cover: true });

type Ctx = { orgId: string; userId: string; role: Parameters<typeof can>[0] };

/** Whose site this call is about: the caller's, or — for an admin — the named agent's. */
async function target(ctx: Ctx, userId: string | undefined) {
  const who = userId ?? ctx.userId;
  if (who !== ctx.userId && !can(ctx.role, "microsite:manage")) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Only an admin can change another agent's microsite." });
  }
  const member = await crossTenant("global-key").membership.findFirst({
    where: { orgId: ctx.orgId, userId: who },
    select: { role: true, user: { select: { id: true, name: true, phone: true, email: true } } },
  });
  if (!member || !can(member.role, "microsite:own")) {
    throw new TRPCError({ code: "NOT_FOUND", message: "That person can't have a microsite here." });
  }
  return { userId: who, user: member.user, acting: who !== ctx.userId };
}

/** The agent's site, made on first visit from what the CRM knows about them. */
async function siteFor(orgId: string, user: { id: string; name: string | null; phone: string | null; email: string | null }) {
  const db = crossTenant("global-key");
  const found = await db.agentMicrosite.findUnique({ where: { orgId_userId: { orgId, userId: user.id } } });
  if (found) return found;
  const base = slugify(user.name ?? user.email?.split("@")[0] ?? "agent");
  for (let i = 0; i < 20; i++) {
    const slug = i === 0 ? (base.length >= 3 ? base : `${base}-agent`) : `${base}-${i + 1}`;
    if (slugProblem(slug)) continue;
    try {
      return await db.agentMicrosite.create({
        data: { orgId, userId: user.id, slug, draft: emptyContent(user) as never },
      });
    } catch (e) {
      if ((e as { code?: string }).code !== "P2002") throw e;
      const again = await db.agentMicrosite.findUnique({ where: { orgId_userId: { orgId, userId: user.id } } });
      if (again) return again;
    }
  }
  throw new TRPCError({ code: "CONFLICT", message: "Couldn't find a free address. Choose one in the editor." });
}

type Site = Awaited<ReturnType<typeof siteFor>>;

/**
 * Waiting for approval outranks live: a live site whose changes were sent
 * for approval is still live (its previous version stays up), but the
 * thing anybody needs to know — the agent and the admin who must act — is
 * that something is waiting. `isLive` says the rest.
 */
function status(site: Site): "LIVE" | "DRAFT" | "AWAITING_APPROVAL" | "TAKEN_DOWN" {
  if (site.disabledAt) return "TAKEN_DOWN";
  if (site.submittedAt) return "AWAITING_APPROVAL";
  if (site.publishedAt) return "LIVE";
  return "DRAFT";
}

const sameContent = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

async function describe(orgId: string, site: Site, user: { name: string | null; phone: string | null; email: string | null }) {
  const org = await crossTenant("global-key").organisation.findUnique({
    where: { id: orgId },
    select: { slug: true, name: true, micrositesEnabled: true, micrositeApproval: true, micrositeOwnWhatsapp: true, micrositeAccents: true, demo: true },
  });
  if (!org) throw new TRPCError({ code: "NOT_FOUND" });
  const draft = readContent(site.draft, emptyContent(user));
  const path = micrositePath(org.slug, site.slug);
  const parts = await resolveParts(
    { id: orgId, name: org.name, slug: org.slug, micrositeAccents: org.micrositeAccents, micrositeOwnWhatsapp: org.micrositeOwnWhatsapp, demo: org.demo },
    { slug: site.slug, userId: site.userId }, draft, { preview: true },
  );
  const featuredShown = draft.featured.filter((id) => parts.cards[id]).length;
  return {
    site: {
      slug: site.slug, path, url: `${appOrigin()}${path}`, status: status(site), isLive: !!site.publishedAt && !site.disabledAt,
      publishedAt: site.publishedAt, submittedAt: site.submittedAt, updatedAt: site.updatedAt,
      disabledReason: site.disabledAt ? site.disabledReason : null,
      unpublishedChanges: !!site.publishedAt && !sameContent(site.draft, site.live),
    },
    content: draft,
    parts,
    rules: {
      enabled: org.micrositesEnabled,
      approval: org.micrositeApproval,
      ownWhatsapp: org.micrositeOwnWhatsapp,
      accents: allowedAccents(org.micrositeAccents).map((k) => ({ key: k, ...ACCENTS[k] })),
      companyWhatsapp: !!parts.companyWhatsapp,
      storage: storageConfigured(),
    },
    completeness: completeness(draft, { featuredShown }),
    brokerage: org.name,
  };
}

const mediaPrefix = (orgId: string, siteId: string, which: "photo" | "cover") => `org/${orgId}/microsites/${siteId}/${which}/`;

/** Delete a stored photograph unless the other copy of the site still shows it. */
async function dropIfUnused(key: string | null, stillUsed: (string | null)[]) {
  if (key && !stillUsed.includes(key)) await deleteObject(key).catch(() => {});
}

export const micrositeRouter = router({
  /** The agent's site, the editor's starting point, and the rules that apply. */
  mine: requirePermission("microsite:own")
    .input(z.object({ userId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const t = await target(ctx, input?.userId);
      const site = await siteFor(ctx.orgId, t.user);
      return { ...(await describe(ctx.orgId, site, t.user)), agentName: t.user.name ?? t.user.email ?? "", acting: t.acting };
    }),

  /** What the pickers offer: the languages, specialisms, networks and areas. */
  options: requirePermission("microsite:own").query(async () => {
    const areas = await crossTenant("global-key").location.findMany({
      where: { level: { in: ["COMMUNITY", "SUB_COMMUNITY"] } },
      select: { id: true, name: true, level: true, path: true },
      orderBy: { name: "asc" },
      take: 800,
    });
    return {
      languages: LANGUAGES, specialisms: SPECIALISMS, limits: LIMITS,
      social: SOCIAL_KEYS.map((k) => ({ key: k, label: SOCIAL[k].label, host: SOCIAL[k].hosts[0] })),
      areas: areas.map((a) => ({ id: a.id, name: a.name, path: a.path })),
    };
  }),

  /**
   * The brokerage's properties, for choosing which to feature, each with
   * whether it can appear and — when it can't — why, in the same words
   * as the listing's own publishing check.
   */
  listings: requirePermission("microsite:own")
    .input(z.object({ userId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const t = await target(ctx, input?.userId);
      const rows = await ctx.db.listing.findMany({
        where: { deletedAt: null, status: { in: ["AVAILABLE", "UNDER_OFFER"] } },
        orderBy: { updatedAt: "desc" },
        take: 300,
        select: {
          id: true, reference: true, title: true, community: true, purpose: true, priceFils: true, status: true,
          agentId: true, permitNumber: true, permitExpiresAt: true, reraBrokerCard: true, descriptions: true,
          bedrooms: true, bathrooms: true, areaSqft: true, building: true, propertyType: true, completion: true,
        },
      });
      return rows.map((r) => {
        const why = r.status !== "AVAILABLE"
          ? "Under offer, so it isn't advertised."
          : blocking(validateForPublish(r as never, PUBLIC_REQUIREMENTS, photoList(r.descriptions).length))[0]?.message ?? null;
        return {
          id: r.id, reference: r.reference, title: r.title, community: r.community, purpose: r.purpose,
          price: r.priceFils === null ? null : r.priceFils.toString(), mine: r.agentId === t.userId,
          offPlan: r.completion === "OFF_PLAN", shown: !why, why,
        };
      });
    }),

  /**
   * What the live preview needs from the database for the properties
   * and areas currently chosen in the editor — before they are saved.
   */
  previewParts: requirePermission("microsite:own")
    .input(z.object({ userId: z.string().optional(), featured: z.array(z.string().max(40)).max(LIMITS.featured), areas: z.array(z.string().max(40)).max(LIMITS.areas) }))
    .query(async ({ ctx, input }) => {
      const t = await target(ctx, input.userId);
      const site = await siteFor(ctx.orgId, t.user);
      const org = await orgForMicrosites(ctx.orgId);
      if (!org) throw new TRPCError({ code: "NOT_FOUND" });
      const draft = readContent(site.draft, emptyContent(t.user));
      return resolveParts(org, { slug: site.slug, userId: site.userId }, { ...draft, featured: input.featured, areas: input.areas }, { preview: true });
    }),

  /** Save the draft. Nothing the public sees changes until it is published. */
  save: requirePermission("microsite:own")
    .input(z.object({ userId: z.string().optional(), slug: z.string().trim().toLowerCase().max(60), content: z.object(editable.shape) }))
    .mutation(async ({ ctx, input }) => {
      const t = await target(ctx, input.userId);
      const site = await siteFor(ctx.orgId, t.user);
      const checked = checkContent(input.content);
      if (!checked.ok) return { ok: false as const, field: checked.field, problem: checked.problem };
      const c = checked.content;

      const slugWhy = slugProblem(input.slug);
      if (slugWhy) return { ok: false as const, field: "slug", problem: slugWhy };
      if (input.slug !== site.slug) {
        const taken = await crossTenant("global-key").agentMicrosite.findUnique({
          where: { orgId_slug: { orgId: ctx.orgId, slug: input.slug } }, select: { id: true },
        });
        if (taken) return { ok: false as const, field: "slug", problem: "Another agent here has that address. Try adding your surname." };
      }

      const org = await crossTenant("global-key").organisation.findUnique({
        where: { id: ctx.orgId }, select: { micrositeAccents: true, micrositeOwnWhatsapp: true },
      });
      if (!allowedAccents(org?.micrositeAccents).includes(c.accent)) {
        return { ok: false as const, field: "accent", problem: "Your brokerage doesn't offer that colour. Choose one of the others." };
      }
      if (c.whatsapp === "OWN" && !org?.micrositeOwnWhatsapp) {
        return { ok: false as const, field: "whatsapp", problem: "Your brokerage sends WhatsApp enquiries to its own line, so it can keep the conversation in the CRM." };
      }
      if (c.featured.length) {
        const mine = await ctx.db.listing.count({ where: { id: { in: c.featured }, deletedAt: null } });
        if (mine !== c.featured.length) return { ok: false as const, field: "featured", problem: "One of the chosen properties isn't one of this brokerage's. Choose again." };
      }
      if (c.areas.length) {
        const known = await crossTenant("global-key").location.count({ where: { id: { in: c.areas }, level: { in: ["COMMUNITY", "SUB_COMMUNITY"] } } });
        if (known !== c.areas.length) return { ok: false as const, field: "areas", problem: "One of the areas isn't in the list of places. Choose again." };
      }

      const before = readContent(site.draft, emptyContent(t.user));
      const draft: MicrositeContent = { ...c, photo: before.photo, cover: before.cover };
      try {
        await crossTenant("global-key").agentMicrosite.update({
          where: { id: site.id },
          data: { draft: draft as never, slug: input.slug },
        });
      } catch (e) {
        // Two agents taking the same address at once: the second is told,
        // not shown a server error.
        if ((e as { code?: string }).code === "P2002") return { ok: false as const, field: "slug", problem: "Another agent here has that address. Try adding your surname." };
        throw e;
      }
      if (input.slug !== site.slug || t.acting) {
        await audit(crossTenant("global-key") as never, ctx.orgId, {
          actorId: ctx.userId, action: t.acting ? "microsite.edited_by_admin" : "microsite.address_changed",
          entity: "AgentMicrosite", entityId: site.id, before: { slug: site.slug }, after: { slug: input.slug },
        });
      }
      return { ok: true as const };
    }),

  /**
   * Make the draft public — or, where the brokerage approves microsites,
   * send it for approval. An admin publishing an agent's site is the
   * approval. A site an admin took down stays down.
   */
  publish: requirePermission("microsite:own")
    .input(z.object({ userId: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const t = await target(ctx, input?.userId);
      const site = await siteFor(ctx.orgId, t.user);
      if (site.disabledAt) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Your brokerage has taken this microsite down. Ask an admin to turn it back on." });
      }
      const org = await crossTenant("global-key").organisation.findUnique({
        where: { id: ctx.orgId }, select: { micrositesEnabled: true, micrositeApproval: true },
      });
      if (!org?.micrositesEnabled) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Microsites are switched off for this brokerage." });
      }
      const draft = readContent(site.draft, emptyContent(t.user));
      if (!draft.name) throw new TRPCError({ code: "BAD_REQUEST", message: "Add your name before publishing." });
      if (!draft.phone && !draft.email && draft.whatsapp === "NONE") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Add at least one way to reach you — a phone, an email or WhatsApp — before publishing." });
      }
      const approve = org.micrositeApproval && !can(ctx.role, "microsite:manage");
      await crossTenant("global-key").agentMicrosite.update({
        where: { id: site.id },
        data: approve
          ? { submittedAt: new Date() }
          : { live: draft as never, publishedAt: site.publishedAt ?? new Date(), publishedById: ctx.userId, submittedAt: null },
      });
      if (!approve) {
        const live = readContent(site.live, emptyContent(t.user));
        await dropIfUnused(live.photo, [draft.photo]);
        await dropIfUnused(live.cover, [draft.cover]);
      }
      await audit(crossTenant("global-key") as never, ctx.orgId, {
        actorId: ctx.userId, action: approve ? "microsite.submitted" : t.acting ? "microsite.approved" : "microsite.published",
        entity: "AgentMicrosite", entityId: site.id, after: { slug: site.slug },
      });
      return { status: approve ? "AWAITING_APPROVAL" as const : "LIVE" as const };
    }),

  /** Take the site off the web. The draft is kept. */
  unpublish: requirePermission("microsite:own")
    .input(z.object({ userId: z.string().optional() }).optional())
    .mutation(async ({ ctx, input }) => {
      const t = await target(ctx, input?.userId);
      const site = await siteFor(ctx.orgId, t.user);
      await crossTenant("global-key").agentMicrosite.update({
        where: { id: site.id }, data: { publishedAt: null, submittedAt: null },
      });
      await audit(crossTenant("global-key") as never, ctx.orgId, {
        actorId: ctx.userId, action: "microsite.unpublished", entity: "AgentMicrosite", entityId: site.id,
      });
      return { ok: true };
    }),

  /** Somewhere to put a profile or cover photograph: a signed upload straight to storage. */
  photoUpload: requirePermission("microsite:own")
    .input(z.object({ userId: z.string().optional(), which: z.enum(["photo", "cover"]), mimeType: z.string().max(100), sizeBytes: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const t = await target(ctx, input.userId);
      const site = await siteFor(ctx.orgId, t.user);
      if (!storageConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Photo storage is not set up yet, so photos cannot be added. Ask whoever runs your account to connect it." });
      }
      if (!(PHOTO_TYPES as readonly string[]).includes(input.mimeType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Photos must be JPEG or PNG. Most phones can save a HEIC photo as JPEG." });
      }
      if (input.sizeBytes <= 0) throw new TRPCError({ code: "BAD_REQUEST", message: "That file is empty." });
      if (input.sizeBytes > PHOTO_MAX_BYTES) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `That photo is ${(input.sizeBytes / 1024 / 1024).toFixed(0)}MB and the limit is ${PHOTO_MAX_BYTES / 1024 / 1024}MB. Export it smaller and try again.` });
      }
      const key = `${mediaPrefix(ctx.orgId, site.id, input.which)}${crypto.randomUUID()}`;
      const uploadUrl = await signPut({ key, mimeType: input.mimeType, sizeBytes: input.sizeBytes, expiresInSeconds: 900 });
      return { key, uploadUrl };
    }),

  /** Kept only once the bytes are there and are the image they claim to be. */
  photoConfirm: requirePermission("microsite:own")
    .input(z.object({ userId: z.string().optional(), which: z.enum(["photo", "cover"]), key: z.string().max(300), mimeType: z.string().max(100), sizeBytes: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const t = await target(ctx, input.userId);
      const site = await siteFor(ctx.orgId, t.user);
      if (!input.key.startsWith(mediaPrefix(ctx.orgId, site.id, input.which)) || input.key.includes("..")) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "That upload doesn't belong to this microsite." });
      }
      if (!(PHOTO_TYPES as readonly string[]).includes(input.mimeType)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Photos must be JPEG or PNG." });
      }
      if (!(await objectExists(input.key))) throw new TRPCError({ code: "BAD_REQUEST", message: "That upload didn't finish. Try again." });
      const { head, size } = await readObjectHead(input.key);
      if (!matchesType(head, input.mimeType) || (size !== null && size !== input.sizeBytes)) {
        await deleteObject(input.key).catch(() => {});
        throw new TRPCError({ code: "BAD_REQUEST", message: "That file isn't the photo it says it is, so it wasn't kept. Save it again as a JPEG or PNG and upload that." });
      }
      const draft = readContent(site.draft, emptyContent(t.user));
      const old = draft[input.which];
      await crossTenant("global-key").agentMicrosite.update({
        where: { id: site.id }, data: { draft: { ...draft, [input.which]: input.key } as never },
      });
      const live = site.live ? readContent(site.live, emptyContent(t.user)) : null;
      await dropIfUnused(old, [live?.[input.which] ?? null]);
      return { url: signGet({ key: input.key, expiresInSeconds: 3600 }) };
    }),

  photoRemove: requirePermission("microsite:own")
    .input(z.object({ userId: z.string().optional(), which: z.enum(["photo", "cover"]) }))
    .mutation(async ({ ctx, input }) => {
      const t = await target(ctx, input.userId);
      const site = await siteFor(ctx.orgId, t.user);
      const draft = readContent(site.draft, emptyContent(t.user));
      const old = draft[input.which];
      await crossTenant("global-key").agentMicrosite.update({
        where: { id: site.id }, data: { draft: { ...draft, [input.which]: null } as never },
      });
      const live = site.live ? readContent(site.live, emptyContent(t.user)) : null;
      await dropIfUnused(old, [live?.[input.which] ?? null]);
      return { ok: true };
    }),

  /** The agent's numbers for the last `days` days. */
  stats: requirePermission("microsite:own")
    .input(z.object({ userId: z.string().optional(), days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const t = await target(ctx, input.userId);
      const site = await siteFor(ctx.orgId, t.user);
      return micrositeStats(ctx.orgId, site.id, new Date(Date.now() - input.days * 86_400_000));
    }),

  /**
   * The site's address as a QR code, for a business card or a sign at a
   * viewing. The page draws it as SVG, so it prints sharp at any size,
   * and turns it into a PNG for people who need one.
   */
  qr: requirePermission("microsite:own")
    .input(z.object({ userId: z.string().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const t = await target(ctx, input?.userId);
      const site = await siteFor(ctx.orgId, t.user);
      const org = await crossTenant("global-key").organisation.findUnique({ where: { id: ctx.orgId }, select: { slug: true } });
      const url = `${appOrigin()}${micrositePath(org!.slug, site.slug)}`;
      const qr = qrcode(0, "M");
      qr.addData(url);
      qr.make();
      const n = qr.getModuleCount();
      // The matrix, row by row, "1" for dark: the page draws it, so no
      // markup crosses from the server into the page.
      const rows = Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => (qr.isDark(r, c) ? "1" : "0")).join(""));
      return { url, rows };
    }),

  /* ------------------------------------------------------------------
   * The brokerage's controls
   * ---------------------------------------------------------------- */

  settings: requirePermission("microsite:manage").query(async ({ ctx }) => {
    const org = await crossTenant("global-key").organisation.findUnique({
      where: { id: ctx.orgId },
      select: { slug: true, micrositesEnabled: true, micrositeApproval: true, micrositeOwnWhatsapp: true, micrositeAccents: true },
    });
    return {
      enabled: org!.micrositesEnabled, approval: org!.micrositeApproval, ownWhatsapp: org!.micrositeOwnWhatsapp,
      accents: allowedAccents(org!.micrositeAccents),
      palette: ACCENT_KEYS.map((k) => ({ key: k, ...ACCENTS[k] })),
      teamPage: `${appOrigin()}/p/${org!.slug}/agents`,
    };
  }),

  updateSettings: requirePermission("microsite:manage")
    .input(z.object({ enabled: z.boolean(), approval: z.boolean(), ownWhatsapp: z.boolean(), accents: z.array(z.string()).min(1).max(ACCENT_KEYS.length) }))
    .mutation(async ({ ctx, input }) => {
      const accents = [...new Set(input.accents.filter(isAccent))];
      if (!accents.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Allow at least one colour." });
      const before = await crossTenant("global-key").organisation.findUnique({
        where: { id: ctx.orgId }, select: { micrositesEnabled: true, micrositeApproval: true, micrositeOwnWhatsapp: true, micrositeAccents: true },
      });
      await crossTenant("global-key").organisation.update({
        where: { id: ctx.orgId },
        data: {
          micrositesEnabled: input.enabled, micrositeApproval: input.approval, micrositeOwnWhatsapp: input.ownWhatsapp,
          micrositeAccents: accents.length === ACCENT_KEYS.length ? [] : accents,
        },
      });
      await audit(crossTenant("global-key") as never, ctx.orgId, {
        actorId: ctx.userId, action: "microsite.settings_changed", entity: "Organisation", entityId: ctx.orgId,
        before, after: { ...input, accents },
      });
      return { ok: true };
    }),

  /** Every agent who may have a site, with its state and last 30 days. */
  all: requirePermission("microsite:manage").query(async ({ ctx }) => {
    const db = crossTenant("global-key");
    const [members, sites, org] = await Promise.all([
      db.membership.findMany({
        where: { orgId: ctx.orgId, role: { in: [...ROLES_WITH_SITES] } },
        select: { userId: true, role: true, user: { select: { name: true, email: true } } },
      }),
      db.agentMicrosite.findMany({ where: { orgId: ctx.orgId } }),
      db.organisation.findUnique({ where: { id: ctx.orgId }, select: { slug: true } }),
    ]);
    const since = new Date(Date.now() - 30 * 86_400_000);
    const [views, leads] = await Promise.all([
      db.micrositeEvent.groupBy({ by: ["micrositeId"], where: { orgId: ctx.orgId, kind: "VIEW", createdAt: { gte: since } }, _count: { _all: true } }),
      db.enquiry.groupBy({ by: ["micrositeId"], where: { orgId: ctx.orgId, micrositeId: { not: null }, createdAt: { gte: since } }, _count: { _all: true } }),
    ]);
    const bySite = new Map(sites.map((s) => [s.userId, s]));
    const row = (m: (typeof members)[number], s: (typeof sites)[number] | undefined) => ({
      userId: m.userId, siteId: s?.id ?? null, name: m.user.name ?? m.user.email, role: m.role,
      status: s ? status(s) : ("NOT_STARTED" as const),
      path: s ? micrositePath(org!.slug, s.slug) : null,
      disabledReason: s?.disabledReason ?? null,
      updatedAt: s?.updatedAt ?? null,
      views: s ? views.find((v) => v.micrositeId === s.id)?._count._all ?? 0 : 0,
      leads: s ? leads.find((v) => v.micrositeId === s.id)?._count._all ?? 0 : 0,
    });
    // Waiting for approval first: that is the list's reason to be opened.
    return members
      .map((m) => row(m, bySite.get(m.userId)))
      .sort((a, b) => Number(b.status === "AWAITING_APPROVAL") - Number(a.status === "AWAITING_APPROVAL") || (a.name ?? "").localeCompare(b.name ?? ""));
  }),

  /** Take a site off the web, with a reason the agent sees. They cannot republish it. */
  disable: requirePermission("microsite:manage")
    .input(z.object({ siteId: z.string(), reason: z.string().trim().min(3).max(300) }))
    .mutation(async ({ ctx, input }) => {
      const site = await ctx.db.agentMicrosite.findFirst({ where: { id: input.siteId }, select: { id: true } });
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "No such microsite." });
      await ctx.db.agentMicrosite.update({
        where: { id: site.id }, data: { disabledAt: new Date(), disabledById: ctx.userId, disabledReason: input.reason, submittedAt: null },
      });
      await audit(ctx.db as never, ctx.orgId, {
        actorId: ctx.userId, action: "microsite.taken_down", entity: "AgentMicrosite", entityId: site.id, after: { reason: input.reason },
      });
      return { ok: true };
    }),

  /** Let the agent publish again. Doesn't publish it for them. */
  enable: requirePermission("microsite:manage")
    .input(z.object({ siteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const site = await ctx.db.agentMicrosite.findFirst({ where: { id: input.siteId }, select: { id: true } });
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "No such microsite." });
      await ctx.db.agentMicrosite.update({
        where: { id: site.id }, data: { disabledAt: null, disabledById: null, disabledReason: null, publishedAt: null },
      });
      await audit(ctx.db as never, ctx.orgId, {
        actorId: ctx.userId, action: "microsite.turned_back_on", entity: "AgentMicrosite", entityId: site.id,
      });
      return { ok: true };
    }),

  /** Approve a submitted site: its draft goes live as it stands. */
  approve: requirePermission("microsite:manage")
    .input(z.object({ siteId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const site = await ctx.db.agentMicrosite.findFirst({ where: { id: input.siteId } });
      if (!site) throw new TRPCError({ code: "NOT_FOUND", message: "No such microsite." });
      if (site.disabledAt) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Turn it back on before approving it." });
      await ctx.db.agentMicrosite.update({
        where: { id: site.id },
        data: { live: site.draft as never, publishedAt: site.publishedAt ?? new Date(), publishedById: ctx.userId, submittedAt: null },
      });
      await audit(ctx.db as never, ctx.orgId, {
        actorId: ctx.userId, action: "microsite.approved", entity: "AgentMicrosite", entityId: site.id,
      });
      return { ok: true };
    }),
});
