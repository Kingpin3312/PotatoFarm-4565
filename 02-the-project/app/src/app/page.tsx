import { redirect } from "next/navigation";
import { getActiveMembership } from "@/server/auth/session";

/**
 * The front door, which was a 404.
 *
 * There was no page at `/` at all. Anyone typing the bare domain, or
 * following a bookmark, or landing after a redirect that lost its path,
 * got a not-found on the root of the application.
 *
 * It is not a screen — it is a decision about where you belong:
 *
 *   - signed in and a member of a brokerage → the command centre, which
 *     is where the product answers the question an agent actually has.
 *     This used to be the inbox — a message list, which is the
 *     conventional-CRM answer to "what should I do now": here are four
 *     hundred things, you decide.
 *   - signed in but a member of nothing → sign-up, because the only
 *     thing they can usefully do is create a brokerage or accept an
 *     invitation
 *   - not signed in → sign-in
 *
 * `getActiveMembership()` returns null for both of the last two, so the
 * distinction between them is not available here. Sign-in is the safer
 * of the two to land on: it names the way back in for somebody who has
 * an account, and it links to sign-up for somebody who does not.
 */
export const dynamic = "force-dynamic";

export default async function Root() {
  const membership = await getActiveMembership();
  redirect(membership ? "/today" : "/sign-in");
}
