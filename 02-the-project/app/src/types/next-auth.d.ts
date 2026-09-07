import type { DefaultSession } from "next-auth";

/**
 * `session.user.id` is a string.
 *
 * NextAuth's own `Session["user"]` carries name, email and image and no
 * id. `auth/config.ts` puts the id there in the `session` callback — that
 * is a runtime assignment, and without this declaration the type stayed
 * `string | undefined` everywhere it was read.
 *
 * It is read as `ctx.userId` by `orgProcedure`, which passes it to
 * anything that records who did something: `audit()`, the offer trail,
 * the blackbook note, the AML sign-off. Twenty-six call sites failed to
 * compile for want of this file, and every one of them was correct code.
 *
 * Declared rather than asserted at the call sites. An `as string` in
 * twenty-six places is twenty-six chances to put one somewhere the value
 * genuinely can be absent.
 */
declare module "next-auth" {
  interface Session {
    user: { id: string } & DefaultSession["user"];
  }
}
