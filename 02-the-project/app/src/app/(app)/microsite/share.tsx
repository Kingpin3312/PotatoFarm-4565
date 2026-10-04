"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Copying, sharing and the QR code for an agent's microsite.
 *
 * On a phone, Share opens the phone's own share sheet — WhatsApp, Mail,
 * Instagram, whatever the agent uses — because that is the list they
 * already know. At a desk it offers WhatsApp, email, copy and the QR code
 * directly. Every route says what happened ("Link copied").
 */
export function CopyLink({ url }: { url: string }) {
  const [said, setSaid] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <Button type="button" size="sm" data-copy-link
        onClick={() => navigator.clipboard.writeText(url).then(() => setSaid("Link copied"), () => setSaid("Couldn't copy — select the address and copy it."))}>
        Copy link
      </Button>
      {said && <span role="status" className="text-note text-ink-3">{said}</span>}
    </span>
  );
}

export function ShareMenu({ url, name, live, userId }: { url: string; name: string; live: boolean; userId?: string }) {
  const [open, setOpen] = useState(false);
  const [said, setSaid] = useState<string | null>(null);
  const qr = useRef<HTMLDialogElement>(null);
  const text = `${name} — my property page: ${url}`;

  async function share() {
    setSaid(null);
    const touch = window.matchMedia("(pointer: coarse)").matches;
    if (touch && navigator.share) {
      const ok = await navigator.share({ title: name, url }).then(() => true, () => false);
      if (ok) setSaid("Shared");
      return;
    }
    setOpen((o) => !o);
  }

  return (
    <div className="relative inline-flex flex-wrap items-center gap-2">
      <Button type="button" onClick={share} aria-expanded={open} data-share>Share</Button>
      <Button type="button" variant="secondary" onClick={() => qr.current?.showModal()} data-qr-open>QR code</Button>
      {said && <span role="status" className="text-note text-ink-3">{said}</span>}
      {!live && <span className="text-note text-ink-3">Publish first — until then the link shows nothing.</span>}
      {open && (
        <div role="menu" className="absolute top-full start-0 mt-2 z-20 w-64 rounded-md border border-rule-strong bg-raised p-1.5 shadow-lg grid">
          <a role="menuitem" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener"
             className="min-h-11 px-3 inline-flex items-center rounded-sm text-ui text-ink no-underline hover:bg-sunk">WhatsApp</a>
          <a role="menuitem" href={`mailto:?subject=${encodeURIComponent(name)}&body=${encodeURIComponent(text)}`}
             className="min-h-11 px-3 inline-flex items-center rounded-sm text-ui text-ink no-underline hover:bg-sunk">Email</a>
          <button role="menuitem" type="button" className="min-h-11 px-3 text-start rounded-sm text-ui text-ink hover:bg-sunk"
            onClick={() => navigator.clipboard.writeText(url).then(() => { setSaid("Link copied"); setOpen(false); })}>Copy link</button>
          <button role="menuitem" type="button" className="min-h-11 px-3 text-start rounded-sm text-ui text-ink hover:bg-sunk"
            onClick={() => { setOpen(false); qr.current?.showModal(); }}>QR code</button>
        </div>
      )}
      <QrDialog ref={qr} userId={userId} />
    </div>
  );
}

/** The QR matrix as one SVG path, with the four-module quiet zone scanners need. */
export function qrSvg(rows: string[]) {
  const n = rows.length, q = 4, size = n + q * 2;
  let d = "";
  rows.forEach((row, r) => { for (let c = 0; c < n; c++) if (row[c] === "1") d += `M${c + q} ${r + q}h1v1h-1z`; });
  return { size, d };
}

function QrDialog({ ref, userId }: { ref: React.RefObject<HTMLDialogElement | null>; userId?: string }) {
  const { data, isError } = api.microsite.qr.useQuery(userId ? { userId } : undefined);
  const [said, setSaid] = useState<string | null>(null);

  function download(kind: "svg" | "png") {
    if (!data) return;
    const name = `microsite-qr.${kind}`;
    const { size, d } = qrSvg(data.rows);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" shape-rendering="crispEdges"><rect width="${size}" height="${size}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
    const svgBlob = new Blob([svg], { type: "image/svg+xml" });
    const svgUrl = URL.createObjectURL(svgBlob);
    const save = (href: string) => {
      const a = document.createElement("a");
      a.href = href; a.download = name; a.click();
      setTimeout(() => URL.revokeObjectURL(href), 1000);
    };
    if (kind === "svg") return save(svgUrl);
    // A PNG at print size: 1200px is a sharp 10cm at 300dpi.
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = c.height = 1200;
      const g = c.getContext("2d")!;
      g.fillStyle = "#FFFFFF"; g.fillRect(0, 0, 1200, 1200);
      g.imageSmoothingEnabled = false;
      g.drawImage(img, 0, 0, 1200, 1200);
      c.toBlob((b) => { if (b) save(URL.createObjectURL(b)); URL.revokeObjectURL(svgUrl); }, "image/png");
    };
    img.src = svgUrl;
  }

  return (
    <dialog ref={ref} aria-labelledby="qr-h" className="m-auto w-[min(92vw,420px)] rounded-md border border-rule-strong bg-raised p-6 text-ink backdrop:bg-black/60" data-qr-dialog>
      <div className="flex items-start justify-between gap-4">
        <h2 id="qr-h" className="text-sub font-semibold">Your QR code</h2>
        {/* First in the dialog and focused when it opens, so Escape or
            Enter closes it and a screen reader starts at the title. */}
        <button type="button" autoFocus onClick={() => ref.current?.close()} className="min-h-11 min-w-11 -me-2 -mt-2 text-ink-2 hover:text-ink" aria-label="Close">✕</button>
      </div>
      <p className="mt-1 text-sm text-ink-2">For business cards, brochures, email signatures and the sign at an open house. It opens your microsite.</p>
      {isError && <p role="alert" className="mt-4 text-sm text-danger">Couldn&apos;t make the code. Try again.</p>}
      {data && (
        <>
          <QrImage rows={data.rows} />
          <p className="mt-4 text-note text-ink-3 break-all text-center">{data.url}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <Button type="button" variant="primary" size="sm" onClick={() => download("png")}>Download PNG</Button>
            <Button type="button" size="sm" onClick={() => download("svg")}>Download SVG</Button>
            <Button type="button" size="sm" variant="quiet"
              onClick={() => navigator.clipboard.writeText(data.url).then(() => setSaid("Link copied"))}>Copy link</Button>
          </div>
          {said && <p role="status" className="mt-2 text-center text-note text-ink-3">{said}</p>}
        </>
      )}
    </dialog>
  );
}

function QrImage({ rows }: { rows: string[] }) {
  const { size, d } = qrSvg(rows);
  return (
    <svg viewBox={`0 0 ${size} ${size}`} shapeRendering="crispEdges" role="img" aria-label="QR code for your microsite"
         className="mt-5 mx-auto block w-full max-w-[280px] rounded-sm" data-qr>
      <rect width={size} height={size} fill="#FFFFFF" />
      <path d={d} fill="#000000" />
    </svg>
  );
}
