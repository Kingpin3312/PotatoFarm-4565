"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/cn";

/**
 * A property's photographs, where the agent adds, orders and removes them.
 *
 * Publishing anywhere needs at least one photo, and until this existed
 * nothing in the product could add one — every real listing failed the
 * rule for ever. The first photo is the cover: the page's main image,
 * the WhatsApp preview card and the first photo in the portal feed.
 *
 * Several files at once, one after another, each straight to storage and
 * checked by its contents before it is kept. A failure names the file
 * and carries on with the rest, because an agent adding twelve photos
 * from a phone should not lose eleven to one HEIC.
 */
export function Photos({ listingId }: { listingId: string }) {
  const utils = api.useUtils();
  const { data, isLoading, error } = api.listings.photos.useQuery({ listingId });
  const upload = api.listings.photoUpload.useMutation();
  const confirm = api.listings.photoConfirm.useMutation();
  const cover = api.listings.photoCover.useMutation({ onSettled: () => void utils.listings.photos.invalidate({ listingId }) });
  const remove = api.listings.photoRemove.useMutation({ onSettled: () => void utils.listings.photos.invalidate({ listingId }) });
  const input = useRef<HTMLInputElement>(null);
  const [progress, setProgress] = useState<string | null>(null);
  const [problems, setProblems] = useState<string[]>([]);

  async function add(files: FileList | null) {
    if (!files?.length) return;
    setProblems([]);
    const failed: string[] = [];
    const list = [...files];
    for (const [i, file] of list.entries()) {
      setProgress(`Adding ${i + 1} of ${list.length}…`);
      try {
        const ticket = await upload.mutateAsync({ listingId, fileName: file.name, mimeType: file.type, sizeBytes: file.size });
        const put = await fetch(ticket.uploadUrl, { method: "PUT", headers: { "content-type": file.type }, body: file });
        if (!put.ok) throw new Error("The upload was refused. Try again.");
        await confirm.mutateAsync({ listingId, key: ticket.key, fileName: file.name, mimeType: file.type, sizeBytes: file.size });
      } catch (e) {
        failed.push(`${file.name}: ${e instanceof Error ? e.message : "could not be added."}`);
      }
    }
    setProgress(null);
    setProblems(failed);
    if (input.current) input.current.value = "";
    void utils.listings.photos.invalidate({ listingId });
    void utils.listings.share.invalidate({ id: listingId });
  }

  if (isLoading) return <p className="mt-3 text-sm text-ink-3">Loading photos…</p>;
  if (error || !data) return <p className="mt-3 text-sm text-danger">{error?.message ?? "Photos could not be loaded."}</p>;

  const full = data.rows.length >= data.limit;
  return (
    <section aria-label="Photos" data-listing-photos className="mt-3 rounded-lg border border-rule bg-sunk p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h3 className="t-label text-ink-3">
          Photos · {data.rows.length}{data.placeholders ? ` (${data.placeholders} placeholder${data.placeholders === 1 ? "" : "s"} from an import)` : ""}
        </h3>
        {data.canEdit && data.storage && (
          <label className={cn("btn-inline min-h-11 inline-flex items-center cursor-pointer", (full || !!progress) && "opacity-50 pointer-events-none")}>
            Add photos
            <input ref={input} type="file" accept="image/jpeg,image/png" multiple className="sr-only"
                   disabled={full || !!progress} onChange={(e) => void add(e.target.files)} />
          </label>
        )}
      </div>

      {!data.storage && (
        <p className="mt-2 text-sm text-ink-2 max-w-[60ch]">
          Photo storage is not set up yet, so photos cannot be added. Whoever runs your account connects it once, for everybody.
        </p>
      )}
      {data.storage && data.rows.length === 0 && (
        <p className="mt-2 text-sm text-ink-2 max-w-[60ch]">
          No photos yet. A property needs at least one before its page, preview card or feed entry can go out. The first one is the cover.
        </p>
      )}
      {progress && <p role="status" className="mt-2 text-sm text-ink-2">{progress}</p>}
      {problems.length > 0 && (
        <ul role="alert" className="mt-2 text-sm text-danger">
          {problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      {data.rows.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 min-[640px]:grid-cols-4 gap-3">
          {data.rows.map((p, i) => (
            <li key={p.id} className="min-w-0">
              {p.url
                // A plain image on purpose: the address is signed and
                // expires in minutes, which the image optimiser would
                // fetch, cache and outlive.
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.url} alt={p.fileName} className="w-full aspect-[3/2] object-cover rounded-md bg-ground" />
                : <div className="w-full aspect-[3/2] rounded-md bg-ground" aria-hidden="true" />}
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-note text-ink-3 truncate">{i === 0 ? "Cover" : p.fileName}</span>
                {data.canEdit && (
                  <span className="flex shrink-0 gap-1">
                    {i > 0 && (
                      <button type="button" onClick={() => cover.mutate({ listingId, photoId: p.id })}
                        className="min-h-11 px-1 text-note text-ink-2 hover:text-ink hover:underline underline-offset-4">
                        Make cover
                      </button>
                    )}
                    <button type="button" onClick={() => remove.mutate({ listingId, photoId: p.id })}
                      aria-label={`Remove ${p.fileName}`}
                      className="min-h-11 px-1 text-note text-ink-3 hover:text-ink hover:underline underline-offset-4">
                      Remove
                    </button>
                  </span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
