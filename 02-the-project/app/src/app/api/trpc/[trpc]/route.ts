import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { appRouter } from "@/server/api/root";
import { createContext } from "@/server/api/context";
import { report } from "@/lib/log";
import type { NextRequest } from "next/server";

export const runtime = "nodejs";

const handler = (req: NextRequest) =>
  fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: () => createContext({ req }),
    onError({ error, path, ctx }) {
      // Only genuine faults are reported. A FORBIDDEN or a NOT_FOUND is
      // the API working correctly, and reporting those buries the real
      // errors under noise within a day.
      if (error.code === "INTERNAL_SERVER_ERROR") {
        report(error, { orgId: (ctx as { orgId?: string })?.orgId }, { path });
      }
    },
  });

export { handler as GET, handler as POST };
