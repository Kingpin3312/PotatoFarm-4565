"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Register } from "./register";

/**
 * The register of everything that expires.
 *
 * This route did not exist. `documents.expiry` runs nightly, groups
 * expiring documents per recipient and sends a notification whose
 * deeplink is `/documents?filter=expiring` — so the one message the
 * module produces landed somebody on a 404. It had never been noticed
 * because the sweep has never found a document: nothing in the codebase
 * could create one.
 */
export default function DocumentsPage() {
  return (
    // `useSearchParams` opts the route into client-side rendering and
    // Next requires the boundary explicitly. Without it the build fails
    // on this page alone, at build time rather than in the type-check.
    <Suspense fallback={<div className="max-w-[760px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>}>
      <FromQuery />
    </Suspense>
  );
}

function FromQuery() {
  const params = useSearchParams();
  return <Register filter={params.get("filter") === "expiring" ? "expiring" : "all"} />;
}
