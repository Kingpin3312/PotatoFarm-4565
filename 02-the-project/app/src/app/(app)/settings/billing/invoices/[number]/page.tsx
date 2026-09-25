"use client";

import { use } from "react";
import Link from "next/link";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { sentence } from "@/lib/sentence";

/**
 * One invoice, as the document a brokerage files.
 *
 * The billing screen showed each invoice's arithmetic and nothing a
 * finance department could keep. This is that document: both parties,
 * the period, the lines, the total — printed or saved as a PDF from the
 * browser, which every brokerage already knows how to do, rather than a
 * PDF library generating a second copy that could disagree with this one.
 *
 * Everything on it was fixed when the invoice was issued. It reads
 * "Tax invoice" only when it carries PotatoFarm's TRN.
 */
export default function InvoiceDocument({ params }: { params: Promise<{ number: string }> }) {
  const { number } = use(params);
  const { data, isLoading, isError, refetch, error } =
    api.billing.invoice.useQuery({ number: decodeURIComponent(number) });

  if (isError) return <QueryError retry={() => void refetch()} what="this invoice" error={error} />;
  if (isLoading || !data) {
    return <div className="max-w-[760px] mx-auto px-6 pt-12"><div className="h-9 w-48 rounded bg-sunk" /></div>;
  }

  return (
    <div className="max-w-[760px] mx-auto px-6 pb-24 print:px-0 print:pb-0">
      <div className="flex items-center gap-3 pt-6 print:hidden">
        <Link href="/settings/billing" className="text-sm text-ink-2 min-h-11 flex items-center">
          &larr; Billing
        </Link>
        <Button variant="primary" className="ms-auto" onClick={() => window.print()}>
          Print or save as PDF
        </Button>
      </div>

      <article className="print-ink pt-8 print:pt-0">
        <header className="flex items-baseline gap-4 pb-6 border-b border-rule-strong">
          <h1 className="font-sans font-semibold text-page text-ink">{data.title}</h1>
          <span className="ms-auto font-mono text-ui text-ink">{data.number}</span>
        </header>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 py-6 border-b border-rule">
          <Party label="From" party={data.supplier} />
          <Party label="To" party={data.customer} />
        </div>

        <dl className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-5 border-b border-rule">
          <Fact k="Issued" v={day(data.issuedAt)} />
          <Fact k="Period" v={`${day(data.periodFrom)} – ${day(data.periodTo)}`} />
          <Fact k="Due" v={day(data.dueAt)} />
          <Fact k="Status" v={sentence(data.status)} />
        </dl>

        <table className="w-full mt-2 text-sm">
          <thead>
            <tr className="border-b border-rule">
              <th scope="col" className="text-start t-label text-ink-3 font-normal py-3">Description</th>
              <th scope="col" className="text-end t-label text-ink-3 font-normal py-3">Amount</th>
            </tr>
          </thead>
          <tbody>
            {data.lines.map((l) => (
              <tr key={l.description} className="border-b border-rule align-top">
                <td className="py-3.5 pe-4">
                  <span className="block text-ui text-ink">{l.description}</span>
                  <span className="block text-note text-ink-3 mt-0.5">{l.detail}</span>
                </td>
                <td className="py-3.5 text-end text-ui text-ink tabular whitespace-nowrap">{l.amount}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="ms-auto max-w-[340px] mt-4 text-ui">
          <Sum k="Subtotal" v={data.subtotal} />
          {data.vat
            ? <Sum k={`VAT at ${data.vat.rate}`} v={data.vat.amount} />
            : (
                <div className="py-2">
                  <dt className="sr-only">VAT</dt>
                  <dd className="text-note text-ink-3">No VAT charged — PotatoFarm is not VAT-registered.</dd>
                </div>
              )}
          <Sum k="Total" v={data.total} strong />
        </dl>

        <p className="mt-10 text-note text-ink-3">
          Amounts in UAE dirhams. Questions about this invoice: hello@potatofarm.io, quoting {data.number}.
        </p>
      </article>
    </div>
  );
}

function Party({ label, party }: { label: string; party: { name: string; address: string | null; trn: string | null } }) {
  return (
    <div>
      <span className="t-label text-ink-3 block mb-2">{label}</span>
      <p className="text-ui text-ink font-medium">{party.name}</p>
      {party.address && <p className="text-sm text-ink-2 whitespace-pre-line mt-1">{party.address}</p>}
      {party.trn && <p className="text-sm text-ink-2 mt-1 tabular">TRN {party.trn}</p>}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt className="t-label text-ink-3">{k}</dt>
      <dd className="text-sm text-ink mt-1 tabular">{v}</dd>
    </div>
  );
}

function Sum({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <div className={`flex items-baseline gap-3 py-2 ${strong ? "border-t border-ink mt-1 pt-3" : ""}`}>
      <dt className={strong ? "text-ink font-semibold" : "text-ink-2"}>{k}</dt>
      <dd className={`ms-auto tabular ${strong ? "text-ink font-semibold" : "text-ink"}`}>{v}</dd>
    </div>
  );
}

const day = (iso: string) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })
    .format(new Date(`${iso}T00:00:00Z`));
