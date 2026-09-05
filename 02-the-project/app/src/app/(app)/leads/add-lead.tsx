"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * A buyer who did not arrive through a form.
 *
 * Three code paths created a `Lead` — the WhatsApp webhook, a portal
 * feed, and the assistant's structured intake — and every one of them
 * requires the buyer to make the first move. A walk-in to the office, a
 * referral from a neighbour, a number written down at a viewing: none of
 * it could be recorded, on a CRM.
 *
 * `lead:create` had been in the permission table since it was written,
 * assigned to AGENT, and nothing ever invoked it. The permission was not
 * the dead part — the feature behind it was missing.
 *
 * ## The phone number is the identity
 *
 * `orgId_phone` is unique, so entering a number already on file is a
 * conflict rather than a second record. That matters more than it looks:
 * two rows for one buyer splits their conversation history, and the
 * agent who picks up the second one has no idea the first exists.
 */
export function AddLead() {
  const dialog = useRef<HTMLDialogElement>(null);
  const utils = api.useUtils();
  const [error, setError] = useState<string | null>(null);

  const create = api.leads.create.useMutation({
    onSuccess: () => {
      void utils.leads.list.invalidate();
      void utils.leads.distribution.invalidate();
      dialog.current?.close();
    },
    // The duplicate-number conflict names whoever already owns them, and
    // that belongs in front of the agent rather than in a toast.
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

    create.mutate({
      /**
       * Spaces stripped, because people write numbers with them.
       *
       * The procedure requires E.164 — `+971501234567` — and an agent
       * typing "+971 50 123 4567" is entering a valid number that the
       * regex rejects. Failing that is technically correct and useless.
       */
      phone: (str("phone") ?? "").replace(/[\s-]/g, ""),
      name: str("name"),
      email: str("email"),
      source: (f.get("source") as "WALK_IN" | "REFERRAL" | "UNKNOWN") ?? "WALK_IN",
      notes: str("notes"),
    });
  }

  return (
    <>
      <Button size="sm" variant="primary" onClick={open}>Add a lead</Button>

      <dialog
        ref={dialog}
        aria-labelledby="add-lead-title"
        tabIndex={-1}
        className="border border-ink rounded-[3px] p-0 max-w-[520px] w-[calc(100%-40px)] bg-raised text-ink-2 backdrop:bg-ink/50"
      >
        <form onSubmit={submit} className="p-6">
          <h2 id="add-lead-title" className="font-sans font-semibold text-h3 text-ink mb-1.5">
            Add a lead
          </h2>
          <p className="text-sm text-ink-3 mb-5">
            A number is enough. It goes on the board and to whoever routing picks.
          </p>

          {error && (
            <p role="alert" className="mb-4 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3.5">
            <label className="flex flex-col gap-1.5 col-span-2">
              <span className="t-label text-ink-3">
                Mobile<span className="text-accent-deep"> *</span>
              </span>
              <input
                name="phone"
                type="tel"
                required
                autoFocus
                inputMode="tel"
                autoComplete="off"
                placeholder="+971 50 123 4567"
                className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
              />
              <span className="text-sm text-ink-3">
                With the country code — it is how this buyer is recognised next time.
              </span>
            </label>

            <Field name="name" label="Name" placeholder="Aisha Khan" />
            <Field name="email" label="Email" type="email" />

            <label className="flex flex-col gap-1.5">
              <span className="t-label text-ink-3">How they came to us</span>
              <select
                name="source"
                className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
              >
                <option value="WALK_IN">Walked in</option>
                <option value="REFERRAL">Referral</option>
                <option value="UNKNOWN">Not sure</option>
              </select>
            </label>
          </div>

          <label className="flex flex-col gap-1.5 mt-3.5">
            <span className="t-label text-ink-3">What they said</span>
            <textarea
              name="notes"
              rows={3}
              className="px-3 py-2.5 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink resize-y"
              placeholder="Two-bed in Marina, moving in September, cash."
            />
          </label>

          <div className="flex gap-2.5 mt-7">
            <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={create.isPending} className="ms-auto">
              Add them
            </Button>
          </div>
        </form>
      </dialog>
    </>
  );
}

/** 16px on every input — below that iOS zooms the page on focus. */
function Field({
  name, label, type = "text", ...rest
}: {
  name: string;
  label: string;
  type?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="t-label text-ink-3">{label}</span>
      <input
        name={name}
        type={type}
        autoComplete="off"
        className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
        {...rest}
      />
    </label>
  );
}
