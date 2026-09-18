"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

/**
 * The KYC state of one buyer, as an agent sees it.
 *
 * The compliance officer's view already exists. This is the other side
 * — and the difference between them is the whole design.
 *
 * **An agent never sees a sanctions reason.** A possible match shows as
 * a neutral hold with no explanation. Telling an agent "possible
 * terrorist financing match" is how somebody gets tipped off, which is
 * itself an offence under UAE AML rules. The router returns a
 * deliberately bland message for exactly this and it is passed through
 * unchanged.
 */
export function KycPanel({ leadId }: { leadId: string }) {
  const { data, isLoading } = api.aml.fileStatus.useQuery({ leadId });
  const utils = api.useUtils();
  const [failed, setFailed] = useState<string | null>(null);

  /**
   * Opening one by hand.
   *
   * A file opens on its own when an offer is accepted. This is for
   * before that — a buyer who mentions cash over the reporting
   * threshold, or a corporate buyer whose beneficial owners will take a
   * fortnight to establish. Starting late is the failure mode, and the
   * only cure is making it possible to start early.
   */
  const open = api.aml.openFile.useMutation({
    onSuccess: () => { setFailed(null); void utils.aml.fileStatus.invalidate({ leadId }); },
    onError: (e) => setFailed(e.message),
  });

  /**
   * Wording for the document actually outstanding.
   *
   * `requestWording` takes a `docType` — the message differs between
   * asking for a passport and asking for an Emirates ID — and was being
   * passed a `leadId`, which it has no input for. It also returns
   * `body`, not `text`.
   */
  const needs = data?.outstanding?.[0];
  const { data: wording } = api.aml.requestWording.useQuery(
    { docType: needs as "PASSPORT" | "EMIRATES_ID" | "TRADE_LICENCE" },
    { enabled: Boolean(needs) }
  );

  if (isLoading || !data) return null;

  if (!data.exists) {
    return (
      <div className="border-t border-rule pt-4 mt-6">
        <span className="block t-label text-ink-3 mb-2">
          Identity
        </span>
        <p className="text-ui text-ink-2 max-w-[44ch] leading-snug">
          Nothing needed yet. A file opens on its own when an offer is accepted — every
          brokerage concluding a sale is a DNFBP and the check is the firm&rsquo;s
          obligation, not yours.
        </p>

        {failed && (
          <p role="alert" className="mt-3 text-sm text-danger max-w-[44ch]">{failed}</p>
        )}

        {/* The sentence above used to be the whole panel, and it
            described something that never happened: nothing in the
            product could create a file, so "a file opens when this
            becomes a transaction" was a promise with nothing behind it.
            Early is the only direction this ever needs to move. */}
        <Button
          size="sm"
          variant="secondary"
          className="mt-3"
          loading={open.isPending}
          onClick={() => open.mutate({ leadId })}
        >
          Start one now
        </Button>
      </div>
    );
  }

  const held = data.status === "WITH_COMPLIANCE";

  return (
    <div className="border-t border-rule pt-4 mt-6">
      <span className="block t-label text-ink-3 mb-2">
        Identity
      </span>

      {held ? (
        // Neutral, and deliberately uninformative. The message comes
        // from the router; do not enrich it here.
        <div className="bg-sunk rounded-xl p-4 border-s-[3px] border-s-rule-strong">
          <p className="text-ui text-ink">{data.message}</p>
        </div>
      ) : (
        <>
          <p className={cn("text-control font-medium",
            data.outstanding.length === 0 ? "text-success" : "text-ink")}>
            {data.outstanding.length === 0
              ? "Everything's in."
              : `Waiting on ${data.outstanding.length === 2 ? "both documents" : "one document"}`}
          </p>
          {data.outstanding.length > 0 && (
            <>
              <ul className="mt-2 space-y-1">
                {data.outstanding.map((d) => (
                  <li key={d} className="text-sm text-ink-2">
                    {d === "PASSPORT" ? "Passport" : "Emirates ID"}
                  </li>
                ))}
              </ul>
              {wording?.body && (
                <div className="mt-4">
                  <p className="text-sm text-ink-3 mb-2">Ask them like this:</p>
                  <p className="text-ui text-ink bg-sunk rounded-xl p-3 leading-snug">
                    {wording.body}
                  </p>
                  <Button variant="secondary" className="mt-2"
                    onClick={() => void navigator.clipboard?.writeText(wording.body)}>
                    Copy
                  </Button>
                </div>
              )}
            </>
          )}
          {data.unverified > 0 && (
            <p className="text-sm text-ink-2 mt-3 max-w-[44ch] leading-snug">
              {data.unverified} uploaded but not yet checked. Your compliance officer does
              that — nothing is auto-verified.
            </p>
          )}

          <FileDetails leadId={leadId} file={data.file} missing={data.missing} />
        </>
      )}
    </div>
  );
}


