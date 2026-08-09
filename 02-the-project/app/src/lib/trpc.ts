"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@/server/api/root";

/**
 * The typed client. `AppRouter` is the router mounted in root.ts, so
 * every call in the interface is checked against what the server actually
 * exposes.
 *
 * Worth noting given what the audit found: if anything in the interface
 * had been calling the five unmounted modules, this would have failed at
 * compile time. The types only protect what somebody is actually using —
 * which is exactly why an unused module slips through.
 */
export const api = createTRPCReact<AppRouter>();
