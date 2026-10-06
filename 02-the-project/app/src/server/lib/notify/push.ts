import { crossTenant } from "@/server/db/client";
import { log } from "@/lib/log";
import { pushEndpointProblem, sendWeb } from "./web-push";

/**
 * Push notifications.
 *
 * This is the reason the mobile app exists. Everything else on it could
 * be a web page — an agent between viewings needs a phone that buzzes
 * when a qualified lead lands, and a browser cannot do that reliably on
 * iOS.
 *
 * Two failure modes worth designing for, because both are silent:
 *
 * 1. **Dead tokens.** A wiped phone, an uninstalled app, an expired
 *    token — the send is accepted and delivered nowhere. Left alone, a
 *    brokerage's notifications quietly stop and everyone assumes it went
 *    quiet because nothing is happening.
 * 2. **The last device.** If every device for a user is dead, push is not
 *    degraded, it is off. That is worth knowing rather than discovering
 *    when somebody misses a lead.
 */

const EXPO_URL = "https://exp.host/--/api/v2/push/send";

type Msg = { title: string; body: string; deeplink: string; urgent?: boolean };

/**
 * Every working device a person has, by both routes.
 *
 * A browser subscription counts only while the sign-in it was made under
 * is alive. The browser outlives the person: on a shared phone, or a lost
 * one, "signed out" has to mean "stops buzzing" as well, and the session
 * is the thing an agent can end from any other device (Settings →
 * Security → Sign out the other devices). A subscription whose session
 * has gone is marked failed rather than deleted, so turning alerts on
 * again on the same phone is a refresh, not a first install.
 */
async function devicesFor(userId: string) {
  const db = crossTenant("sweep");
  const all = await db.pushDevice.findMany({
    where: { userId, failedAt: null },
    select: { id: true, token: true, platform: true, p256dh: true, auth: true, sessionId: true },
  });
  const web = all.filter((d) => d.platform === "WEB");
  const ids = [...new Set(web.map((d) => d.sessionId).filter((x): x is string => !!x))];
  const live = new Set(
    ids.length
      ? (await db.session.findMany({
          where: { id: { in: ids }, userId, expires: { gt: new Date() } },
          select: { id: true },
        })).map((s) => s.id)
      : [],
  );
  const signedOut = web.filter((d) => !d.sessionId || !live.has(d.sessionId));
  if (signedOut.length) {
    await db.pushDevice.updateMany({
      where: { id: { in: signedOut.map((d) => d.id) } },
      data: { failedAt: new Date(), failReason: "signed out on this device" },
    });
  }
  return {
    expo: all.filter((d) => d.platform !== "WEB"),
    web: web.filter((d) => d.sessionId && live.has(d.sessionId)),
  };
}

export async function sendPush(userId: string, msg: Msg) {
  const { expo, web } = await devicesFor(userId);

  if (!expo.length && !web.length) {
    // Not an error, but not nothing either. An agent with no working
    // device is an agent who will not hear about a lead.
    log.warn("no working push device", { userId });
    return { sent: 0, noDevice: true };
  }

  const [viaExpo, viaWeb] = await Promise.all([
    expo.length ? sendExpo(expo, msg) : 0,
    web.length ? sendBrowsers(web, msg) : 0,
  ]);
  return { sent: viaExpo + viaWeb };
}

/** Browsers, one request each; a dead one is marked so it stops counting. */
async function sendBrowsers(
  devices: { id: string; token: string; p256dh: string | null; auth: string | null }[],
  msg: Msg,
) {
  const results = await Promise.all(devices.map((d) =>
    sendWeb(d, { title: msg.title, body: msg.body, url: msg.deeplink, urgent: !!msg.urgent })));
  await Promise.all(results.map((r, i) => {
    const d = devices[i]!;
    return crossTenant("sweep").pushDevice.update({
      where: { id: d.id },
      data: r.ok
        ? { lastSeenAt: new Date(), failReason: null }
        : r.gone
          ? { failedAt: new Date(), failReason: r.reason }
          : { failReason: r.reason },
    });
  }));
  const failed = results.filter((r) => !r.ok);
  if (failed.length) {
    log.warn("web push not delivered", {}, {
      count: failed.length,
      reasons: [...new Set(failed.map((r) => (r.ok ? "" : r.reason)))],
    });
  }
  return results.filter((r) => r.ok).length;
}

async function sendExpo(devices: { id: string; token: string }[], msg: Msg) {
  const res = await fetch(EXPO_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(
      devices.map((d) => ({
        to: d.token,
        title: msg.title,
        body: msg.body,
        data: { deeplink: msg.deeplink },
        // High priority wakes the device; normal batches with the next
        // delivery. Reserved for the two urgent kinds so it keeps working.
        priority: msg.urgent ? "high" : "normal",
        sound: msg.urgent ? "default" : null,
        // iOS shows this on the lock screen. A lead's name never goes in
        // the title — a locked phone on a table is a screen anyone can read.
        channelId: msg.urgent ? "urgent" : "default",
      }))
    ),
    signal: AbortSignal.timeout(10_000),
  });

  const result = await res.json();

  // Expo returns a per-token receipt. A DeviceNotRegistered means the
  // token is gone for good and must not be retried.
  const tickets: { status: string; details?: { error?: string } }[] = result.data ?? [];
  await Promise.all(
    tickets.map((t, i) => {
      if (t.status === "ok") return null;
      // Expo returns one ticket per device in order, but a short reply
      // would silently update the wrong row. Skipping is safer than
      // marking somebody else's device dead.
      const device = devices[i];
      if (!device) return null;
      const fatal = t.details?.error === "DeviceNotRegistered";
      return crossTenant("sweep").pushDevice.update({
        where: { id: device.id },
        data: fatal
          ? { failedAt: new Date(), failReason: t.details?.error }
          : { failReason: t.details?.error ?? "unknown" },
      });
    })
  );

  return tickets.filter((t) => t.status === "ok").length;
}

