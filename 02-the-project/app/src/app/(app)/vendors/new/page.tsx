"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Add an owner.
 *
 * The other half of every deal, and the weekly vendor report has nobody
 * to send to without it.
 */
export default function NewVendor() {
  const create = api.vendors.create.useMutation();
  const [f, setF] = useState({
    name: "", phone: "", email: "",
    prefers: "WHATSAPP" as "WHATSAPP" | "CALL" | "EMAIL" | "OFFERS_ONLY",
    reportDay: 4 as number | null,
    actingFor: "",
  });

  if (create.isSuccess) {
    return (
      <div className="max-w-[560px] mx-auto px-6 py-20">
        <h1 className="font-sans font-semibold text-[30px] text-ink -tracking-[0.026em]">Added.</h1>
        <p className="text-[17px] text-ink-2 mt-3">Attach them to a listing next.</p>
        <a href="/listings" className="btn-inline mt-6 inline-block">Listings</a>
      </div>
    );
  }

  const PREFERS = [
    ["WHATSAPP", "WhatsApp", "Most owners. Fast, and they can read it later."],
    ["CALL", "A call", "The report is prepared and put on your list — we don't ring people."],
    ["EMAIL", "Email", "For owners who want something they can forward."],
    ["OFFERS_ONLY", "Only when there's an offer",
     "A real instruction some owners give. Ringing one of them for a chat is the fastest way to lose the property."],
  ] as const;

  return (
    <div className="max-w-[560px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <h1 className="font-sans font-semibold text-[clamp(2rem,1.5rem+2vw,2.5rem)] text-ink -tracking-[0.026em] leading-none">
          Add an owner
        </h1>
      </header>

      <div className="space-y-5">
        <F label="Name" v={f.name} on={(v) => setF({ ...f, name: v })} ac="name" />
        <F label="Phone" v={f.phone} on={(v) => setF({ ...f, phone: v })} type="tel" ac="tel" />
        <F label="Email" v={f.email} on={(v) => setF({ ...f, email: v })} type="email" ac="email" />
        <F label="Acting for (if not the owner)" v={f.actingFor}
           on={(v) => setF({ ...f, actingFor: v })}
           placeholder="Power of attorney, family member, company rep" />

        <div>
          <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
            How they want to hear from you
          </span>
          <div className="space-y-2">
            {PREFERS.map(([k, label, why]) => (
              <button key={k} onClick={() => setF({ ...f, prefers: k })}
                aria-pressed={f.prefers === k}
                className={`w-full text-left min-h-11 px-4 py-3 rounded-lg border ${
                  f.prefers === k ? "border-accent-edge bg-sunk" : "border-rule"}`}>
                <span className="text-[16px] text-ink font-semibold block">{label}</span>
                <span className="text-sm text-ink-2 block mt-0.5 leading-snug">{why}</span>
              </button>
            ))}
          </div>
        </div>

        {f.prefers !== "OFFERS_ONLY" && (
          <div>
            <span className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
              Weekly report day
            </span>
            <div className="flex gap-2 flex-wrap">
              {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d, i) => (
                <button key={d} onClick={() => setF({ ...f, reportDay: i + 1 })}
                  aria-pressed={f.reportDay === i + 1}
                  className={`min-h-11 px-3 rounded-lg border text-[15px] ${
                    f.reportDay === i + 1
                      ? "bg-accent text-on-accent border-accent-edge font-semibold"
                      : "border-rule text-ink"}`}>{d}</button>
              ))}
              <button onClick={() => setF({ ...f, reportDay: null })}
                aria-pressed={f.reportDay === null}
                className={`min-h-11 px-3 rounded-lg border text-[15px] ${
                  f.reportDay === null ? "bg-sunk border-ink text-ink font-semibold" : "border-rule text-ink"}`}>
                None
              </button>
            </div>
            <p className="text-sm text-ink-2 mt-2 max-w-[44ch] leading-snug">
              A quiet week is still worth sending. An owner who hears nothing assumes you've
              stopped trying.
            </p>
          </div>
        )}
      </div>

      {create.error && <p role="alert" className="text-sm text-danger mt-5">{create.error.message}</p>}

      <Button variant="primary" full className="mt-8" loading={create.isPending}
        disabled={f.name.trim().length < 2}
        onClick={() => create.mutate({
          name: f.name, phone: f.phone || undefined, email: f.email || undefined,
          prefers: f.prefers, reportDay: f.reportDay,
          actingFor: f.actingFor || undefined,
        })}>
        Add
      </Button>
    </div>
  );
}

function F({ label, v, on, type = "text", ac, placeholder }: {
  label: string; v: string; on: (s: string) => void;
  type?: string; ac?: string; placeholder?: string;
}) {
  const id = label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="block font-mono text-[10px] uppercase tracking-[0.12em] text-ink-3 mb-2">
        {label}
      </label>
      <input id={id} type={type} value={v} autoComplete={ac} placeholder={placeholder}
             onChange={(e) => on(e.target.value)}
             className="w-full min-h-11 px-4 text-[16px] text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
    </div>
  );
}
