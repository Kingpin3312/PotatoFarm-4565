import { crossTenant } from "@/server/db/client";
import { sendPush } from "./push";
import { inQuietHours } from "./rules";

/**
 * The morning digest, which `dispatch.ts` has always claimed exists.
 *
 * When a notification lands inside somebody's quiet hours, dispatch
 * writes the row with `suppressed: "held for quiet hours"`, does not
 * push, and says in a comment:
 *
 *     // Held rather than dropped. It goes out with the morning digest,
 *     // so nothing is lost — it just does not wake anybody.
 *
 * **There was no morning digest.** Nothing anywhere read `suppressed`,
 * no job was registered, and a held notification sat in a table until
 * the agent happened to open a screen. "Nothing is lost" was true only
 * in the sense that the row still existed.
 *
 * It had never bitten anyone, for the reason the rest of this work
 * exists: nothing could write a `NotificationPrefs` row, so no agent
 * ever had quiet hours, so nothing was ever held. The comment described
 * a path that could not be reached. Making quiet hours settable is what
 * makes this file necessary — a feature that starts holding messages
 * needs the thing that lets them go.
 *
 * ## Why one message rather than each held one
 *
 * An agent with quiet hours from 22:00 has, by 07:00, potentially
 * eleven held notifications. Sending eleven pushes at seven in the
 * morning is worse than sending none at ten at night — it is the exact
 * failure `expiry.ts` groups per recipient to avoid, and the one that
 * teaches somebody to turn the whole thing off.
 *
 * So: one push per person, saying how many and naming the worst.
 */

/** Cheapest wording that is still true for one item. */
function headline(count: number, first: { title: string }) {
  return count === 1 ? first.title : `${count} things happened overnight`;
}

/**
 * Release everything held for people who are no longer quiet.
 *
 * Run hourly rather than at a fixed hour, because quiet hours are per
 * agent and per brokerage timezone — a single 07:00 job would be right
 * for one person and wrong for everybody who set anything else. The
 * check is "is this person quiet *now*", which is the same question
 * dispatch asked when it held the message, asked again later.
 */
export async function releaseHeld(now = new Date()) {
  const held = await crossTenant("sweep").notification.findMany({
    where: {
      suppressed: { not: null },
      // Never acted on and never read: if the agent has already opened
      // it in the app, pushing it in the morning tells them something
      // they know.
      actedAt: null,
      readAt: null,
      // A week is the limit. A notification held longer than that is
      // about something nobody acted on for a week, and waking somebody
      // for it now is noise rather than news.
      sentAt: { gte: new Date(now.getTime() - 7 * 86_400_000) },
    },
    select: {
      id: true, orgId: true, userId: true, title: true, deeplink: true, sentAt: true,
    },
    orderBy: { sentAt: "asc" },
  });

  if (held.length === 0) return { people: 0, released: 0 };

  // Grouped per person, and per org within that — an agent working
  // across two brokerages gets one message about each rather than one
  // muddled message about both.
  const groups = new Map<string, typeof held>();
  for (const n of held) {
    const key = `${n.orgId}:${n.userId}`;
    groups.set(key, [...(groups.get(key) ?? []), n]);
  }

  const orgTz = new Map<string, string>();
  let people = 0;
  let released = 0;

  for (const [key, items] of groups) {
    const [orgId, userId] = key.split(":") as [string, string];

    if (!orgTz.has(orgId)) {
      const org = await crossTenant("sweep").organisation.findUnique({
        where: { id: orgId }, select: { timezone: true },
      });
      orgTz.set(orgId, org?.timezone ?? "Asia/Dubai");
    }

    const prefs = await crossTenant("sweep").notificationPrefs.findUnique({
      where: { orgId_userId: { orgId, userId } },
    });

    // No row means no quiet hours, which means these were held under
    // preferences that have since been cleared. Release them.
    const stillQuiet = prefs
      ? inQuietHours(now, prefs, orgTz.get(orgId)!)
      : false;
    if (stillQuiet) continue;

    // Push switched off entirely is a decision, not a quiet period. The
    // rows are still cleared so they do not accumulate for ever, but
    // nothing is sent.
    if (prefs && !prefs.push) {
      await clear(items.map((i) => i.id));
      released += items.length;
      continue;
    }

    const first = items[items.length - 1]!;   // the most recent
    await sendPush(userId, {
      title: headline(items.length, first),
      body: items.length === 1
        ? "Held while you were off. "
        : `Oldest is from ${hoursAgo(items[0]!.sentAt, now)}.`,
      // One item deep-links to the thing; several link to the list,
      // because picking one of eleven for somebody is a guess.
      deeplink: items.length === 1 ? first.deeplink : "/today",
      urgent: false,
    });

    await clear(items.map((i) => i.id));
    people += 1;
    released += items.length;
  }

  return { people, released };
}

/**
 * Clearing `suppressed` is what stops a digest repeating.
 *
 * `sentAt` is deliberately not touched: it is when the thing happened,
 * and moving it to now would make an overnight lead look like it
 * arrived at breakfast.
 */
async function clear(ids: string[]) {
  await crossTenant("sweep").notification.updateMany({
    where: { id: { in: ids } },
    data: { suppressed: null },
  });
}

function hoursAgo(then: Date, now: Date) {
  const h = Math.round((now.getTime() - then.getTime()) / 3_600_000);
  if (h < 1) return "under an hour ago";
  if (h < 24) return `${h} hours ago`;
  return `${Math.round(h / 24)} days ago`;
}
