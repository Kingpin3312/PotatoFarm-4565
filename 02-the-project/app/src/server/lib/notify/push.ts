import { crossTenant } from "@/server/db/client";
import { log } from "@/lib/log";

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

export async function sendPush(userId: string, msg: {
  title: string; body: string; deeplink: string; urgent?: boolean;
}) {
  const devices = await crossTenant("sweep").pushDevice.findMany({
    where: { userId, failedAt: null },
    select: { id: true, token: true, platform: true },
  });

  if (!devices.length) {
    // Not an error, but not nothing either. An agent with no working
    // device is an agent who will not hear about a lead.
    log.warn("no working push device", { userId });
    return { sent: 0, noDevice: true };
  }

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
      const fatal = t.details?.error === "DeviceNotRegistered";
      return crossTenant("sweep").pushDevice.update({
        where: { id: devices[i].id },
        data: fatal
          ? { failedAt: new Date(), failReason: t.details?.error }
          : { failReason: t.details?.error ?? "unknown" },
      });
    })
  );

  return { sent: tickets.filter((t) => t.status === "ok").length };
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
