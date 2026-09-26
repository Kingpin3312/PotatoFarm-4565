import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { endpoint } from "@/server/lib/loopback";

/**
 * Google and Microsoft: where to send the person, how to turn the code
 * they come back with into tokens, how to keep those tokens alive, and
 * how to read new mail. Everything provider-shaped lives here, once.
 *
 * **Read-only, and headers only.** The scopes ask to read mail and
 * nothing else — `sync.ts` keeps a subject, a snippet and who it was
 * between, and only for people the brokerage already knows.
 *
 * **Loopback overrides, as for Meta.** `GOOGLE_OAUTH_BASE` and
 * `MICROSOFT_OAUTH_BASE` move every call for that provider to one local
 * stand-in, so `check:email-connect` can drive the whole handshake and a
 * sync end to end. Only a loopback address is honoured (`endpoint`).
 */
export type Provider = "GOOGLE" | "MICROSOFT";

type Urls = { authorize: string; tokenUrl: string; identity: string; api: string };

function urls(p: Provider): Urls {
  if (p === "GOOGLE") {
    const base = endpoint("GOOGLE_OAUTH_BASE", "");
    return base
      ? { authorize: `${base}/o/oauth2/v2/auth`, tokenUrl: `${base}/token`, identity: `${base}/userinfo`, api: `${base}/gmail/v1/users/me` }
      : {
          authorize: "https://accounts.google.com/o/oauth2/v2/auth",
          tokenUrl: "https://oauth2.googleapis.com/token",
          identity: "https://openidconnect.googleapis.com/v1/userinfo",
          api: "https://gmail.googleapis.com/gmail/v1/users/me",
        };
  }
  const base = endpoint("MICROSOFT_OAUTH_BASE", "");
  return base
    ? { authorize: `${base}/authorize`, tokenUrl: `${base}/token`, identity: `${base}/v1.0/me`, api: `${base}/v1.0/me` }
    : {
        authorize: "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
        tokenUrl: "https://login.microsoftonline.com/common/oauth2/v2.0/token",
        identity: "https://graph.microsoft.com/v1.0/me",
        api: "https://graph.microsoft.com/v1.0/me",
      };
}

const SCOPES: Record<Provider, string> = {
  GOOGLE: "openid email https://www.googleapis.com/auth/gmail.readonly",
  MICROSOFT: "offline_access openid email User.Read Mail.Read",
};

function client(p: Provider) {
  const id = p === "GOOGLE" ? process.env.GOOGLE_CLIENT_ID : process.env.MICROSOFT_CLIENT_ID;
  const secret = p === "GOOGLE" ? process.env.GOOGLE_CLIENT_SECRET : process.env.MICROSOFT_CLIENT_SECRET;
  return id && secret ? { id, secret } : null;
}

/** Whether a brokerage can connect this provider here, for the screen to say. */
export function configured(p: Provider): boolean {
  return client(p) !== null;
}

export function redirectUri(origin: string, p: Provider) {
  return `${(process.env.NEXT_PUBLIC_APP_URL || origin).replace(/\/+$/, "")}/api/oauth/${p.toLowerCase()}/callback`;
}

/* ------------------------------ state ------------------------------ */

/**
 * The `state` parameter, signed.
 *
 * It carries who started the connection and for which brokerage, and
 * the callback refuses it unless the person finishing is the person who
 * started — otherwise a link crafted by somebody else could attach
 * *their* mailbox to *your* account, and your clients' mail would sync
 * into a timeline they can read. Ten minutes, like the sign-in link.
 */
type State = { u: string; o: string; p: Provider; n: string; exp: number };

function key() {
  const k = process.env.AUTH_SECRET;
  if (!k) throw new Error("AUTH_SECRET is not set, so a mailbox connection cannot be signed.");
  return k;
}

export function signState(s: Omit<State, "n" | "exp">): string {
  const body = Buffer.from(JSON.stringify({ ...s, n: randomBytes(12).toString("hex"), exp: Date.now() + 10 * 60_000 })).toString("base64url");
  const mac = createHmac("sha256", key()).update(body).digest("base64url");
  return `${body}.${mac}`;
}

