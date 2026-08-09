"use client";

import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
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
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
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
