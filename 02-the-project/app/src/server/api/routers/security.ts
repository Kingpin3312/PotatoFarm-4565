import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { router, orgProcedure, signedInProcedure } from "../trpc";
import { crossTenant } from "@/server/db/client";
import { audit } from "@/server/lib/audit";
import { limit } from "@/server/lib/ratelimit";
import { seal, open, vaultProblem, type Sealed } from "@/server/lib/secrets/vault";
import { checkTotp, hashRecovery, newRecoveryCodes, newSecret, otpauthUri } from "@/server/lib/auth/totp";

/**
 * Two-step sign-in and the list of where you are signed in (the audit's C8).
 *
 * Sign-in is a link to a work email, so whoever holds the mailbox holds
 * the account — and for an owner that is every client's number, every
 * commission and the kill switch. A code from an authenticator app is
 * the second thing: a forwarded link, or a mailbox somebody else can
 * read, is no longer enough.
 *
 * It is per person and optional, and the Security screen asks owners and
 * admins to turn it on. Making it compulsory is a brokerage's decision,
 * and one that locks people out on the day a phone is lost, so it is not
 * made here.
 *
 * Everything is about the caller's own `User` and `Session` rows, which
 * belong to no brokerage — hence `crossTenant("pre-tenant")`, the reason
 * the sign-in adapter uses for the same tables.
 */
const people = () => crossTenant("pre-tenant");
const code = z.string().trim().min(6).max(12);

async function throttle(userId: string) {
  const v = await limit("auth.twoStep", `user:${userId}`);
  if (!v.ok) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Too many codes tried. Wait fifteen minutes and try again." });
  }
}

function readKey(stored: string | null): string | null {
  if (!stored) return null;
  return open(JSON.parse(stored) as Sealed);
}

/**
 * A code from the app, or failing that one of the recovery codes.
 * Returns what to write if it was right, or null.
 */
function accept(u: { totpSecret: string | null; totpLastStep: number | null; totpRecovery: string[] }, typed: string) {
  const key = readKey(u.totpSecret);
  if (!key) return null;
  const step = checkTotp(key, typed, new Date(), u.totpLastStep);
  if (step !== null) return { totpLastStep: step, usedRecovery: false, totpRecovery: u.totpRecovery };
  const h = hashRecovery(typed);
  if (u.totpRecovery.includes(h)) {
    return { totpLastStep: u.totpLastStep, usedRecovery: true, totpRecovery: u.totpRecovery.filter((x) => x !== h) };
  }
  return null;
}

