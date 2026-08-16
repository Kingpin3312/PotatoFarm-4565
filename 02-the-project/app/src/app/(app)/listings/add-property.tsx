"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Adding a property, which the product could not do.
 *
 * Twenty-two places read `Listing` and nothing wrote one, so every
 * screen built on top of it — the permit alarm, the buyer matcher, the
 * publish check, the viewing diary — was pointed at a table a brokerage
 * had no way to fill.
 *
 * ## The shape of the form is the argument
 *
 * Two fields are required and the rest are not, and that is a claim
 * about how this job works rather than laziness. An agent takes an
 * instruction on a phone call standing in a lobby: they know the
 * reference they are going to use and roughly what the property is.
 * The Trakheesi permit arrives days later. A form that demands it up
 * front is one that gets filled in from a spreadsheet on Friday, which
 * means the CRM is permanently a week behind the truth.
 *
 * It is safe to accept an incomplete listing *because publishing is a
 * separate gate*: `checkPublish` already refuses anything without a
 * valid permit, and the list screen shows a permit expiring within
 * fourteen days. Nothing incomplete can reach a portal by accident.
 *
 * The permit fields are still on this form, below a rule, because when
 * the agent does have them it is one keystroke — and because their
 * presence teaches what the product expects.
 */
export function AddProperty({ onAdded }: { onAdded?: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const utils = api.useUtils();
  const [error, setError] = useState<string | null>(null);

  const create = api.listings.create.useMutation({
    onSuccess: () => {
      void utils.listings.list.invalidate();
      dialog.current?.close();
      onAdded?.();
    },
    // The reference collision is the expected failure, not an exception:
    // it arrives as a CONFLICT naming the listing already using it, and
    // it belongs beside the field rather than in a toast that vanishes.
    onError: (e) => setError(e.message),
  });

  const open = () => {
    setError(null);
    create.reset();
    dialog.current?.showModal();
    dialog.current?.focus();
  };

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const str = (k: string) => {
      const v = (f.get(k) as string | null)?.trim();
      return v ? v : undefined;
    };
    /**
     * An empty number field is absent, not zero.
     *
     * `Number("")` is 0, so the obvious version files every property
     * with no bedroom count as a studio and every unpriced instruction
     * as free.
     */
    const num = (k: string) => {
      const v = str(k);
      if (v === undefined) return undefined;
      const n = Number(v.replace(/,/g, ""));
      return Number.isFinite(n) ? n : undefined;
    };

    const expiry = str("permitExpiresAt");

    create.mutate({
      reference: str("reference") ?? "",
      title: str("title") ?? "",
      community: str("community"),
      building: str("building"),
      bedrooms: num("bedrooms"),
      bathrooms: num("bathrooms"),
      areaSqft: num("areaSqft"),
      priceAed: num("priceAed"),
      purpose: (f.get("purpose") as "SALE" | "RENT") ?? "SALE",
      status: (f.get("status") as "DRAFT" | "AVAILABLE") ?? "AVAILABLE",
      permitNumber: str("permitNumber"),
      // `<input type="date">` gives a bare date; the procedure wants a
      // datetime. Midday UTC rather than midnight, so the date cannot
      // slip backwards a day for a reader four hours ahead of it.
      ...(expiry ? { permitExpiresAt: new Date(`${expiry}T12:00:00.000Z`).toISOString() } : {}),
      reraBrokerCard: str("reraBrokerCard"),
    });
  }

  return (
    <>
      <Button size="sm" variant="primary" onClick={open}>Add a property</Button>

      <dialog
        ref={dialog}
        aria-labelledby="add-property-title"
        tabIndex={-1}
        className="border border-ink rounded-[3px] p-0 max-w-[560px] w-[calc(100%-40px)] bg-raised text-ink-2 backdrop:bg-ink/50"
      >
        <form onSubmit={submit} className="p-6">
          <h2
            id="add-property-title"
            className="font-sans font-semibold -tracking-[0.024em] text-[24px] text-accent-type mb-1.5"
          >
            Add a property
          </h2>
          <p className="text-sm text-ink-3 mb-5">
            A reference and a name are enough to start. Everything else can follow.
          </p>

          {error && (
            <p role="alert" className="mb-4 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3.5">
            <Field name="reference" label="Reference" required placeholder="DH-101" autoFocus />
            <Field name="title" label="Name" required placeholder="2-bed, Marina Gate" />
            <Field name="community" label="Community" placeholder="Dubai Marina" />
            <Field name="building" label="Building" placeholder="Marina Gate 1" />
            <Field name="bedrooms" label="Bedrooms" type="number" inputMode="numeric" />
            <Field name="bathrooms" label="Bathrooms" type="number" inputMode="numeric" />
            <Field name="areaSqft" label="Area (sq ft)" type="number" inputMode="numeric" />
            {/* Plain text, not `type=number`: agents type "2,400,000"
                and a number input silently discards a value with commas
                in it, leaving the field looking filled and empty. */}
            <Field name="priceAed" label="Price (AED)" inputMode="decimal" placeholder="2,400,000" />

            <Select name="purpose" label="Purpose" options={[["SALE", "For sale"], ["RENT", "To let"]]} />
            <Select
              name="status"
              label="Status"
              options={[["AVAILABLE", "Available"], ["DRAFT", "Draft — not marketed yet"]]}
            />
          </div>

          {/* Below a rule, because this is the part that usually arrives
              later and the layout should say so rather than making an
              agent wonder whether they have missed something required. */}
          <div className="mt-6 pt-5 border-t border-rule">
            <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-3">
              Trakheesi permit — needed before it can be advertised
            </p>
            <div className="grid grid-cols-2 gap-3.5">
              <Field name="permitNumber" label="Permit number" />
              <Field name="permitExpiresAt" label="Expires" type="date" />
              <Field name="reraBrokerCard" label="RERA broker card" />
            </div>
          </div>

          <div className="flex gap-2.5 mt-7">
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending} className="ml-auto">
              Add it
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/**
 * One field.
 *
 * 16px on every input, without exception. Below that, iOS zooms the
 * whole page when the field takes focus and the layout jumps under the
 * agent's thumb — which `ux-audit.py` checks for, and which is
 * especially easy to get wrong in a dense two-column form like this one.
 */
function Field({
  name, label, required, type = "text", ...rest
}: {
  name: string;
  label: string;
  required?: boolean;
  type?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">
        {label}{required && <span className="text-accent-deep"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete="off"
        className="min-h-11 px-3 text-[16px] bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
        {...rest}
      />
    </label>
  );
}

function Select({
  name, label, options,
}: { name: string; label: string; options: [string, string][] }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3">{label}</span>
      <select
        name={name}
        className="min-h-11 px-3 text-[16px] bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
