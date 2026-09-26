import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/server/auth/config";
import { getActiveMembership } from "@/server/auth/session";
import { authorizeUrl, configured, signState, type Provider } from "@/server/lib/email/providers";

/**
 * Connect a mailbox: send the signed-in agent to Google or Microsoft.
 *
 * The state names who started and for which brokerage, signed, so the
 * callback attaches the mailbox to them and to nobody else.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ provider: string }> }) {
  const { provider: raw } = await params;
  const p = raw.toUpperCase() as Provider;
  const back = (why: string) => NextResponse.redirect(new URL(`/settings/email?problem=${encodeURIComponent(why)}`, req.url));
  if (p !== "GOOGLE" && p !== "MICROSOFT") return new NextResponse("Unknown provider.", { status: 404 });

  const session = await auth();
  if (!session?.user?.id) return NextResponse.redirect(new URL(`/sign-in?next=/settings/email`, req.url));
  if (session.twoStep === "needed") return NextResponse.redirect(new URL("/sign-in/two-step", req.url));
  const membership = await getActiveMembership();
  if (!membership) return back("You are not in a brokerage.");
  if (!configured(p)) return back(`${p === "GOOGLE" ? "Google" : "Microsoft"} is not set up on this installation yet.`);

  const state = signState({ u: session.user.id, o: membership.orgId, p });
  return NextResponse.redirect(authorizeUrl(p, req.nextUrl.origin, state));
}
