"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { api } from "@/lib/trpc";
import { QueryError } from "@/components/ui/query-state";
import { buttonStyles } from "@/components/ui/button";
import { MicrositeView } from "@/components/microsite/microsite-view";
import { assembleView } from "@/lib/microsite/assemble";

/**
 * The saved draft, full width, exactly as the public page will draw it —
 * the same component and the same assembly. A bar on top says it is a
 * preview, so nobody mistakes it for the live page; the form is shown and
 * does not send.
 */
export default function MicrositePreviewPage() {
  return <Suspense><Preview /></Suspense>;
}

function Preview() {
  const userId = useSearchParams().get("user") ?? undefined;
  const mine = api.microsite.mine.useQuery(userId ? { userId } : undefined);
  if (mine.isError) return <QueryError retry={() => void mine.refetch()} what="your microsite" error={mine.error} />;
  if (!mine.data) return <div className="max-w-[1080px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;
  const m = mine.data;
  const view = assembleView(m.content, m.parts);
  const q = userId ? `?user=${userId}` : "";
  return (
    <div>
      <div className="border-b border-rule bg-raised">
        <div className="max-w-[1120px] mx-auto px-5 py-3 flex flex-wrap items-center gap-3 justify-between">
          <p className="text-note text-ink-2"><span className="font-medium text-ink">Preview</span> · your saved draft{m.site.status === "LIVE" ? (m.site.unpublishedChanges ? ", not yet live" : ", the same as the live page") : ", not public yet"}</p>
          <div className="flex gap-2">
            <a href={`/microsite/edit${q}`} className={buttonStyles({ variant: "primary", size: "sm" })}>Back to editor</a>
            <a href={`/microsite${q}`} className={buttonStyles({ variant: "quiet", size: "sm" })}>My microsite</a>
          </div>
        </div>
      </div>
      <MicrositeView view={view} preview />
    </div>
  );
}
