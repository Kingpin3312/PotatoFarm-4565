import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import * as SecureStore from "expo-secure-store";

/**
 * Signing in on a phone.
 *
 * The web app uses a one-time email link, which is the right choice
 * there. On mobile it is genuinely awkward: the link opens in the mail
 * app's browser, authenticates a session that belongs to that browser,
 * and the app is none the wiser. Users end up signed in somewhere they
 * did not want and signed out where they did.
 *
 * The fix is an **app link** — a universal link on iOS, an app link on
 * Android — so the operating system hands the URL to the app rather than
 * to a browser. It needs a verified domain association file on the site,
 * which is worth setting up properly because the fallback experience is
 * bad enough that people give up on the app.
 *
 * `openAuthSessionAsync` is used rather than a plain browser open so the
 * flow returns to the app on completion, and so the session cookie lives
 * in an ephemeral browser rather than the user's Safari.
 */
const RETURN_URL = Linking.createURL("/auth/callback");

export async function signIn(email: string) {
  const url = `${process.env.EXPO_PUBLIC_APP_URL}/sign-in?email=${encodeURIComponent(email)}&return=${encodeURIComponent(RETURN_URL)}`;

  const result = await WebBrowser.openAuthSessionAsync(url, RETURN_URL);
  if (result.type !== "success") return { ok: false as const };

  const token = Linking.parse(result.url).queryParams?.session as string | undefined;
  if (!token) return { ok: false as const };

  // Keychain on iOS, Keystore on Android. Never AsyncStorage — that is
  // plain text on a rooted device, and this token reaches a brokerage's
  // entire client list.
  await SecureStore.setItemAsync("session", token, {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });

  return { ok: true as const };
}

export async function signOut() {
  await SecureStore.deleteItemAsync("session");
  // The device row is left in place rather than deleted, so a token that
  // is still valid is not orphaned and pushed to after sign-out.
}

export const getSession = () => SecureStore.getItemAsync("session");
