import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import { Platform } from "react-native";
import { router } from "expo-router";

/**
 * Push registration and routing.
 *
 * Permission is asked for at the moment it makes sense — after the first
 * lead is assigned to them — not on first launch. A permission prompt
 * before somebody understands what the app is for gets denied, and on iOS
 * a denial is close to permanent: they have to go into Settings to undo
 * it, and they will not.
 */
export async function registerForPush() {
  if (!Device.isDevice) return null; // simulators cannot receive push

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return null;

  if (Platform.OS === "android") {
    // Two channels, so a user can silence the routine one and keep the
    // urgent one. One channel means the choice is all or nothing, and
    // people choose nothing.
    await Notifications.setNotificationChannelAsync("urgent", {
      name: "Waiting on you",
      importance: Notifications.AndroidImportance.HIGH,
      sound: "default",
    });
    await Notifications.setNotificationChannelAsync("default", {
      name: "Everything else",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  }

  const token = (await Notifications.getExpoPushTokenAsync()).data;
  return token;
}

/**
 * Tapping a notification goes to the thing itself, never to a list.
 *
 * An agent who taps "Rajesh is waiting for a person" and lands on an
 * inbox they then have to search is an agent who stops tapping.
 */
export function handleNotificationTap(response: Notifications.NotificationResponse) {
  const deeplink = response.notification.request.content.data?.deeplink as string | undefined;
  if (deeplink) router.push(deeplink as never);
}
