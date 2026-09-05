import { getSessionContext } from "@/server/auth/session";
import type { NextRequest } from "next/server";

/**
 * tRPC request context. Nothing here is trusted from the client — the
 * membership comes from the database on every request.
 */
export async function createContext({ req }: { req: NextRequest }) {
  const { session, membership } = await getSessionContext();

  return {
    session,
    membership,
    ip:
      // `[0]` on a split is `string | undefined` under
      // noUncheckedIndexedAccess, even though a split never returns an
      // empty array. Optional-chained rather than asserted.
      req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      req.headers.get("x-real-ip") ??
      "unknown",
    userAgent: req.headers.get("user-agent") ?? "unknown",
  };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
