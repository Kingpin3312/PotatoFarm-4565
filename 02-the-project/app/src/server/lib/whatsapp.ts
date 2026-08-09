import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * WhatsApp Business Platform.
 *
 * The one rule that shapes this whole file: Meta only allows free-form
 * messages within **24 hours** of the customer's last inbound message.
 * Outside that window the only thing that sends is a pre-approved
 * template. Get it wrong and messages do not bounce loudly — they are
 * accepted and quietly never delivered, which is far worse, because the
 * team keeps working a pipeline that has gone silent.
 */

const GRAPH = "https://graph.facebook.com/v21.0";
const WINDOW_MS = 24 * 60 * 60 * 1000;

export type WindowState = { open: boolean; closesAt: Date | null; hoursLeft: number | null };

/** Single source of truth. The UI and the send path both read this. */
export function messagingWindow(lastInboundAt: Date | null): WindowState {
  if (!lastInboundAt) return { open: false, closesAt: null, hoursLeft: null };
  const closesAt = new Date(lastInboundAt.getTime() + WINDOW_MS);
  const msLeft = closesAt.getTime() - Date.now();
  return {
    open: msLeft > 0,
    closesAt,
    hoursLeft: msLeft > 0 ? Math.floor(msLeft / 3_600_000) : 0,
  };
}

export class WindowClosedError extends Error {
  constructor() {
    // Written for the agent staring at it, not for a log file.
    super("This conversation has been quiet for over 24 hours. WhatsApp only allows an approved template until they reply.");
    this.name = "WindowClosedError";
  }
}

type SendArgs = {
  phoneNumberId: string;
  accessToken: string;
  to: string;
  body: string;
};

export async function sendText({ phoneNumberId, accessToken, to, body }: SendArgs) {
  return post(phoneNumberId, accessToken, {
    messaging_product: "whatsapp",
    recipient_type: "individual",
    to,
    type: "text",
    text: { body, preview_url: false },
  });
}

export async function sendTemplate(args: Omit<SendArgs, "body"> & {
  template: string;
  language: string;
  variables?: string[];
}) {
  return post(args.phoneNumberId, args.accessToken, {
    messaging_product: "whatsapp",
    to: args.to,
    type: "template",
    template: {
      name: args.template,
      language: { code: args.language },
      components: args.variables?.length
        ? [{ type: "body", parameters: args.variables.map((text) => ({ type: "text", text })) }]
        : undefined,
    },
  });
}

async function post(phoneNumberId: string, accessToken: string, payload: unknown) {
  const res = await fetch(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(10_000),
  });

  const data = await res.json();
  if (!res.ok) {
    // Meta's errors are structured and specific. Keep the code — it is the
    // difference between "retry this" and "stop, your token is dead".
    const err = data?.error ?? {};
    throw new WhatsAppError(err.message ?? "Send failed", err.code, err.error_subcode, res.status);
  }
  return { externalId: data.messages?.[0]?.id as string | undefined };
}

export class WhatsAppError extends Error {
  constructor(
    message: string,
    readonly code?: number,
    readonly subcode?: number,
    readonly status?: number
  ) {
    super(message);
    this.name = "WhatsAppError";
  }
  /** 4xx from Meta is a bad request; retrying it just burns quota. */
  get retryable() {
    return this.status === undefined || this.status >= 500 || this.code === 131_026;
  }
}

/**
 * Webhook signature. Meta signs the raw body — parse it first and the
 * signature will not match, because JSON round-tripping changes bytes.
 */
export function verifySignature(rawBody: string, header: string | null, appSecret: string) {
  if (!header?.startsWith("sha256=")) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  const given = header.slice(7);
  if (given.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}

/**
 * Sending a file.
 *
 * Separate from sendText because the failure modes differ and the error
 * an agent sees should differ with them. A text that fails is usually
 * the window; a file that fails is usually the file.
 *
 * The media is uploaded to Meta first and referenced by id — sending a
 * public URL would mean every brochure a brokerage has ever sent sitting
 * on an unauthenticated endpoint for anyone who guesses the path.
 */
export async function sendDocument(args: {
  orgId: string;
  channelId: string;
  conversationId: string;
  storageRef: string;
  fileName: string;
  mimeType: string;
  caption?: string;
}): Promise<{ providerRef: string }> {
  const creds = await getChannelCredentials(args.orgId, args.channelId);
  const bytes = await readObject(args.storageRef);

  // Step one: upload to Meta, get a media id.
  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", args.mimeType);
  form.append("file", new Blob([bytes], { type: args.mimeType }), args.fileName);

  const up = await fetch(`https://graph.facebook.com/v21.0/${creds.phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${creds.token}` },
    body: form,
    // Longer than a text send. A 40MB brochure on a slow connection is
    // not a failure, it is a brochure.
    signal: AbortSignal.timeout(120_000),
  });
  if (!up.ok) throw new Error(`media upload ${up.status}`);
  const { id: mediaId } = (await up.json()) as { id: string };

  // Step two: send it.
  const isImage = args.mimeType.startsWith("image/");
  const res = await fetch(`https://graph.facebook.com/v21.0/${creds.phoneNumberId}/messages`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${creds.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: await recipientFor(args.conversationId),
      type: isImage ? "image" : "document",
      [isImage ? "image" : "document"]: {
        id: mediaId,
        ...(isImage ? {} : { filename: args.fileName }),
        ...(args.caption ? { caption: args.caption } : {}),
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`send ${res.status}`);

  const body = (await res.json()) as { messages: { id: string }[] };
  return { providerRef: body.messages[0]!.id };
}
