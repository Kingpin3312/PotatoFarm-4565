import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { Prisma } from "@prisma/client";
import { randomBytes } from "node:crypto";
import { router, requirePermission } from "../trpc";
import { audit } from "@/server/lib/audit";
import { readSecret, invalidate, writeSecret, vaultReady, NOT_CONFIGURED }
  from "@/server/lib/secrets";

/**
 * Channels.
 *
 * The silence check lived in `portals/health.ts` and ran as a job with
 * nothing exposing it to a screen — so a brokerage could only find out a
 * feed had stopped by noticing fewer leads.
 *
 * A channel going quiet produces no error. That is the whole problem,
 * and it is why this is a screen rather than only an alert.
 *
 * ---------------------------------------------------------------------
 * **Until now this router was read-only, and nothing anywhere created a
 * Channel.**
 *
 * On a WhatsApp-first CRM that is not a missing settings page. Inbound
 * routing works by finding the channel whose `identifier` matches the
 * phone number id on the webhook; with no channel row, every inbound
 * message hit `log.warn("message for an unknown number")` and was
 * dropped. The inbox, the assistant, the 24-hour window and the whole
 * lead intake path were downstream of a table a brokerage could not
 * write to.
 * ---------------------------------------------------------------------
 */

/**
 * What each channel type calls its identifier, and where to find it.
 *
 * Written down because "identifier" is the correct column name and a
 * useless thing to put on a form. An owner is looking at Meta's
 * dashboard at a field with a different name on it.
 */
const IDENTIFIER = {
  WHATSAPP: {
    label: "Phone number ID",
    hint: "Meta Business Suite → WhatsApp → API Setup. It is a long number, not the phone number itself.",
  },
  META_LEAD_ADS: {
    label: "Facebook Page ID",
    hint: "The Page the lead form runs on. Page → About → Page transparency.",
  },
  PROPERTY_FINDER: { label: "Account reference", hint: "From your Property Finder account manager." },
  BAYUT:           { label: "Account reference", hint: "From your Bayut account manager." },
  DUBIZZLE:        { label: "Account reference", hint: "From your Dubizzle account manager." },
  WEBSITE_FORM:    { label: "Form name", hint: "Any name you will recognise. It identifies the form posting to us." },
} as const;

const TYPES = [
  "WHATSAPP", "META_LEAD_ADS", "PROPERTY_FINDER", "BAYUT", "DUBIZZLE", "WEBSITE_FORM",
] as const;

/**
 * Types whose deliveries arrive on a per-channel URL rather than one
 * shared endpoint. They get a `webhookToken`; the Meta ones do not,
 * because Meta posts everything to one address and is identified by
 * signature.
 */
const TOKENED = new Set(["PROPERTY_FINDER", "BAYUT", "DUBIZZLE", "WEBSITE_FORM"]);

