"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Changing a property that already exists.
 *
 * `listings.update` was written, permission-gated, tested for reference
 * collisions, and **no screen had ever called it**. A brokerage could
 * add a property and then never change it: not the price, not the
 * status, not the permit number that arrives a week after the
 * instruction.
 *
 * That is the worst possible field to be unable to edit in this market.
 * A price reduction is the single most common thing an agent does to a
 * live listing, and moving a property to `UNDER_OFFER` is what stops the
 * matcher sending it to five more buyers after it is spoken for.
 *
 * ## Why the form sends every field rather than only the changed ones
 *
 * The procedure treats `undefined` as "leave it" and `null` as "clear
 * it", which is exactly right for an API and exactly wrong to replicate
 * in a form. What an agent sees on this dialog is what they believe the
 * listing says; if they clear the building name, they mean to clear it.
 * Sending the whole form makes the screen honest — what you see is what
 * is stored.
 *
 * `reference` is the exception. It is `.min(1)` and not nullable,
 * because it is the handle everything else uses, so an emptied field is
 * omitted rather than sent as a value the procedure would reject.
 */

type Listing = {
  id: string;
  reference: string;
  title: string;
  community: string | null;
  building: string | null;
  bedrooms: number | null;
  bathrooms: number | null;
  areaSqft: number | null;
  // Nullable, and the add form is why: a reference and a name are enough
  // to file an instruction, so an unpriced listing is a normal state
  // rather than a broken one.
  priceFils: bigint | null;
  purpose: string;
  status: string;
  permitNumber: string | null;
  permitExpiresAt: Date | string | null;
  reraBrokerCard: string | null;
};