export const securityRouter = router({
  status: orgProcedure.query(async ({ ctx }) => {
    const u = await people().user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { totpEnabledAt: true, totpSecret: true, totpRecovery: true },
    });
    return {
      enabled: u.totpEnabledAt !== null,
      enabledAt: u.totpEnabledAt,
      recoveryLeft: u.totpRecovery.length,
      // Owners and admins are asked to; nobody is made to.
      recommended: ctx.role === "OWNER" || ctx.role === "ADMIN",
      canStore: vaultProblem() === null,
    };
  }),

  /** A fresh key for the app. Nothing is switched on until `confirm`. */
  begin: orgProcedure.mutation(async ({ ctx }) => {
    const problem = vaultProblem();
    if (problem) throw new TRPCError({ code: "PRECONDITION_FAILED", message: problem });
    const u = await people().user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { email: true, totpEnabledAt: true } });
    if (u.totpEnabledAt) throw new TRPCError({ code: "CONFLICT", message: "Two-step sign-in is already on." });
    const secret = newSecret();
    await people().user.update({
      where: { id: ctx.userId },
      data: { totpSecret: JSON.stringify(seal(secret)), totpLastStep: null, totpRecovery: [] },
    });
    return { secret, uri: otpauthUri(secret, u.email) };
  }),

  /**
   * The first code proves the app has the key; only then is it on.
   * This device counts as having passed; every other device signed in
   * now needs a code on its next request.
   */
  confirm: orgProcedure.input(z.object({ code })).mutation(async ({ ctx, input }) => {
    await throttle(ctx.userId);
    const u = await people().user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { totpSecret: true, totpEnabledAt: true, totpLastStep: true },
    });
    if (u.totpEnabledAt) throw new TRPCError({ code: "CONFLICT", message: "Two-step sign-in is already on." });
    const key = readKey(u.totpSecret);
    if (!key) throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Start again: no key has been set up." });
    const step = checkTotp(key, input.code, new Date(), u.totpLastStep);
    if (step === null) throw new TRPCError({ code: "BAD_REQUEST", message: "That code is not right. Check the app shows PotatoFarm and try the newest code." });

    const codes = newRecoveryCodes();
    const now = new Date();
    await people().$transaction([
      people().user.update({
        where: { id: ctx.userId },
        data: { totpEnabledAt: now, totpLastStep: step, totpRecovery: codes.map(hashRecovery) },
      }),
      ...(ctx.session!.sid ? [people().session.updateMany({ where: { id: ctx.session!.sid, userId: ctx.userId }, data: { secondFactorAt: now } })] : []),
    ]);
    await audit(ctx.db, ctx.orgId, { actorId: ctx.userId, action: "security.twoStepOn", entity: "User", entityId: ctx.userId, after: { enabled: true } });
    // Shown once. Only the hashes are kept.
    return { recoveryCodes: codes };
  }),

  /** Finishing sign-in on a device that has had the link but not a code. */
  verify: signedInProcedure.input(z.object({ code })).mutation(async ({ ctx, input }) => {
    await throttle(ctx.userId);
    const u = await people().user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { totpEnabledAt: true, totpSecret: true, totpLastStep: true, totpRecovery: true },
    });
    if (!u.totpEnabledAt) return { ok: true, usedRecovery: false, recoveryLeft: 0 };
    if (!ctx.sid) throw new TRPCError({ code: "UNAUTHORIZED" });
    const ok = accept(u, input.code);
    if (!ok) throw new TRPCError({ code: "BAD_REQUEST", message: "That code is not right. Try the newest one in the app, or a recovery code." });
    await people().$transaction([
      people().user.update({ where: { id: ctx.userId }, data: { totpLastStep: ok.totpLastStep, totpRecovery: ok.totpRecovery } }),
      people().session.updateMany({ where: { id: ctx.sid, userId: ctx.userId }, data: { secondFactorAt: new Date() } }),
    ]);
    return { ok: true, usedRecovery: ok.usedRecovery, recoveryLeft: ok.totpRecovery.length };
  }),

  /** Off again — only with a current code, so a borrowed laptop cannot. */
  disable: orgProcedure.input(z.object({ code })).mutation(async ({ ctx, input }) => {
    await throttle(ctx.userId);
    const u = await people().user.findUniqueOrThrow({
      where: { id: ctx.userId },
      select: { totpEnabledAt: true, totpSecret: true, totpLastStep: true, totpRecovery: true },
    });
    if (!u.totpEnabledAt) return { ok: true };
    if (!accept(u, input.code)) throw new TRPCError({ code: "BAD_REQUEST", message: "That code is not right." });
    await people().user.update({
      where: { id: ctx.userId },
      data: { totpEnabledAt: null, totpSecret: null, totpLastStep: null, totpRecovery: [] },
    });
    await audit(ctx.db, ctx.orgId, { actorId: ctx.userId, action: "security.twoStepOff", entity: "User", entityId: ctx.userId, after: { enabled: false } });
    return { ok: true };
  }),

  /** Where you are signed in. */
  sessions: orgProcedure.query(async ({ ctx }) => {
    const rows = await people().session.findMany({
      where: { userId: ctx.userId, expires: { gt: new Date() } },
      orderBy: { lastActiveAt: "desc" },
      select: { id: true, createdAt: true, lastActiveAt: true, ip: true, userAgent: true, secondFactorAt: true },
    });
    return rows.map((r) => ({
      id: r.id, createdAt: r.createdAt, lastActiveAt: r.lastActiveAt, ip: r.ip,
      device: describeDevice(r.userAgent),
      current: r.id === ctx.session!.sid,
      passedSecondStep: r.secondFactorAt !== null,
    }));
  }),

  signOut: orgProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    // `userId` in the filter: a session id from somebody else's list signs out nobody.
    const { count } = await people().session.deleteMany({ where: { id: input.id, userId: ctx.userId } });
    if (count) await audit(ctx.db, ctx.orgId, { actorId: ctx.userId, action: "security.signOut", entity: "Session", entityId: input.id, after: { count } });
    return { count };
  }),

  signOutOthers: orgProcedure.mutation(async ({ ctx }) => {
    const { count } = await people().session.deleteMany({
      where: { userId: ctx.userId, ...(ctx.session!.sid ? { id: { not: ctx.session!.sid } } : {}) },
    });
    await audit(ctx.db, ctx.orgId, { actorId: ctx.userId, action: "security.signOutOthers", entity: "User", entityId: ctx.userId, after: { count } });
    return { count };
  }),
});

/** "Chrome on Mac", "Safari on iPhone" — enough to recognise a device, no more. */
export function describeDevice(ua: string | null): string {
  if (!ua) return "A device not seen since this list began";
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "A browser";
  const os = /iPhone/.test(ua) ? "iPhone" : /iPad/.test(ua) ? "iPad" : /Android/.test(ua) ? "Android" : /Mac OS X/.test(ua) ? "Mac" : /Windows/.test(ua) ? "Windows" : /Linux/.test(ua) ? "Linux" : "an unknown system";
  return `${browser} on ${os}`;
}
