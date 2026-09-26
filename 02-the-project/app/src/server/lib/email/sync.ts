import { forOrg, crossTenant } from "@/server/db/client";
import { fetchSecret, writeSecret } from "@/server/lib/secrets/vault";
import { fetchNew, refresh, TokenError, type Provider, type Tokens } from "./providers";
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
    // Deleted leads are left out of the address map: incoming mail must
    // not start attaching itself to a record the brokerage removed.
    db.lead.findMany({
      where: { deletedAt: null, email: { not: null } },
      select: { id: true, email: true },
    }),
    db.vendor.findMany({ where: { email: { not: null } }, select: { id: true, email: true } }),
  ]);
  const known = new Map<string, { leadId?: string; vendorId?: string }>();
  for (const l of leads) known.set(l.email!.toLowerCase(), { leadId: l.id });
  for (const v of vendors) known.set(v.email!.toLowerCase(), { vendorId: v.id });

  /**
   * A live access token, refreshed when it is within a minute of
   * expiring. What is stored is the refresh token and the current access
   * token together, sealed; Microsoft rotates the refresh token on use,
   * so a refresh writes the pair back.
   */
  const disconnected = async (why: string) => {
    // A dead token is silent — mail simply stops arriving and nobody
    // notices for a week. Recorded on the account so health and the
    // settings screen say so.
    await crossTenant("sweep").emailAccount.update({
      where: { id: acct.id },
      data: { lastError: `Mailbox disconnected (${why}). Reconnect it in Settings → Email — mail has not synced since this was recorded.` },
    });
    return { synced: 0, skipped: "no token" as const };
  };
  const stored = await fetchSecret(acct.secretRef);
  if (!stored) return disconnected("no token stored");
  let tokens: Tokens;
  try { tokens = JSON.parse(stored) as Tokens; } catch { return disconnected("unreadable token"); }
  const provider = acct.provider as Provider;
  if (tokens.expiresAt < Date.now() + 60_000) {
    try {
      tokens = await refresh(provider, tokens);
      await writeSecret({ orgId: acct.orgId, ref: acct.secretRef, value: JSON.stringify(tokens) });
    } catch (e) {
      if (e instanceof TokenError) return disconnected(e.code);
      throw e;
    }
  }

  let page;
  try {
    page = await fetchNew(provider, tokens.accessToken, acct.cursor);
  } catch (e) {
    if (e instanceof TokenError) return disconnected(e.code);
    throw e;
  }
  let saved = 0;

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
      saved += 1;
    } catch (e) {
      // Already have it. The unique constraint on (account, externalId)
      // is what makes a resync idempotent — re-running a sync must never
      // duplicate a timeline. Only that: any other failure is a real one,
      // and swallowing it as "already have it" hid it (found proving
      // check:email-connect red).
      if ((e as { code?: string }).code !== "P2002") throw e;
    }
  }

  await crossTenant("sweep").emailAccount.update({
    where: { id: acct.id },
    data: { cursor: page.cursor, lastSyncedAt: new Date(), lastError: null },
  });

  log.info("email synced", { orgId: acct.orgId },
           { account: acct.address, seen: page.messages.length, stored: saved });
  return { synced: saved, seen: page.messages.length };
}

/** Swept every fifteen minutes. Email is not WhatsApp — nobody expects
 *  it in seconds, and a tighter loop only burns provider quota. */
/**
 * ## How a mailbox gets here
 *
 * Settings → Email sends the agent to Google or Microsoft
 * (`/api/oauth/<provider>/start`); the callback exchanges the code, reads
 * which mailbox it is, seals the tokens in the vault and creates the
 * `EmailAccount`. From then on this sweep refreshes the access token as
 * it needs to and reads what is new. `check:email-connect` drives all of
 * it against loopback stand-ins for both providers.
 *
 * What a brokerage still needs is an app registration with each provider
 * (client id, secret, the callback URL) — see `.env.example`. Without
 * one, the screen says the provider is not set up rather than offering a
 * button that fails.
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