export function readState(raw: string | null): State | null {
  if (!raw) return null;
  const [body, mac] = raw.split(".");
  if (!body || !mac) return null;
  const want = createHmac("sha256", key()).update(body).digest("base64url");
  if (want.length !== mac.length || !timingSafeEqual(Buffer.from(want), Buffer.from(mac))) return null;
  try {
    const s = JSON.parse(Buffer.from(body, "base64url").toString()) as State;
    return s.exp > Date.now() ? s : null;
  } catch { return null; }
}

/* ------------------------------ tokens ----------------------------- */

export type Tokens = { accessToken: string; refreshToken: string; expiresAt: number };

export function authorizeUrl(p: Provider, origin: string, state: string): string {
  const c = client(p);
  if (!c) throw new Error(`${p === "GOOGLE" ? "Google" : "Microsoft"} is not set up on this installation.`);
  const q = new URLSearchParams({
    client_id: c.id, redirect_uri: redirectUri(origin, p), response_type: "code", scope: SCOPES[p], state,
    // Google only returns a refresh token with offline access and a
    // consent prompt; without one the mailbox stops syncing in an hour.
    ...(p === "GOOGLE" ? { access_type: "offline", prompt: "consent" } : { prompt: "select_account" }),
  });
  return `${urls(p).authorize}?${q}`;
}

async function tokenCall(p: Provider, params: Record<string, string>) {
  const c = client(p);
  if (!c) throw new Error("not configured");
  const res = await fetch(urls(p).tokenUrl, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: c.id, client_secret: c.secret, ...params }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = await res.json().catch(() => ({})) as Record<string, unknown>;
  if (!res.ok) throw new TokenError(String(body.error ?? res.status));
  return body;
}

export class TokenError extends Error {
  constructor(public code: string) { super(`token refused: ${code}`); }
}

export async function exchangeCode(p: Provider, origin: string, code: string): Promise<Tokens> {
  const b = await tokenCall(p, { grant_type: "authorization_code", code, redirect_uri: redirectUri(origin, p) });
  if (!b.refresh_token) throw new TokenError("no_refresh_token");
  return { accessToken: String(b.access_token), refreshToken: String(b.refresh_token), expiresAt: Date.now() + Number(b.expires_in ?? 3600) * 1000 };
}

/**
 * A fresh access token from the refresh token. Both providers' access
 * tokens last about an hour; the refresh token is what is kept. Microsoft
 * rotates it on every use, so the new one is returned to be stored.
 */
export async function refresh(p: Provider, t: Tokens): Promise<Tokens> {
  const b = await tokenCall(p, { grant_type: "refresh_token", refresh_token: t.refreshToken });
  return {
    accessToken: String(b.access_token),
    refreshToken: b.refresh_token ? String(b.refresh_token) : t.refreshToken,
    expiresAt: Date.now() + Number(b.expires_in ?? 3600) * 1000,
  };
}

/** The address of the mailbox that was just connected. */
export async function mailboxAddress(p: Provider, accessToken: string): Promise<string> {
  const res = await fetch(urls(p).identity, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`could not read the mailbox address (${res.status})`);
  const b = await res.json() as Record<string, unknown>;
  const addr = p === "GOOGLE" ? b.email : (b.mail ?? b.userPrincipalName);
  if (!addr) throw new Error("the provider did not say which mailbox this is");
  return String(addr).toLowerCase();
}

/* ------------------------------ reading ---------------------------- */

export type Raw = {
  id: string; threadId: string; from: string; to: string[];
  subject?: string; snippet?: string; sentAt: Date; webLink?: string;
};

const PER_SYNC = 100;

async function get(url: string, token: string) {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(20_000) });
  if (res.status === 401) throw new TokenError("unauthorized");
  return res;
}

/** "Priya Nair <priya@x.com>, b@y.com" → ["priya@x.com", "b@y.com"] */
export function addresses(header: string | undefined): string[] {
  if (!header) return [];
  return header.split(",").map((part) => {
    const m = part.match(/<([^>]+)>/);
    return (m ? m[1]! : part).trim().toLowerCase();
  }).filter((a) => a.includes("@"));
}

