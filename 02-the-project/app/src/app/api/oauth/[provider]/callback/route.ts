import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth/config";
import { crossTenant } from "@/server/db/client";
import { writeSecret, vaultProblem } from "@/server/lib/secrets/vault";
import { exchangeCode, mailboxAddress, readState, type Provider } from "@/server/lib/email/providers";
import { syncAccount } from "@/server/lib/email/sync";
import { audit } from "@/server/lib/audit";
import { forOrg } from "@/server/db/client";
import { log } from "@/lib/log";

/**
 * Back from Google or Microsoft with a code.
 *
 * Refused unless the signed state is intact, unexpired, for this
 * provider, and was started by the person now finishing it — a callback
 * URL is easy to forward, and whoever opens it must not end up with
 * somebody else's mailbox syncing into their brokerage.
 *
 * `crossTenant("pre-tenant")` for the account row: the brokerage comes
 * from the signed state, not from anything the provider sent back.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await params;
  const p = raw.toUpperCase() as Provider;
  const back = (q: string) => NextResponse.redirect(new URL(`/settings/email?${q}`, req.url));
  const problem = (why: string) => back(`problem=${encodeURIComponent(why)}`);
  if (p !== "GOOGLE" && p !== "MICROSOFT") return new NextResponse("Unknown provider.", { status: 404 });

  const q = req.nextUrl.searchParams;
  if (q.get("error")) return problem("The connection was cancelled.");
  const state = readState(q.get("state"));
  const session = await auth();
  if (!state || state.p !== p || !session?.user?.id || session.user.id !== state.u || session.twoStep === "needed") {
    return problem("That link was not started by you here, or it has expired. Start again.");
  }
  const code = q.get("code");
  if (!code) return problem("The provider sent nothing back. Start again.");
  const vault = vaultProblem();
  if (vault) return problem("This installation cannot store mailbox keys yet.");

  try {
    const tokens = await exchangeCode(p, req.nextUrl.origin, code);
    const address = await mailboxAddress(p, tokens.accessToken);
    const secretRef = `email:${state.u}:${address}`;
    await writeSecret({ orgId: state.o, ref: secretRef, value: JSON.stringify(tokens) });
    const acct = await crossTenant("pre-tenant").emailAccount.upsert({
      where: { agentId_address: { agentId: state.u, address } },
      create: { orgId: state.o, agentId: state.u, provider: p, address, secretRef },
      update: { provider: p, secretRef, active: true, lastError: null, cursor: null },
      select: { id: true },
    });
    await audit(forOrg(state.o), state.o, {
      actorId: state.u, action: "email.connected", entity: "EmailAccount", entityId: acct.id, after: { provider: p },
    });
    // A first sync now, so the screen shows something true straight away.
    await syncAccount(acct.id).catch((e) => log.warn("first mailbox sync failed", { orgId: state.o }, { e: String(e).slice(0, 120) }));
    return back(`connected=${encodeURIComponent(address)}`);
  } catch (e) {
    log.warn("mailbox connection failed", { orgId: state.o }, { provider: p, e: String(e).slice(0, 160) });
    return problem("The provider refused the connection. Start again, and allow reading mail when asked.");
  }
}
