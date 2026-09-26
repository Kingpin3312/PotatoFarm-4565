import { getSessionContext } from "@/server/auth/session";
import { crossTenant } from "@/server/db/client";
import type { NextRequest } from "next/server";

/**
 * tRPC request context. Nothing here is trusted from the client — the
 * membership comes from the database on every request.
 */
export async function createContext({ req }: { req: NextRequest }) {
  const { session, membership } = await getSessionContext();
  // `[0]` on a split is `string | undefined` under
  // noUncheckedIndexedAccess, even though a split never returns an
  // empty array. Optional-chained rather than asserted.
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  const userAgent = req.headers.get("user-agent") ?? "unknown";

  /**
   * Where and when each sign-in was last used, for the sessions list.
   *
   * The columns existed from the start and nothing wrote them, so a
   * "where you're signed in" screen would have shown every device as
   * never used from nowhere. At most once in five minutes per session:
   * a conditional update on the primary key, and a miss writes nothing.
   */
  if (session?.sid) {
    void crossTenant("pre-tenant").session.updateMany({
      where: { id: session.sid, lastActiveAt: { lt: new Date(Date.now() - 5 * 60_000) } },
      data: { lastActiveAt: new Date(), ip: ip === "unknown" ? null : ip, userAgent: userAgent.slice(0, 300) },
    }).catch(() => undefined);
  }

  return { session, membership, ip, userAgent };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
