"use client";

import { useRef, useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Connecting a channel, which the product could not do.
 *
 * On a WhatsApp-first CRM this was not a missing settings page. Inbound
 * routing finds the brokerage by matching the webhook's phone number id
 * against `Channel.identifier`, and nothing anywhere created a Channel —
 * so every inbound message was logged as "a message for an unknown
 * number" and dropped, and the inbox, the assistant and the whole lead
 * intake path sat downstream of a table nobody could write to.
 *
 * ## Why there is no box for the access token
 *
 * `lib/secrets.ts` is explicit that tokens never go into Postgres, so a
 * database dump carries nothing that can message a brokerage's
 * customers. No secrets provider is wired up yet, so there is nowhere
 * for this form to put one. Adding a column would have quietly
 * overturned a load-bearing security decision to save an owner a single
 * deploy.
 *
 * So connecting has two halves, and the screen says so plainly rather
 * than looking finished and failing later. The useful half is
 * immediate: **inbound works the moment the channel exists**, because
 * the webhook is verified with the app-wide secret and routed by
 * number. Only sending waits.
 */
const TYPES = [
  ["WHATSAPP", "WhatsApp"],
  ["META_LEAD_ADS", "Facebook / Instagram lead ads"],
  ["PROPERTY_FINDER", "Property Finder"],
  ["BAYUT", "Bayut"],
  ["DUBIZZLE", "Dubizzle"],
  ["WEBSITE_FORM", "Website form"],
] as const;

const HINT: Record<string, { label: string; hint: string }> = {
  WHATSAPP: {
    label: "Phone number ID",
    hint: "Meta Business Suite → WhatsApp → API Setup. A long number, not the phone number itself.",
  },
  META_LEAD_ADS: {
    label: "Facebook Page ID",
    hint: "The Page the lead form runs on. Page → About → Page transparency.",
  },
  PROPERTY_FINDER: { label: "Account reference", hint: "From your Property Finder account manager." },
  BAYUT: { label: "Account reference", hint: "From your Bayut account manager." },
  DUBIZZLE: { label: "Account reference", hint: "From your Dubizzle account manager." },
  WEBSITE_FORM: { label: "Form name", hint: "Any name you will recognise." },
};

export function ConnectChannel() {
  const dialog = useRef<HTMLDialogElement>(null);
  const utils = api.useUtils();
  const [type, setType] = useState<string>("WHATSAPP");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<
    { label: string; secretRef: string | null; tokenStored: boolean } | null
  >(null);

  const connect = api.channels.connect.useMutation({
    onSuccess: (c) => {
      void utils.channels.list.invalidate();
      void utils.channels.health.invalidate();
      // The dialog stays open on success, showing what to do next. A
      // WhatsApp channel is half-connected at this point and closing
      // would be the product implying otherwise.
      setDone({ label: c.label, secretRef: c.secretRef ?? null, tokenStored: c.tokenStored });
    },
    onError: (e) => setError(e.message),
  });

  const open = () => {
    setError(null);
    setDone(null);
    connect.reset();
    dialog.current?.showModal();
    dialog.current?.focus();
  };

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    const f = new FormData(e.currentTarget);
    const token = String(f.get("accessToken") ?? "").trim();
    connect.mutate({
      type: type as "WHATSAPP",
      label: String(f.get("label") ?? "").trim(),
      identifier: String(f.get("identifier") ?? "").trim(),
      // Optional. Inbound works without it, so somebody who has not got
      // the token to hand can connect now and paste it later.
      ...(token ? { accessToken: token } : {}),
    });
  }

  const meta = HINT[type] ?? { label: "Identifier", hint: "" };

  return (
    <>
      <Button size="sm" variant="primary" onClick={open}>Connect a channel</Button>

      <dialog
        ref={dialog}
        aria-labelledby="connect-title"
        tabIndex={-1}
        className="border border-ink rounded-[3px] p-0 max-w-[560px] w-[calc(100%-40px)] bg-raised text-ink-2 backdrop:bg-ink/50"
      >
        {done ? (
          <div className="p-6">
            <h2 id="connect-title" className="font-sans font-semibold text-h3 text-ink mb-1.5">
              {done.label} is connected
            </h2>
            <p className="text-sm text-ink-2 mb-5 max-w-[52ch]">
              Incoming messages will now reach this brokerage.
            </p>

            {done.secretRef && (
              done.tokenStored ? (
                <div className="border border-rule rounded-[3px] p-4 bg-ground">
                  <p className="text-sm text-ink-2 leading-snug">
                    The access token is stored, encrypted, so this number can send as well
                    as receive. Nobody can read it back — including us — and replacing it
                    is the way to change it.
                  </p>
                </div>
              ) : (
                /* Still a real state, and no longer the only one. The
                   token can be pasted here now; leaving it out is a
                   choice rather than the product's limitation. */
                <div className="border border-rule rounded-[3px] p-4 bg-ground">
                  <p className="t-label text-ink-3 mb-2">
                    Receiving only, for now
                  </p>
                  <p className="text-sm text-ink-2 leading-snug">
                    Messages to this number arrive. Replies will not send until its access
                    token is added — reconnect the number with the token to hand, and this
                    screen will stop saying so.
                  </p>
                </div>
              )
            )}

            <div className="flex mt-7">
              <Button variant="primary" className="ms-auto" onClick={() => dialog.current?.close()}>
                Done
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit} className="p-6">
            <h2 id="connect-title" className="font-sans font-semibold text-h3 text-ink mb-1.5">
              Connect a channel
            </h2>
            <p className="text-sm text-ink-3 mb-5">
              Where your leads arrive from.
            </p>

            {error && (
              <p role="alert" className="mb-4 px-3 py-2.5 bg-ink text-ground text-sm rounded-[3px]">
                {error}
              </p>
            )}

            <div className="flex flex-col gap-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="t-label text-ink-3">Type</span>
                <select
                  name="type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
                >
                  {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </label>

              {/* The field this form used to refuse to have.
                  There was nowhere to put a token, so connecting had two
                  halves and the second one was a redeploy. */}
              <label className="flex flex-col gap-1.5 order-last">
                <span className="t-label text-ink-3">
                  Access token
                </span>
                <input
                  name="accessToken"
                  type="password"
                  autoComplete="off"
                  placeholder="Optional — paste it now or add it later"
                  className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
                />
                <span className="text-note text-ink-3 leading-snug max-w-[46ch]">
                  Encrypted before it is stored, and never shown again. Without it the
                  number receives messages but cannot reply.
                </span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="t-label text-ink-3">
                  Name <span className="text-accent-deep">*</span>
                </span>
                <input
                  name="label"
                  required
                  autoFocus
                  placeholder="Main sales number"
                  autoComplete="off"
                  className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
                />
                <span className="text-note text-ink-3">What you will call it. Yours, not Meta&rsquo;s.</span>
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="t-label text-ink-3">
                  {meta.label} <span className="text-accent-deep">*</span>
                </span>
                <input
                  name="identifier"
                  required
                  autoComplete="off"
                  className="min-h-11 px-3 text-control bg-ground border border-rule rounded-[3px] text-ink outline-none focus:border-ink"
                />
                {/* The hint changes with the type, because "identifier"
                    is the right column name and useless on a form — the
                    owner is looking at a dashboard where it is called
                    something else. */}
                <span className="text-note text-ink-3 leading-snug">{meta.hint}</span>
              </label>
            </div>

            <div className="flex gap-2.5 mt-7">
              <Button type="button" variant="secondary" onClick={() => dialog.current?.close()}>
                Cancel
              </Button>
              <Button type="submit" variant="primary" loading={connect.isPending} className="ms-auto">
                Connect
              </Button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