/** Registration. Called on every app launch, not just the first. */
export async function registerDevice(args: {
  orgId: string; userId: string; token: string;
  platform: "IOS" | "ANDROID"; appVersion?: string;
}) {
  return crossTenant("sweep").pushDevice.upsert({
    where: { token: args.token },
    create: args,
    // A token that comes back after a reinstall clears its failure.
    update: {
      orgId: args.orgId, userId: args.userId,
      appVersion: args.appVersion, lastSeenAt: new Date(),
      failedAt: null, failReason: null,
    },
  });
}

/** The most browsers one person keeps alerts on. Old ones drop off. */
const MAX_BROWSERS = 10;

/**
 * Alerts on, in this browser, for this person and this sign-in.
 *
 * An endpoint already registered to somebody else moves to whoever just
 * turned alerts on here: it is one browser, and the person holding it
 * has just said so. The previous person's alerts stop reaching it, which
 * is what a handed-on phone should do.
 */
export async function registerBrowser(args: {
  orgId: string; userId: string; sessionId: string;
  endpoint: string; p256dh: string; auth: string; label: string;
}) {
  const problem = pushEndpointProblem(args.endpoint);
  if (problem) return { ok: false as const, problem };
  const db = crossTenant("sweep");
  const fields = {
    orgId: args.orgId, userId: args.userId, sessionId: args.sessionId,
    p256dh: args.p256dh, auth: args.auth, label: args.label,
    lastSeenAt: new Date(), failedAt: null, failReason: null,
  };
  await db.pushDevice.upsert({
    where: { token: args.endpoint },
    create: { ...fields, token: args.endpoint, platform: "WEB", provider: "webpush" },
    update: fields,
  });
  // One sign-in is one browser, and a browser has one subscription. A
  // new one from the same sign-in replaces the old (the browser renewed
  // it, or alerts were turned off and on), so the list never shows two
  // "This phone" rows, one of them dead.
  await db.pushDevice.deleteMany({
    where: { userId: args.userId, platform: "WEB", sessionId: args.sessionId, token: { not: args.endpoint } },
  });
  const mine = await db.pushDevice.findMany({
    where: { userId: args.userId, platform: "WEB" },
    orderBy: { lastSeenAt: "desc" }, select: { id: true },
  });
  if (mine.length > MAX_BROWSERS) {
    await db.pushDevice.deleteMany({ where: { id: { in: mine.slice(MAX_BROWSERS).map((d) => d.id) } } });
  }
  return { ok: true as const };
}

/**
 * Keeps an existing subscription tied to the current sign-in, on every
 * app open. Only ever for the person who turned it on: somebody else
 * signing in on the same phone does not inherit its alerts without
 * choosing them.
 */
export async function refreshBrowser(args: { userId: string; sessionId: string; endpoint: string }) {
  const { count } = await crossTenant("sweep").pushDevice.updateMany({
    where: { token: args.endpoint, userId: args.userId, platform: "WEB" },
    data: { sessionId: args.sessionId, lastSeenAt: new Date(), failedAt: null, failReason: null },
  });
  return { known: count > 0 };
}

/** Alerts off for one browser, or one device from the list. Own rows only. */
export async function forgetBrowser(args: { userId: string; endpoint?: string; id?: string }) {
  if (!args.endpoint && !args.id) return { removed: 0 };
  const { count } = await crossTenant("sweep").pushDevice.deleteMany({
    where: {
      userId: args.userId,
      platform: "WEB",
      ...(args.endpoint ? { token: args.endpoint } : { id: args.id }),
    },
  });
  return { removed: count };
}

/** What an agent sees in their list. Never the endpoint or the keys. */
export async function browsersOf(userId: string, sessionId: string | null) {
  const rows = await crossTenant("sweep").pushDevice.findMany({
    where: { userId, platform: "WEB" },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, label: true, lastSeenAt: true, failedAt: true, failReason: true, sessionId: true },
  });
  // Read the sign-ins now rather than wait for the next alert to find
  // out: a phone signed out from Settings → Security an hour ago should
  // not still say "Receiving" because nothing has been sent since.
  const ids = [...new Set(rows.map((r) => r.sessionId).filter((x): x is string => !!x))];
  const live = new Set(ids.length
    ? (await crossTenant("sweep").session.findMany({
        where: { id: { in: ids }, userId, expires: { gt: new Date() } }, select: { id: true },
      })).map((x) => x.id)
    : []);
  return rows.map((r) => {
    const signedOut = !r.failedAt && (!r.sessionId || !live.has(r.sessionId));
    return {
      id: r.id,
      label: r.label ?? "A browser",
      lastSeenAt: r.lastSeenAt,
      working: !r.failedAt && !signedOut,
      why: r.failedAt ? r.failReason : signedOut ? "signed out on this device" : null,
      thisSignIn: !!sessionId && r.sessionId === sessionId,
    };
  });
}
