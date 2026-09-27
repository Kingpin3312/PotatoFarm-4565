"use client";

import { buttonStyles } from "@/components/ui/button";
import { CONTENTS, PAGE_COUNT, PDF_BYTES, PDF_URL, VERSION } from "@/lib/manual";

/**
 * The training manual, read inside the CRM.
 *
 * The exact pages of the printed manual, as images, rather than an
 * embedded PDF: a phone cannot page through a PDF inside a web page —
 * iPhone shows the first page and stops — and an agent is as likely to
 * open this in the car as at a desk. The PDF itself is one tap away, to
 * download or to open in the device's own viewer.
 *
 * Built from `05-documents/training-manual/` by `publish.py`, which writes
 * the page images to `manual-assets/<edition>/` and the contents to
 * `src/lib/manual.ts`; rebuild the manual and publish again and this follows.
 * Every page and the PDF come through `api/manual/[...path]`, which serves
 * them to signed-in people only.
 */
const page = (n: number) => `/api/manual/page/${String(n).padStart(2, "0")}?v=${VERSION}`;
const mb = (PDF_BYTES / 1e6).toFixed(1);

export default function Manual() {
  const jump = (n: number) => {
    document.getElementById(`page-${n}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="mx-auto max-w-[1180px] px-6 pb-28">
      <header className="pt-10 pb-8 flex flex-wrap items-end justify-between gap-6">
        <div>
          <span className="t-label text-ink-3 block mb-3">Training manual · Edition 2</span>
          <h1 className="font-sans text-page font-semibold text-ink">The PotatoFarm.io manual</h1>
          <p className="text-sm text-ink-2 mt-3 max-w-[56ch]">
            Every screen, step by step, for agents, managers, owners and compliance officers.
            {` ${PAGE_COUNT} pages. `}Read it here, or keep a copy on your phone or laptop.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <a href={`${PDF_URL}?download=1&v=${VERSION}`} download="PotatoFarm-Training-Manual.pdf" className={buttonStyles({ variant: "primary" })}>
            Download PDF · {mb} MB
          </a>
          <a href={`${PDF_URL}?v=${VERSION}`} target="_blank" rel="noopener" className={buttonStyles({ variant: "secondary" })}>
            Open as PDF
          </a>
        </div>
      </header>

      {/* On a phone the contents is a picker above the pages; on a desk
          it sits beside them and stays in view while you read. */}
      <label className="lg:hidden block mb-6">
        <span className="t-label text-ink-3 block mb-2">Go to</span>
        <select
          className="w-full min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink"
          defaultValue=""
          onChange={(e) => e.target.value && jump(Number(e.target.value))}
          aria-label="Go to a section of the manual"
        >
          <option value="" disabled>Choose a section…</option>
          {CONTENTS.map((c) => (
            <option key={`${c.no}-${c.title}`} value={c.page}>
              {c.part ? `${c.no}  ${c.title.toUpperCase()}` : `${c.no ? c.no + "  " : ""}${c.title}`}
            </option>
          ))}
        </select>
      </label>

      <div className="grid lg:grid-cols-[260px_1fr] gap-10 items-start">
        <nav aria-label="Contents" className="hidden lg:block sticky top-20 max-h-[calc(100dvh-6rem)] overflow-y-auto pe-2">
          <span className="t-label text-ink-3 block mb-3">Contents</span>
          <ol className="flex flex-col">
            {CONTENTS.map((c) => (
              <li key={`${c.no}-${c.title}`}>
                <a
                  href={`#page-${c.page}`}
                  onClick={(e) => { e.preventDefault(); jump(c.page); }}
                  className={
                    c.part
                      ? "flex gap-2 pt-4 pb-1 text-ui font-semibold text-ink no-underline hover:text-accent-deep"
                      : "flex gap-2 py-1 text-sm text-ink-2 no-underline hover:text-ink"
                  }
                >
                  <span className={c.part ? "text-accent-deep tabular-nums" : "text-ink-3 tabular-nums w-9 shrink-0"}>{c.no}</span>
                  <span>{c.title}</span>
                </a>
              </li>
            ))}
          </ol>
        </nav>

        <div className="flex flex-col gap-8 min-w-0">
          {Array.from({ length: PAGE_COUNT }, (_, i) => i + 1).map((n) => (
            <figure key={n} id={`page-${n}`} className="m-0 scroll-mt-20">
              {/* eslint-disable-next-line @next/next/no-img-element -- a fixed, pre-rendered page; nothing to optimise */}
              <img
                src={page(n)}
                width={1240}
                height={1754}
                loading={n <= 2 ? "eager" : "lazy"}
                alt={`Page ${n} of ${PAGE_COUNT} of the training manual`}
                className="block w-full h-auto rounded-[3px] border border-rule bg-white"
              />
              <figcaption className="mt-2 text-note text-ink-3 tabular-nums text-center">
                {n} / {PAGE_COUNT}
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </div>
  );
}
