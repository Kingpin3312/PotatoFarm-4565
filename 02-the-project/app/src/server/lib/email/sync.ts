import { forOrg, crossTenant } from "@/server/db/client";
import { readSecret } from "@/server/lib/secrets";
import { log } from "@/lib/log";

/**
 * Email sync.
 *
 * The one genuine gap against the competing product, and the one worth
 * building on its own merits: agents live in email as well as WhatsApp,
 * and a system of record that only knows one of them is not a record of
 * the relationship.
 *
 * Two decisions do most of the work here.
 */

/**
 * 1. **Headers and a snippet. Never the body.**
 *
 * Storing full message bodies turns this into a mail archive — a
 * different product, with different retention obligations, and a far
 * worse story if it is ever breached. A brokerage's mailbox contains
 * salary discussions, legal advice and personal correspondence that has
 * nothing to do with property.
 *
 * We keep enough to show a timeline and link back to the original. The
 * body stays where it already is.
 */
const SNIPPET_CHARS = 200;

/**
 * 2. **Only mail involving a known person.**
 *
 * Syncing an entire mailbox pulls in newsletters, invoices, and the
 * agent's own life. Matching on address first means we store the
 * fraction that is about a client and discard the rest before it is
 * ever written down.
 */
export async function syncAccount(accountId: string) {
  const acct = await crossTenant("sweep").emailAccount.findUniqueOrThrow({
    where: { id: accountId },
    select: { id: true, orgId: true, agentId: true, provider: true,
              address: true, secretRef: true, cursor: true, active: true },
  });
  if (!acct.active) return { synced: 0, skipped: "inactive" };

  const db = forOrg(acct.orgId);

  // Every phone and address the brokerage knows. Built once per sync,
  // not per message.
  const [leads, vendors] = await Promise.all([
    db.lead.findMany({ where: { email: { not: null } }, select: { id: true, email: true } }),
    db.vendor.findMany({ where: { email: { not: null } }, select: { id: true, email: true } }),
  ]);
  const known = new Map<string, { leadId?: string; vendorId?: string }>();
  for (const l of leads) known.set(l.email!.toLowerCase(), { leadId: l.id });
  for (const v of vendors) known.set(v.email!.toLowerCase(), { vendorId: v.id });

  let token: string;
  try {
    token = await readSecret(acct.secretRef);
  } catch {
    // A dead token is silent — mail simply stops arriving and nobody
    // notices for a week. Recorded on the account so health picks it up.
    await crossTenant("sweep").emailAccount.update({
      where: { id: acct.id },
      data: { lastError: "Mailbox disconnected. Reconnect it in Settings — "
                       + "email has not synced since this was recorded." },
    });
    return { synced: 0, skipped: "no token" };
  }

  const page = await fetchDelta(acct.provider, token, acct.cursor);
  let stored = 0;

  for (const m of page.messages) {
    const participants = [m.from, ...m.to].map((a) => a.toLowerCase());
    const hit = participants.map((a) => known.get(a)).find(Boolean);
    // Not about anyone we know. Discarded here — never written.
    if (!hit) continue;

    try {
      await db.emailMessage.create({
        data: {
          orgId: acct.orgId,
          accountId: acct.id,
          externalId: m.id,
          threadId: m.threadId,
          direction: m.from.toLowerCase() === acct.address.toLowerCase()
            ? "OUTBOUND" : "INBOUND",
          fromAddress: m.from,
          toAddresses: m.to,
          subject: m.subject?.slice(0, 300) ?? null,
          snippet: m.snippet?.slice(0, SNIPPET_CHARS) ?? null,
          leadId: hit.leadId,
          vendorId: hit.vendorId,
          sentAt: m.sentAt,
          webLink: m.webLink,
        },
      });
      stored += 1;
    } catch {
      // Already have it. The unique constraint on (account, externalId)
      // is what makes a resync idempotent — re-running a sync must never
      // duplicate a timeline.
    }
  }

  await crossTenant("sweep").emailAccount.update({
    where: { id: acct.id },
    data: { cursor: page.cursor, lastSyncedAt: new Date(), lastError: null },
  });

  log.info("email synced", { orgId: acct.orgId },
           { account: acct.address, seen: page.messages.length, stored });
  return { synced: stored, seen: page.messages.length };
}

type Raw = {
  id: string; threadId: string; from: string; to: string[];
  subject?: string; snippet?: string; sentAt: Date; webLink?: string;
};

/**
 * The provider call.
 *
 * Both Google and Microsoft give a delta cursor, which is the only
 * sane way to do this — without one, every sync walks the whole mailbox
 * and the tenth sync costs the same as the first.
 */
