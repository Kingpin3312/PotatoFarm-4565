import { handlers } from "@/server/auth/config";

/**
 * The NextAuth endpoint.
 *
 * `config.ts` has always exported `handlers`, and nothing had ever
 * mounted them. Without this file `/api/auth/*` does not exist, which
 * means the magic link in a sign-in email resolves to a 404 and there is
 * no way whatsoever to get a session — the sign-in page, the callback,
 * the session lookup and sign-out are all served from here.
 *
 * It is four lines and it is the difference between an application and a
 * codebase.
 *
 * `runtime = "nodejs"` because the Prisma adapter writes User, Account
 * and Session rows, and Prisma does not run on the edge runtime.
 */
export const runtime = "nodejs";

export const { GET, POST } = handlers;