export const channelsRouter = router({
  health: requirePermission("channel:read").query(async ({ ctx }) => {
    const channels = await ctx.db.channel.findMany({
      where: { active: true },
      select: { id: true, label: true, type: true, lastSyncAt: true, lastError: true },
      orderBy: { label: "asc" },
    });

    const now = Date.now();
    return {
      channels: channels.map((c) => {
        const hours = c.lastSyncAt ? (now - c.lastSyncAt.getTime()) / 3_600_000 : null;
        /**
         * Thresholds differ per channel on purpose.
         *
         * Meta lead ads are the tightest: a dead token there means leads
         * are arriving and cannot be collected, and the retention window
         * is finite — they are lost, not delayed. A portal is usually
         * just a quiet day.
         */
        const limit =
          c.type === "META_LEAD_ADS" ? 24 :
          c.type === "WEBSITE_FORM"  ? 72 :
          c.type === "WHATSAPP"      ? 96 : 48;
        return {
          id: c.id,
          label: c.label,
          lastAt: c.lastSyncAt,
          lastAgo: hours == null ? null : ago(hours),
          lastError: c.lastError,
          quiet: hours != null && hours > limit,
        };
      }),
    };
  }),

  /**
   * Everything connected, including what is switched off.
   *
   * `health` deliberately shows only active channels, because its job is
   * "what has gone quiet". This one is the settings view, and a
   * disconnected channel has to be visible or reconnecting it is
   * impossible.
   *
   * **`secretRef` is returned; the secret is not.** The reference is a
   * name like `wa_9f2c…` that an owner has to be able to read, because
   * it is half of the environment variable they must set. It grants
   * nothing on its own.
   */
  list: requirePermission("channel:read").query(async ({ ctx }) => {
    const rows = await ctx.db.channel.findMany({
      select: {
        id: true, type: true, label: true, identifier: true, secretRef: true,
        webhookToken: true, active: true, lastSyncAt: true, lastError: true, createdAt: true,
      },
      orderBy: [{ active: "desc" }, { createdAt: "asc" }],
    });

    // `Promise.all` over an async map, not an `await` inside a plain
    // one — that reads fine and returns an array of promises the client
    // renders as [object Promise].
    return Promise.all(rows.map(async (c) => ({
      ...c,
      identifierLabel: IDENTIFIER[c.type as keyof typeof IDENTIFIER]?.label ?? "Identifier",
      /**
       * Whether outbound will work, answered without revealing anything.
       *
       * Inbound needs only this row to exist. Sending needs a token, and
       * a token that has not been wired up fails at the moment an agent
       * presses send to a real customer — the worst possible time to
       * find out. Resolved here so the screen can say so while nobody
       * is waiting.
       */
      canSend: c.type === "WHATSAPP" ? await resolves(c.secretRef) : null,
    })));
  }),

  /**
   * Connect one, token and all.
   *
   * ## The token used to be refused, and the reason has gone away
   *
   * This said: `lib/secrets.ts` states that tokens never go into
   * Postgres, there is no secrets provider wired up, so there is
   * nowhere for this form to put one — and it made an owner set an
   * environment variable and redeploy instead. That was the honest
   * answer at the time, and it also meant a brokerage could not be
   * onboarded without a deploy. Per brokerage. Per channel.
   *
   * `lib/secrets/vault.ts` is that provider. The rule it was protecting
   * is intact: what reaches Postgres is ciphertext sealed with a key
   * held only in the environment, so a database dump — still the
   * likeliest thing to leak — carries nothing able to message a
   * customer's clients.
   *
   * The token stays optional. **Inbound works the moment this row
   * exists**, because the webhook is verified with the app-wide
   * `WHATSAPP_APP_SECRET` and routed by phone number, so somebody who
   * has not got their token to hand can connect now and send later.
   */
  connect: requirePermission("channel:write")
    .input(z.object({
      type: z.enum(TYPES),
      label: z.string().trim().min(1).max(60),
      identifier: z.string().trim().min(1).max(120),
      /**
       * Optional, and never echoed back. It is written to the vault and
       * the row keeps only the reference — nothing downstream of here,
       * including the audit entry and the response, ever sees it again.
       */
      accessToken: z.string().trim().min(20).max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      /**
       * A readable, unguessable reference. It is a *name*, not a secret
       * — it appears on screen and in an environment variable — so the
       * randomness is only to stop two brokerages generating the same
       * one, not to resist an attacker.
       */
      const secretRef =
        input.type === "WHATSAPP" ? `wa_${randomBytes(6).toString("hex")}` : undefined;

      /**
       * Refused up front rather than after the row exists.
       *
       * Creating the channel and then failing to store the token would
       * leave a connected-looking number that cannot send, which is the
       * state this whole change exists to remove.
       */
      if (input.accessToken && !vaultReady()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: NOT_CONFIGURED });
      }

      try {
        const channel = await ctx.db.channel.create({
          data: {
            orgId: ctx.orgId,
            type: input.type,
            label: input.label,
            identifier: input.identifier,
            ...(secretRef ? { secretRef } : {}),
            ...(TOKENED.has(input.type)
              ? { webhookToken: randomBytes(24).toString("base64url") }
              : {}),
            active: true,
          },
          select: { id: true, label: true, type: true, identifier: true,
                    secretRef: true, webhookToken: true },
        });

        /**
         * After the row, and outside its transaction on purpose.
         *
         * A secret written for a channel that then failed to create is
         * an orphan nothing will ever read or clean up. This way the
         * worst case is a channel with no token — which is a state the
         * product already handles and the screen already reports.
         */
        if (input.accessToken && secretRef) {
          await writeSecret({ orgId: ctx.orgId, ref: secretRef, value: input.accessToken });
        }

        await audit(ctx.db, ctx.orgId, {
          actorId: ctx.userId,
          action: "channel.connect",
          entity: "Channel",
          entityId: channel.id,
          // The identifier is not a secret, but it is another party's
          // account reference and there is no reason for it to sit in an
          // audit row that a wider group can read.
          after: { type: channel.type, label: channel.label,
                   // Whether, never what.
                   tokenStored: Boolean(input.accessToken) },
        });

        // Whether, never what. The screen needs to know if it should
        // still be asking for a token; it must never be handed one.
        return { ...channel, tokenStored: Boolean(input.accessToken) };
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          const target = (e.meta?.target as string[] | string | undefined) ?? "";
          const fields = Array.isArray(target) ? target.join(",") : String(target);

          /**
           * Two different collisions, and the difference is the whole
           * reason this branch is written out.
           *
           * Within the brokerage, naming the existing channel is
           * helpful. Across brokerages it would confirm that some other
           * customer of ours has that number connected — so the message
           * says what to do and nothing about who. The database has
           * already refused it either way; this only chooses the
           * wording.
           */
          const crossTenantClash = fields.includes("type") && !fields.includes("orgId");
          throw new TRPCError({
            code: "CONFLICT",
            message: crossTenantClash
              ? "That identifier is already connected and in use. If it belongs to you, " +
                "disconnect it wherever it is currently connected and try again."
              : "You have already connected that identifier.",
          });
        }
        throw e;
      }
    }),

  /**
   * Switch one off, or back on.
   *
   * Not a delete. The conversations, enquiries and messages that arrived
   * through a channel reference it, and removing the row would either
   * fail or take the history with it. Deactivating also releases the
   * identifier for another brokerage, which is what the partial unique
   * index is for.
   */
  setActive: requirePermission("channel:write")
    .input(z.object({ id: z.string(), active: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const before = await ctx.db.channel.findFirst({
        where: { id: input.id },
        select: { id: true, label: true, type: true, active: true },
      });
      if (!before) throw new TRPCError({ code: "NOT_FOUND" });

      try {
        await ctx.db.channel.update({
          where: { id: input.id },
          data: { active: input.active },
        });
      } catch (e) {
        if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
          throw new TRPCError({
            code: "CONFLICT",
            message: "That identifier has been connected somewhere else since you " +
                     "switched this off. It cannot be reconnected here until it is released.",
          });
        }
        throw e;
      }

      // The credential cache is keyed by channel and holds for five
      // minutes. Without this, a channel switched off keeps sending for
      // up to five minutes after somebody stopped it.
      invalidate(ctx.orgId, input.id);

      await audit(ctx.db, ctx.orgId, {
        actorId: ctx.userId,
        action: input.active ? "channel.reconnect" : "channel.disconnect",
        entity: "Channel",
        entityId: input.id,
        before: { active: before.active },
        after: { active: input.active },
      });

      return { id: input.id, active: input.active };
    }),
});

/**
 * Does this secret reference resolve to something?
 *
 * True or false, never the value, and it never throws — `readSecret`
 * rejects when a reference is not wired up, which is the ordinary state
 * of a channel connected ten seconds ago rather than an error worth
 * propagating to a settings screen.
 */
async function resolves(ref: string | null): Promise<boolean> {
  if (!ref) return false;
  try {
    return Boolean(await readSecret(ref));
  } catch {
    return false;
  }
}

/** Rounded to something a person says out loud. "37 hours" is a number;
 *  "a day and a half" is an answer. */
function ago(hours: number): string {
  if (hours < 1) return "just now";
  if (hours < 24) return `${Math.round(hours)}h ago`;
  const d = Math.round(hours / 24);
  return d === 1 ? "a day ago" : `${d} days ago`;
}

export { IDENTIFIER };