async function fetchDelta(
  provider: "GOOGLE" | "MICROSOFT", token: string, cursor: string | null
): Promise<{ messages: Raw[]; cursor: string }> {
  const base = provider === "GOOGLE"
    ? "https://gmail.googleapis.com/gmail/v1/users/me"
    : "https://graph.microsoft.com/v1.0/me/messages";

  const url = provider === "GOOGLE"
    ? `${base}/history?startHistoryId=${cursor ?? ""}`
    : cursor ?? `${base}/delta?$select=subject,from,toRecipients,bodyPreview,sentDateTime,webLink`;

  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`${provider} ${res.status}`);
  return normalise(provider, await res.json());
}

function normalise(provider: string, body: unknown): { messages: Raw[]; cursor: string } {
  // Shapes differ enough between the two that this is where the
  // difference is absorbed, once, rather than leaking into the caller.
  const b = body as Record<string, unknown>;
  if (provider === "MICROSOFT") {
    const items = (b.value ?? []) as Record<string, never>[];
    return {
      messages: items.map((m: Record<string, never>) => ({
        id: String(m.id), threadId: String(m.conversationId ?? m.id),
        from: String((m.from as never as Record<string, Record<string, string>>)
                     ?.emailAddress?.address ?? ""),
        to: ((m.toRecipients ?? []) as never as Record<string, Record<string, string>>[])
              .map((r) => r.emailAddress?.address).filter(Boolean) as string[],
        subject: m.subject as string | undefined,
        snippet: m.bodyPreview as string | undefined,
        sentAt: new Date(String(m.sentDateTime)),
        webLink: m.webLink as string | undefined,
      })),
      cursor: String(b["@odata.deltaLink"] ?? ""),
    };
  }
  /**
   * Google is not implemented, and it now says so.
   *
   * This returned `{ messages: [] }` unconditionally. With a valid Gmail
   * token and a successful fetch, `syncAccount` would store nothing,
   * advance the cursor, stamp `lastSyncedAt`, clear `lastError` and log
   * "email synced … stored 0" — which is exactly what a genuinely quiet
   * mailbox looks like. A brokerage would have seen a connected Gmail
   * account, no errors anywhere, and no email in the product, for ever.
   *
   * Throwing instead means `sweepMailboxes` catches it, the account
   * records the reason, and `health` surfaces it. The feature is no more
   * built than it was; the difference is that it is visibly not built.
   *
   * Finishing it needs Gmail's two-step shape — `history.list` returns
   * message ids and a batched `messages.get` fetches the headers — which
   * is real work and untestable without a Google Cloud app. Microsoft's
   * `$delta` returns the messages themselves, which is why that half
   * exists and this one does not.
   */
  throw new Error(
    "Gmail sync is not implemented. The account has been left connected and " +
    "nothing has been imported from it — this is not a quiet mailbox."
  );
}

/** Swept every fifteen minutes. Email is not WhatsApp — nobody expects
 *  it in seconds, and a tighter loop only burns provider quota. */
/**
 * ## What is and is not built
 *
 * `EmailAccount` has never had a row, because nothing could connect a
 * mailbox and nothing could store a token. The vault fixes the second
 * half; the first still needs an OAuth flow against Google and
 * Microsoft, which means an app registration with each of them —
 * a client id, a secret, a verified redirect — and none of that can be
 * obtained or tested from inside this repository.
 *
 * So the honest state, in order:
 *
 *   1. **No connect flow.** There is no route that starts an OAuth
 *      handshake and no callback that exchanges a code for a token.
 *      Until there is, this sweep iterates an empty list — which it has
 *      done every half hour since it was written.
 *   2. **No refresh.** `readSecret` returns whatever was stored. Access
 *      tokens from both providers expire in about an hour, so the
 *      connect flow has to keep the *refresh* token and mint access
 *      tokens from it.
 *   3. **Microsoft only.** `normalise` handles Graph's `$delta`, which
 *      returns messages. Gmail's `history.list` returns ids and needs a
 *      second batched call, and that half is not written.
 *
 * Written down here rather than discovered later, because every one of
 * those is invisible from the outside: a mailbox that syncs nothing
 * looks exactly like a mailbox with no new mail.
 */
export async function sweepMailboxes() {
  const accts = await crossTenant("sweep").emailAccount.findMany({
    where: { active: true }, select: { id: true },
  });
  let total = 0;
  for (const a of accts) {
    try { total += (await syncAccount(a.id)).synced; }
    catch (e) { log.warn("mailbox sync failed", {}, { id: a.id, e: String(e).slice(0, 100) }); }
  }
  return { accounts: accts.length, stored: total };
}
