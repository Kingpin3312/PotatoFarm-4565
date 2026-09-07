"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider, hashKey } from "@tanstack/react-query";
import { httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import { api } from "@/lib/trpc";

/**
 * The client side of tRPC.
 *
 * **superjson must be configured here as well as on the server.** Several
 * routers take and return `BigInt` — money is fils, never a float — and
 * BigInt does not survive JSON. Miss this and every commission figure
 * arrives as a string or throws, and the failure looks like a data bug
 * rather than a serialisation one.
 *
 * ## And the transformer is only half of it
 *
 * superjson covers the wire. It does not cover the **query key**, which
 * React Query hashes with `JSON.stringify` — and `JSON.stringify` throws
 * on a BigInt rather than dropping it. A tRPC query keyed on an amount
 * is therefore an uncaught exception during render, which React escalates
 * into "Application error: a client-side exception has occurred" over the
 * whole page.
 *
 * `commission.preview` is one: it takes the deal's value in fils and
 * hands back the split before it is written. Mounting the form that
 * calls it turned the entire deals screen white, and nothing before that
 * had put a BigInt in a query input — mutations have no key, so
 * `assessRisk` and the rest were never affected and the hole was
 * invisible.
 *
 * Fixed at the client rather than at the one call site, because the rule
 * this collides with is a project-wide one: **all money is BigInt fils**.
 * Every future query that takes an amount would have hit the same edge,
 * and the fix at a call site is to stop using fils.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            /**
             * The default is `JSON.stringify`, which throws on a BigInt.
             *
             * The suffix matters: `1n` and `"1"` are different inputs and
             * must not collide on one cache entry.
             */
            queryKeyHashFn: (key) =>
              hashKey(
                JSON.parse(
                  JSON.stringify(key, (_k, v) =>
                    typeof v === "bigint" ? `${v}#bigint` : v
                  )
                )
              ),
            // An agent switching between windows should not trigger a
            // refetch storm. 30 seconds is long enough to be quiet and
            // short enough that the inbox stays current.
            staleTime: 30_000,
            retry: 1,
          },
        },
      })
  );

  const [trpcClient] = useState(() =>
    api.createClient({
      links: [httpBatchLink({ url: "/api/trpc", transformer: superjson })],
    })
  );

  return (
    <api.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </api.Provider>
  );
}
