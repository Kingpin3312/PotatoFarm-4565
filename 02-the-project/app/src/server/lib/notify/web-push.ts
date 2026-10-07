/**
 * Web Push: alerts to the installed web app, by the standard every
 * browser speaks (RFC 8030 delivery, RFC 8291 encryption, RFC 8292
 * VAPID signing).
 *
 * ## Why this exists
 *
 * Phone alerts were built for the Expo app, which cannot build, so no
 * phone has ever been registered and no alert has ever reached one. The
 * web app already installs to the home screen; this gives it the one
 * thing a browser tab could not do, which is buzz a phone in a pocket.
 * Android does it in any browser; an iPhone does it (iOS 16.4 and later)
 * once the app has been added to the Home Screen.
 *
 * ## Three rules this file keeps
 *
 * **The address is checked, every time.** A subscription's endpoint is a
 * URL the browser hands us, and this server then POSTs to it. Unchecked,
 * that is a way to make the server call anything it can reach — the
 * metadata service, the database's admin port, a colleague's laptop. So
 * it must be https, on the default port, with no credentials, on one of
 * the push services browsers actually use. Checked on registration and
 * again before every send, because a row can outlive the code that
 * accepted it.
 *
 * **The push service cannot read it.** The payload is encrypted to keys
 * only the browser holds, so Google, Apple and Mozilla carry a lead's
 * name without seeing it. That is the protocol, not an option.
 *
 * **A dead subscription is said to be dead.** 404 and 410 mean the
 * browser has dropped it (uninstalled, cleared, permission revoked) and
 * it must not be retried; anything else is recorded and tried again
 * next time. A brokerage whose alerts quietly stopped is the failure
 * this whole subsystem exists to prevent.
 */

/** The push services browsers use. Anything else is refused. */
const PUSH_HOSTS: RegExp[] = [
  /^fcm\.googleapis\.com$/,                 // Chrome, Edge, Android
  /^android\.googleapis\.com$/,             // older Chrome subscriptions
  /^updates\.push\.services\.mozilla\.com$/, // Firefox
  /^web\.push\.apple\.com$/,                // Safari, iPhone home-screen apps
  /^[a-z0-9-]+\.push\.apple\.com$/,
  /^[a-z0-9-]+\.notify\.windows\.com$/,     // Edge on Windows (WNS)
];

/**
 * A local stand-in push service, for the check suite only.
 *
 * Honoured only outside production and only as one exact origin, so a
 * misconfigured deployment cannot widen the allowlist; `preflight` fails
 * a production environment that sets it at all.
 */
function testOrigin(): string | null {
  if (process.env.NODE_ENV === "production") return null;
  const o = (process.env.PUSH_TEST_ORIGIN ?? "").trim();
  return o || null;
}

/** Why this endpoint may not be used, or null if it may. */
export function pushEndpointProblem(endpoint: string): string | null {
  let u: URL;
  try { u = new URL(endpoint); } catch { return "not a URL"; }
  const local = testOrigin();
  if (local && u.origin === local) return null;
  if (u.protocol !== "https:") return "not https";
  if (u.username || u.password) return "carries credentials";
  if (u.port && u.port !== "443") return "not the default port";
  if (!PUSH_HOSTS.some((h) => h.test(u.hostname))) return "not a known push service";
  return null;
}

type Vapid = { publicKey: string; privateKey: string; subject: string };

/**
 * The server's signing keys, or null when web push is not set up.
 *
 * Generated once per deployment (`npx web-push generate-vapid-keys`) and
 * never rotated casually: every subscription is bound to the public key
 * it was made with, and a new key silently orphans all of them until
 * each agent opens the app again.
 */
export function vapidKeys(): Vapid | null {
  const publicKey = (process.env.VAPID_PUBLIC_KEY ?? "").trim();
  const privateKey = (process.env.VAPID_PRIVATE_KEY ?? "").trim();
  const subject = (process.env.VAPID_SUBJECT ?? "").trim() || "mailto:hello@potatofarm.io";
  if (!publicKey || !privateKey) return null;
  return { publicKey, privateKey, subject };
}

export type WebDevice = { token: string; p256dh: string | null; auth: string | null };
export type WebMessage = { title: string; body: string; url: string; urgent: boolean };
export type WebResult = { ok: true } | { ok: false; gone: boolean; reason: string };

/**
 * What the notification carries. Short, because a push payload has a
 * hard limit near 4KB after encryption, and because a lock screen shows
 * two lines anyway. The full thing is one tap away, behind sign-in.
 */
export function payloadFor(msg: WebMessage) {
  return JSON.stringify({
    title: msg.title.slice(0, 120),
    body: msg.body.slice(0, 400),
    url: msg.url,
    // One notification per thing: a second alert about the same lead
    // replaces the first rather than stacking under it.
    tag: msg.url,
    urgent: msg.urgent,
  });
}

/** Send one alert to one browser. Never throws. */
export async function sendWeb(device: WebDevice, msg: WebMessage): Promise<WebResult> {
  const keys = vapidKeys();
  if (!keys) return { ok: false, gone: false, reason: "web push is not set up" };
  const problem = pushEndpointProblem(device.token);
  // Gone, not retried: an address that fails the check will fail it on
  // every send, and it should drop out of the "working devices" count.
  if (problem) return { ok: false, gone: true, reason: `refused endpoint: ${problem}` };
  if (!device.p256dh || !device.auth) return { ok: false, gone: true, reason: "no encryption keys" };

  // Loaded here, not at the top of the file: everything that touches
  // notifications imports this module (the dispatcher, the digest, a
  // dozen check suites), and almost none of them ever sends to a
  // browser. A top-level import made each of those load a CommonJS
  // library that an ES-module check bundle cannot run, and broke them.
  // `default`, not a named import: the package is CommonJS, and Node can
  // only see the named exports a CommonJS file declares in a shape it
  // recognises. web-push's are not, so a named import came back
  // undefined and every send failed (the check suite caught it).
  const mod = await import("web-push");
  const { generateRequestDetails } = (mod as unknown as { default?: typeof mod }).default ?? mod;
  let req: ReturnType<typeof generateRequestDetails>;
  try {
    req = generateRequestDetails(
      { endpoint: device.token, keys: { p256dh: device.p256dh, auth: device.auth } },
      payloadFor(msg),
      {
        vapidDetails: keys,
        // How long the push service may hold it for a phone that is off.
        // A "lead waiting" alert six hours late is noise; the same alert
        // is on the agent's notification list in the app regardless.
        TTL: msg.urgent ? 4 * 3600 : 24 * 3600,
        urgency: msg.urgent ? "high" : "normal",
        contentEncoding: "aes128gcm",
      },
    );
  } catch (e) {
    // Malformed keys from the browser. It will not get better on retry.
    return { ok: false, gone: true, reason: `could not encrypt: ${(e as Error).message.slice(0, 80)}` };
  }

  try {
    const res = await fetch(req.endpoint, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.body ? new Uint8Array(req.body) : undefined,
      // A push service never redirects; following one would send the
      // request somewhere the allowlist never saw.
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    if (res.status >= 200 && res.status < 300) return { ok: true };
    const gone = res.status === 404 || res.status === 410;
    return { ok: false, gone, reason: `push service answered ${res.status}` };
  } catch (e) {
    return { ok: false, gone: false, reason: `could not reach the push service: ${(e as Error).name}` };
  }
}
