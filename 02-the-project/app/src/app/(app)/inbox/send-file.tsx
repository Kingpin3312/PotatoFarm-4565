"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Send a brochure.
 *
 * An agent test found this: a buyer asks for the floor plan and the
 * agent has to leave the CRM, open WhatsApp and find the file. Seven
 * conversation procedures existed to do it properly and none had a
 * screen.
 *
 * Two halves — pick something already uploaded against the listing, or
 * upload a new one. The upload goes straight to storage on a signed
 * URL; a 40MB brochure posted through this app is a timeout.
 */
export function SendFile({ conversationId, listingId, windowOpen }: {
  conversationId: string; listingId?: string; windowOpen: boolean;
}) {
  const { data: files } = api.conversations.files.useQuery(
    { listingId: listingId! }, { enabled: Boolean(listingId) }
  );
  const send = api.conversations.sendFile.useMutation();
  const request = api.conversations.requestUpload.useMutation();
  const confirm = api.conversations.confirmUpload.useMutation();
  const [busy, setBusy] = useState(false);

  // The window governs everything here. WhatsApp accepts a document
  // outside it and never delivers it, and the agent is never told.
  if (!windowOpen) {
    return (
      <div className="bg-sunk rounded-xl p-4 border-s-[3px] border-s-accent-edge">
        <p className="text-ui text-ink font-medium">Can't send a file right now</p>
        <p className="text-sm text-ink-2 mt-1 max-w-[44ch] leading-snug">
          The reply window has closed. WhatsApp accepts documents and quietly drops them —
          send a template first, and once they answer you can send anything.
        </p>
      </div>
    );
  }

  async function upload(file: File) {
    setBusy(true);
    try {
      const ticket = await request.mutateAsync({
        fileName: file.name, mimeType: file.type, sizeBytes: file.size,
      });
      // Straight to storage. Nothing large passes through the app.
      await fetch(ticket.uploadUrl, { method: "PUT", body: file,
                                      headers: { "Content-Type": file.type } });
      const done = await confirm.mutateAsync({
        storageRef: ticket.storageRef, listingId,
        fileName: file.name, mimeType: file.type, sizeBytes: file.size,
        kind: file.type.startsWith("image/") ? "PHOTO" : "BROCHURE",
      });
      await send.mutateAsync({ conversationId, attachmentId: done.attachmentId });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      {files?.length ? (
        <>
          <span className="block t-label text-ink-3 mb-2">
            Already on this listing
          </span>
          <div className="flex gap-2 flex-wrap mb-4">
            {files.map((f) => (
              <button key={f.id} className="btn-inline"
                onClick={() => send.mutate({ conversationId, attachmentId: f.id })}>
                {f.fileName}
              </button>
            ))}
          </div>
        </>
      ) : null}

      <label htmlFor="upl" className="block t-label text-ink-3 mb-2">
        Or send something new
      </label>
      <input id="upl" type="file" accept="image/jpeg,image/png,application/pdf"
        onChange={(e) => { const f = e.target.files?.[0]; if (f) void upload(f); }}
        className="text-control text-ink" />

      {/* Every refusal says what to do instead. "Unsupported file type"
          leaves an agent standing in a lobby with nothing. */}
      {(request.error || send.error) && (
        <p role="alert" className="text-sm text-danger mt-3 max-w-[44ch] leading-snug">
          {request.error?.message ?? send.error?.message}
        </p>
      )}
      {busy && <p className="text-sm text-ink-2 mt-3">Sending…</p>}
      {send.isSuccess && !busy && <p className="text-sm text-success mt-3">Sent.</p>}
    </div>
  );
}
