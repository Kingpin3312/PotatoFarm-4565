"use client";

import { createTRPCReact } from "@trpc/react-query";
import type { inferRouterOutputs } from "@trpc/server";
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

/**
 * What a procedure returns, for a component that takes it as a prop.
 *
 * Re-deriving the shape by hand in the component is how a screen and
 * the procedure feeding it come to disagree — `reachability.py` checks
 * for exactly that and can only see it when the field names differ.
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;