/**
 * Who the person actually is, which the file could not record.
 *
 * `aml.updateFile` writes every field below — legal name, nationality,
 * trade licence, identity document, source of funds, source of wealth —
 * and **no screen called it**. A due diligence file could be opened, could
 * collect a passport, and could never say where the money came from.
 *
 * That last pair is the point of the exercise rather than a form field.
 * A risk-based approach is what the regulation asks for, and source of
 * funds is the question it is built around: `assessRisk` reads the shape
 * of the transaction, and an inspector reads this.
 *
 * ## The agent fills it in, and cannot approve it
 *
 * `kyc:write` is an agent permission on purpose — the person talking to
 * the buyer is the one who learns they are selling a company in Sharjah.
 * `updateFile` moves a NOT_STARTED file to COLLECTING and no further:
 * PENDING_REVIEW comes from a document arriving, and APPROVED is a
 * compliance decision. Typing a passport number cannot walk a file
 * towards approved, which is the separation the appointment exists to
 * create.
 *
 * Not rendered while the file is held with compliance — the panel above
 * shows one neutral sentence in that state and nothing else, and that
 * rule is older than this section.
 */
function FileDetails({
  leadId, file, missing,
}: {
  leadId: string;
  file: {
    legalName: string; nationality: string | null; tradeLicence: string | null;
    idType: string | null; idNumber: string | null; idExpiresAt: Date | string | null;
    sourceOfFunds: string | null; sourceOfWealth: string | null;
  };
  missing: readonly string[];
}) {
  const utils = api.useUtils();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => ({
    legalName: file.legalName ?? "",
    nationality: file.nationality ?? "",
    idType: file.idType ?? "",
    idNumber: file.idNumber ?? "",
    idExpiresAt: file.idExpiresAt ? String(file.idExpiresAt).slice(0, 10) : "",
    sourceOfFunds: file.sourceOfFunds ?? "",
    sourceOfWealth: file.sourceOfWealth ?? "",
  }));

  const save = api.aml.updateFile.useMutation({
    onSuccess: () => {
      setEditing(false);
      void utils.aml.fileStatus.invalidate({ leadId });
    },
  });

  if (!editing) {
    return (
      <div className="mt-4 border-t border-rule pt-3">
        {missing.length > 0 ? (
          <p className="text-sm text-ink-2 max-w-[44ch] leading-snug">
            The file has no {missing.join(", no ")}. It cannot be assessed without them.
          </p>
        ) : (
          <p className="text-sm text-ink-2 max-w-[44ch] leading-snug">
            {file.legalName}
            {file.nationality ? ` · ${file.nationality}` : ""}
            {file.idType ? ` · ${LABEL[file.idType] ?? file.idType}` : ""}
          </p>
        )}
        <Button size="sm" variant="secondary" className="mt-2" onClick={() => setEditing(true)}>
          {missing.length > 0 ? "Record their details" : "Edit details"}
        </Button>
      </div>
    );
  }

  return (
    <form
      className="mt-4 border-t border-rule pt-3 max-w-[44ch]"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({
          leadId,
          legalName: form.legalName.trim() || undefined,
          nationality: form.nationality.trim() || null,
          idType: (form.idType || null) as never,
          idNumber: form.idNumber.trim() || null,
          // Midday, so a date typed in Dubai is not yesterday in UTC.
          idExpiresAt: form.idExpiresAt ? new Date(`${form.idExpiresAt}T12:00:00Z`).toISOString() : null,
          sourceOfFunds: form.sourceOfFunds.trim() || null,
          sourceOfWealth: form.sourceOfWealth.trim() || null,
        });
      }}
    >
      <Field label="Legal name, as on the document" value={form.legalName}
             onChange={(v) => setForm({ ...form, legalName: v })} />
      <Field label="Nationality" value={form.nationality}
             onChange={(v) => setForm({ ...form, nationality: v })} />

      <label className="block mt-3">
        <span className="t-label text-ink-3 mb-1 block">Identity document</span>
        <select value={form.idType} onChange={(e) => setForm({ ...form, idType: e.target.value })}
          className="min-h-11 w-full rounded-md border border-rule bg-raised px-3 text-control text-ink">
          <option value="">Not recorded</option>
          <option value="PASSPORT">Passport</option>
          <option value="EMIRATES_ID">Emirates ID</option>
          <option value="GCC_ID">GCC ID</option>
          <option value="TRADE_LICENCE">Trade licence</option>
        </select>
      </label>
      <Field label="Document number" value={form.idNumber}
             onChange={(v) => setForm({ ...form, idNumber: v })} />
      <label className="block mt-3">
        <span className="t-label text-ink-3 mb-1 block">Expires</span>
        <input type="date" value={form.idExpiresAt}
          onChange={(e) => setForm({ ...form, idExpiresAt: e.target.value })}
          className="min-h-11 w-full rounded-md border border-rule bg-raised px-3 text-control text-ink" />
      </label>

      {/* The two the whole file is for. The hint says why they are being
          asked, because an agent who does not know why writes "savings"
          and moves on. */}
      <label className="block mt-4">
        <span className="t-label text-ink-3 mb-1 block">Where the money for this purchase came from</span>
        <textarea rows={2} value={form.sourceOfFunds}
          onChange={(e) => setForm({ ...form, sourceOfFunds: e.target.value })}
          placeholder="Sale of a property in London, completed March"
          className="w-full rounded-md border border-rule bg-raised p-3 text-control text-ink" />
      </label>
      <label className="block mt-3">
        <span className="t-label text-ink-3 mb-1 block">How they made their money generally</span>
        <textarea rows={2} value={form.sourceOfWealth}
          onChange={(e) => setForm({ ...form, sourceOfWealth: e.target.value })}
          placeholder="Owns a logistics business in Jebel Ali"
          className="w-full rounded-md border border-rule bg-raised p-3 text-control text-ink" />
      </label>
      <p className="mt-2 text-note leading-snug text-ink-3">
        These two are what a risk assessment is built on, and what an inspector reads
        first. In their words is better than yours.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" variant="primary" type="submit" loading={save.isPending}>Save</Button>
        <Button size="sm" variant="secondary" type="button" onClick={() => setEditing(false)}>
          Cancel
        </Button>
      </div>
      {save.error && (
        <p role="alert" className="mt-3 text-sm text-danger">{save.error.message}</p>
      )}
    </form>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="block mt-3">
      <span className="t-label text-ink-3 mb-1 block">{label}</span>
      <input value={value} onChange={(e) => onChange(e.target.value)}
        className="min-h-11 w-full rounded-md border border-rule bg-raised px-3 text-control text-ink" />
    </label>
  );
}

const LABEL: Record<string, string> = {
  PASSPORT: "Passport",
  EMIRATES_ID: "Emirates ID",
  GCC_ID: "GCC ID",
  TRADE_LICENCE: "Trade licence",
};
