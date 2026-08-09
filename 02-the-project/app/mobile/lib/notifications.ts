import * as Notifications from "expo-notifications";
import { Platform } from "react-native";
import { router } from "expo-router";
import { enqueue } from "./queue";

/**
 * Notification-first replies.
 *
 * The most important file in the mobile app, because the interaction it
 * enables is the one that never opens the app.
 *
 * An agent replies to leads roughly forty times a day. Through the app
 * that is a cold start, an auth check, a fetch, a render, a keyboard
 * animation and then typing — fifteen seconds and five places a weak
 * connection loses them. From the notification it is swipe, type, send.
 *
 * WhatsApp has done this for years. Every agent already replies from
 * their lock screen, to everybody except us.
 */

/** Categories are registered once, at launch, before any push arrives. */
export async function registerCategories() {
  await Notifications.setNotificationCategoryAsync("lead.waiting", [
    {
      identifier: "reply",
      buttonTitle: "Reply",
      // The whole point. `textInput` gives an inline field on the
      // notification itself — iOS on the lock screen, Android in the
      // shade — with no app launch.
      textInput: {
        submitButtonTitle: "Send",
        placeholder: "Reply to this lead…",
      },
      options: { opensAppToForeground: false },
    },
    {
      identifier: "viewing",
      buttonTitle: "Offer a viewing",
      // Opens the app, because choosing a slot needs a screen. Being
      // honest about which actions can be done from a notification and
      // which cannot is what keeps the fast path trustworthy.
      options: { opensAppToForeground: true },
    },
    {
      identifier: "handover",
      buttonTitle: "Pass to a colleague",
      options: { opensAppToForeground: false },
    },
  ]);

  await Notifications.setNotificationCategoryAsync("viewing.outcome", [
    { identifier: "offering",  buttonTitle: "They want to offer", options: { opensAppToForeground: false } },
    { identifier: "interested",buttonTitle: "Interested",         options: { opensAppToForeground: false } },
    { identifier: "not_for_me",buttonTitle: "Not for them",       options: { opensAppToForeground: false } },
  ]);

  if (Platform.OS === "android") {
    // Two channels so a user can silence the routine one and keep the
    // urgent one. One channel makes it all-or-nothing and people choose
    // nothing.
    await Notifications.setNotificationChannelAsync("urgent", {
      name: "Waiting on you",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
    await Notifications.setNotificationChannelAsync("default", {
      name: "Everything else",
      importance: Notifications.AndroidImportance.DEFAULT,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PRIVATE,
    });
  }
}

/**
 * Handling a response.
 *
 * Runs whether or not the app is in the foreground — on iOS it can run
 * with the device still locked, which is exactly the case we are
 * optimising for.
 *
 * Everything here goes through the queue rather than straight to the
 * network. A reply typed on a lock screen in a lift must not be lost
 * because the request failed, and the agent has no way to know it did.
 */
export async function handleResponse(response: Notifications.NotificationResponse) {
  const data = response.notification.request.content.data as {
    kind?: string;
    conversationId?: string;
    viewingId?: string;
    deeplink?: string;
  };
  const action = response.actionIdentifier;

  // Tapped the notification body rather than an action.
  if (action === Notifications.DEFAULT_ACTION_IDENTIFIER) {
    if (data.deeplink) router.push(data.deeplink as never);
    return;
  }

  switch (action) {
    case "reply": {
      const text = (response as { userText?: string }).userText?.trim();
      if (!text || !data.conversationId) return;

      // Queued with the time it was typed, not the time it syncs. An
      // agent who replies at 21:04 in a basement and surfaces at 21:20
      // must show as having replied at 21:04 — otherwise bad signal
      // quietly poisons the response-time reporting the whole product
      // is sold on.
      await enqueue({
        kind: "conversation.send",
        conversationId: data.conversationId,
        body: text,
        // Never queued silently: if the window has closed, this fails
        // loudly on sync and the agent is told. See queue.ts.
        createdAt: new Date().toISOString(),
      });
      return;
    }

    case "handover":
      if (!data.conversationId) return;
      await enqueue({
        kind: "conversation.handover",
        conversationId: data.conversationId,
        reason: "agent_passed_from_notification",
        createdAt: new Date().toISOString(),
      });
      return;

    case "offering":
    case "interested":
    case "not_for_me":
      if (!data.viewingId) return;
      await enqueue({
        kind: "viewing.outcome",
        viewingId: data.viewingId,
        verdict: action.toUpperCase(),
        createdAt: new Date().toISOString(),
      });
      return;

    case "viewing":
      // Needs a screen. Deep-link rather than pretend.
      if (data.conversationId) router.push(`/conversation/${data.conversationId}/viewing` as never);
      return;
  }
}

/**
 * What the notification says.
 *
 * **A lead's name never appears in the title.** A locked phone on a
 * restaurant table is a screen anyone at that table can read, and an
 * agent's phone shows their clients' names to whoever is sitting
 * opposite.
 *
 * The body carries enough to answer without opening anything — that is
 * the entire premise of replying from the lock screen. If the agent has
 * to open the app to know what they are replying to, we have saved
 * nothing.
 */
export function compose(kind: "lead.waiting" | "viewing.outcome", args: {
  lastMessage?: string;
  propertyRef?: string;
  minutesWaiting?: number;
}) {
  if (kind === "lead.waiting") {
    return {
      title: args.minutesWaiting && args.minutesWaiting > 30
        ? `Waiting ${args.minutesWaiting} minutes`
        : "A lead is waiting for a person",
      // Their words, so the agent can answer from the lock screen.
      body: args.lastMessage?.slice(0, 140) ?? "Tap to open",
      categoryIdentifier: "lead.waiting",
    };
  }
  return {
    title: "How did the viewing go?",
    body: args.propertyRef ? `${args.propertyRef} — one tap` : "One tap",
    categoryIdentifier: "viewing.outcome",
  };
}

export function attach() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
  return Notifications.addNotificationResponseReceivedListener(handleResponse);
}