export function EditListing({ listing }: { listing: Listing }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const utils = api.useUtils();
  const [error, setError] = useState<string | null>(null);

  const update = api.listings.update.useMutation({
    onSuccess: () => {
      void utils.listings.list.invalidate();
      dialog.current?.close();
    },
    onError: (e) => setError(e.message),
  });

  const open = () => {
    setError(null);
    update.reset();
    dialog.current?.showModal();
    dialog.current?.focus();
  };

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);

    /** Empty means cleared, which is `null` — not `undefined`. */
    const str = (k: string) => {
      const v = (f.get(k) as string | null)?.trim();
      return v ? v : null;
    };
    const num = (k: string) => {
      const v = str(k);
      if (v === null) return null;
      // Same trap as the add form: agents type "2,400,000", and a bare
      // Number() on that is NaN while Number("") is 0.
      const n = Number(v.replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    };

    const expiry = str("permitExpiresAt");
    const reference = str("reference");

    update.mutate({
      id: listing.id,
      // Omitted rather than nulled — see the note above.
      ...(reference ? { reference } : {}),
      ...(str("title") ? { title: str("title")! } : {}),
      community: str("community"),
      building: str("building"),
      bedrooms: num("bedrooms"),
      bathrooms: num("bathrooms"),
      areaSqft: num("areaSqft"),
      priceAed: num("priceAed"),
      purpose: f.get("purpose") as "SALE" | "RENT",
      status: f.get("status") as
        "DRAFT" | "AVAILABLE" | "UNDER_OFFER" | "SOLD" | "LET" | "WITHDRAWN",
      permitNumber: str("permitNumber"),
      permitExpiresAt: expiry
        ? new Date(`${expiry}T12:00:00.000Z`).toISOString()
        : null,
      reraBrokerCard: str("reraBrokerCard"),
    });
  }

  /** `<input type="date">` wants `YYYY-MM-DD` and nothing else. */
  const dateValue = listing.permitExpiresAt
    ? new Date(listing.permitExpiresAt).toISOString().slice(0, 10)
    : "";

  /**
   * Fils to whole dirhams for the field.
   *
   * `money.ts` owns display formatting, but this is an editable value
   * rather than a rendered one — it has to round-trip through the same
   * parser the add form uses, so it is a plain number with no separators
   * and no currency.
   */
  const priceAed =
    listing.priceFils !== null && listing.priceFils > 0n
      ? String(Number(listing.priceFils) / 100)
      : "";

  return (
    <>
      <Button size="sm" variant="secondary" onClick={open}>Edit</Button>

      <dialog
        ref={dialog}
        aria-labelledby={`edit-listing-title-${listing.id}`}
        tabIndex={-1}
        className="border border-ink rounded-[3px] p-0 max-w-[560px] w-[calc(100%-40px)] bg-raised text-ink-2 backdrop:bg-ink/50"
      >
        <form onSubmit={submit} className="p-6">
          <h2
            id={`edit-listing-title-${listing.id}`}
            className="font-sans font-semibold text-h3 text-ink mb-1.5"
          >
            Edit {listing.reference}
          </h2>
          <p className="text-sm text-ink-3 mb-5">
            What is here is what is stored. Clearing a field clears it.
          </p>

          {error && (
            <p role="alert" className="mb-4 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3.5">
            <Field name="reference" label="Reference" required defaultValue={listing.reference} autoFocus />
            <Field name="title" label="Name" required defaultValue={listing.title} />
            <Field name="community" label="Community" defaultValue={listing.community ?? ""} />
            <Field name="building" label="Building" defaultValue={listing.building ?? ""} />
            <Field name="bedrooms" label="Bedrooms" type="number" inputMode="numeric"
                   defaultValue={listing.bedrooms ?? ""} />
            <Field name="bathrooms" label="Bathrooms" type="number" inputMode="numeric"
                   defaultValue={listing.bathrooms ?? ""} />
            <Field name="areaSqft" label="Area (sq ft)" type="number" inputMode="numeric"
                   defaultValue={listing.areaSqft ?? ""} />
            <Field name="priceAed" label="Price (AED)" inputMode="decimal" defaultValue={priceAed} />

            <Select name="purpose" label="Purpose" defaultValue={listing.purpose}
                    options={[["SALE", "For sale"], ["RENT", "To let"]]} />
            {/*
              * The full set, unlike the add form.
              *
              * Adding a property offers only Available and Draft, because
              * nobody takes an instruction on something already sold. An
              * edit is where the rest of the life of a listing happens,
              * and `UNDER_OFFER` in particular is what stops the matcher
              * offering it to more buyers.
              */}
            <Select
              name="status"
              label="Status"
              defaultValue={listing.status}
              options={[
                ["AVAILABLE", "Available"],
                ["UNDER_OFFER", "Under offer"],
                ["SOLD", "Sold"],
                ["LET", "Let"],
                ["DRAFT", "Draft — not marketed yet"],
                ["WITHDRAWN", "Withdrawn"],
              ]}
            />
          </div>

          <div className="mt-6 pt-5 border-t border-rule">
            <p className="t-label text-ink-3 mb-3">
              Trakheesi permit — needed before it can be advertised
            </p>
            <div className="grid grid-cols-2 gap-3.5">
              <Field name="permitNumber" label="Permit number" defaultValue={listing.permitNumber ?? ""} />
              <Field name="permitExpiresAt" label="Expires" type="date" defaultValue={dateValue} />
              <Field name="reraBrokerCard" label="RERA broker card"
                     defaultValue={listing.reraBrokerCard ?? ""} />
            </div>
          </div>

          <div className="flex gap-2.5 mt-7">
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={update.isPending} className="ml-auto">
              Save changes
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** 16px on every input — below that iOS zooms the page on focus. */
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
      <span className="t-label text-ink-3">
        {label}{required && <span className="text-accent-deep"> *</span>}
      </span>
      <input
        name={name}
        type={type}
        required={required}
        autoComplete="off"
        className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
        {...rest}
      />
    </label>
  );
}

function Select({
  name, label, options, defaultValue,
}: { name: string; label: string; options: [string, string][]; defaultValue?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="t-label text-ink-3">{label}</span>
      <select
        name={name}
        defaultValue={defaultValue}
        className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
      >
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </label>
  );
}
