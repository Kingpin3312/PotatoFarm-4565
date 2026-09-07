"use client";

import { use } from "react";

import { VendorBrief } from "../brief";

/**
 * One owner, and what they are being told.
 *
 * ## This route did not exist
 *
 * `attach-owner.tsx` has linked to `/vendors/<id>` since it was
 * written — a "Brief" button pointing at a 404. `brief.tsx` was the
 * page that link wanted, finished, over a working query, and imported
 * by nothing. Two halves of the same feature, each waiting for the
 * other, neither reachable.
 *
 * Deliberately thin: the brief is the whole content, and wrapping it in
 * a second header would repeat the owner's name twice on one screen.
 *
 * `use(params)` because Next 15 hands a page its params as a Promise
 * and this is a client component — reading `vendorId` straight off it
 * yields undefined and the query runs against nothing, which is the
 * mistake `blackbook/[leadId]` records having made.
 */
export default function Vendor({ params }: { params: Promise<{ vendorId: string }> }) {
  const { vendorId } = use(params);
  return (
    <div className="max-w-[680px] mx-auto px-6 pt-10 pb-24">
      <VendorBrief vendorId={vendorId} />
    </div>
  );
}