/**
 * New mail since the cursor.
 *
 * Microsoft's `$delta` returns the messages themselves. Gmail's history
 * returns only ids, so each is fetched with its headers — metadata only,
 * never the body. With no cursor yet, Gmail starts from the last thirty
 * days and the mailbox's current history id; a cursor Gmail no longer
 * recognises (it keeps about a week) starts again the same way rather
 * than stopping for ever.
 */
export async function fetchNew(p: Provider, token: string, cursor: string | null): Promise<{ messages: Raw[]; cursor: string }> {
  const u = urls(p);
  if (p === "MICROSOFT") {
    // The saved cursor is a URL Microsoft handed back. It is followed only
    // if it is on Microsoft's own API — the request carries the mailbox's
    // token, and a stored link pointing anywhere else would send it there.
    const fromMicrosoft = cursor && cursor.startsWith(`${u.api}/`) ? cursor : null;
    const url = fromMicrosoft ?? `${u.api}/messages/delta?$select=subject,from,toRecipients,bodyPreview,sentDateTime,webLink,conversationId`;
    const res = await get(url, token);
    if (!res.ok) throw new Error(`MICROSOFT ${res.status}`);
    const b = await res.json() as Record<string, unknown>;
    const items = (b.value ?? []) as Record<string, any>[];
    return {
      messages: items.map((m) => ({
        id: String(m.id), threadId: String(m.conversationId ?? m.id),
        from: String(m.from?.emailAddress?.address ?? "").toLowerCase(),
        to: ((m.toRecipients ?? []) as any[]).map((r) => String(r.emailAddress?.address ?? "").toLowerCase()).filter(Boolean),
        subject: m.subject, snippet: m.bodyPreview, sentAt: new Date(String(m.sentDateTime)), webLink: m.webLink,
      })),
      cursor: String(b["@odata.deltaLink"] ?? b["@odata.nextLink"] ?? cursor ?? ""),
    };
  }

  let ids: string[] = [];
  let next: string;
  const fresh = async () => {
    const profile = await get(`${u.api}/profile`, token);
    if (!profile.ok) throw new Error(`GOOGLE ${profile.status}`);
    const historyId = String(((await profile.json()) as { historyId: string }).historyId);
    const list = await get(`${u.api}/messages?q=${encodeURIComponent("newer_than:30d")}&maxResults=${PER_SYNC}`, token);
    if (!list.ok) throw new Error(`GOOGLE ${list.status}`);
    const b = await list.json() as { messages?: { id: string }[] };
    return { ids: (b.messages ?? []).map((m) => m.id), next: historyId };
  };
  if (!cursor) {
    ({ ids, next } = await fresh());
  } else {
    const res = await get(`${u.api}/history?startHistoryId=${encodeURIComponent(cursor)}&historyTypes=messageAdded`, token);
    if (res.status === 404) {
      ({ ids, next } = await fresh());
    } else {
      if (!res.ok) throw new Error(`GOOGLE ${res.status}`);
      const b = await res.json() as { history?: { messagesAdded?: { message: { id: string } }[] }[]; historyId?: string };
      ids = [...new Set((b.history ?? []).flatMap((h) => (h.messagesAdded ?? []).map((a) => a.message.id)))];
      next = String(b.historyId ?? cursor);
    }
  }

  const messages: Raw[] = [];
  for (const id of ids.slice(0, PER_SYNC)) {
    const res = await get(`${u.api}/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject`, token);
    if (!res.ok) continue;
    const m = await res.json() as { id: string; threadId: string; snippet?: string; internalDate?: string; payload?: { headers?: { name: string; value: string }[] } };
    const h = (n: string) => m.payload?.headers?.find((x) => x.name.toLowerCase() === n)?.value;
    messages.push({
      id: m.id, threadId: m.threadId,
      from: addresses(h("from"))[0] ?? "",
      to: addresses(h("to")),
      subject: h("subject"), snippet: m.snippet,
      sentAt: new Date(Number(m.internalDate ?? Date.now())),
      webLink: `https://mail.google.com/mail/u/0/#all/${m.threadId}`,
    });
  }
  return { messages, cursor: next };
}
