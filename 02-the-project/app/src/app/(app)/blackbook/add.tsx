"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Adding somebody who is in nobody's pipeline.
 *
 * A mortgage broker, a conveyancer, a developer's sales manager. They
 * will never be a lead and an agent deals with them constantly — which
 * is the difference between a blackbook and a CRM contact list.
 */
export function AddToBlackbook({ onDone }: { onDone?: () => void }) {
  const add = api.blackbook.add.useMutation({ onSuccess: onDone });
  const [f, setF] = useState({ standaloneName: "", standalonePhone: "",
                               standaloneEmail: "", nickname: "", tagText: "" });

  return (
    <div className="bg-sunk rounded-xl p-5">
      <h2 className="font-sans font-medium text-sub text-accent-deep mb-3">Add somebody</h2>
      <div className="space-y-4">
        <F label="Name" v={f.standaloneName} on={(v) => setF({ ...f, standaloneName: v })} />
        <F label="Phone" v={f.standalonePhone} on={(v) => setF({ ...f, standalonePhone: v })} type="tel" />
        <F label="Email" v={f.standaloneEmail} on={(v) => setF({ ...f, standaloneEmail: v })} type="email" />
        <F label="What you call them" v={f.nickname} on={(v) => setF({ ...f, nickname: v })}
           hint="Often not their legal name, and that's the point." />
        <F label="Tags" v={f.tagText} on={(v) => setF({ ...f, tagText: v })}
           placeholder="mortgage broker, Emaar, school run"
           hint="Your own words, comma separated. Not the brokerage's pipeline stages." />
      </div>
      <Button variant="primary" className="mt-5" loading={add.isPending}
        disabled={f.standaloneName.trim().length < 2}
        onClick={() => add.mutate({
          standaloneName: f.standaloneName,
          standalonePhone: f.standalonePhone || undefined,
          standaloneEmail: f.standaloneEmail || undefined,
          nickname: f.nickname || undefined,
          tags: f.tagText.split(",").map((t) => t.trim()).filter(Boolean).slice(0, 12),
        })}>
        Add
      </Button>
    </div>
  );
}

function F({ label, v, on, type = "text", hint, placeholder }: {
  label: string; v: string; on: (s: string) => void;
  type?: string; hint?: string; placeholder?: string;
}) {
  const id = "bb-" + label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div>
      <label htmlFor={id} className="block t-label text-ink-3 mb-2">
        {label}
      </label>
      <input id={id} type={type} value={v} placeholder={placeholder}
        onChange={(e) => on(e.target.value)}
        className="w-full min-h-11 px-4 text-control text-ink bg-raised border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]" />
      {hint && <p className="text-sm text-ink-2 mt-1.5 max-w-[42ch] leading-snug">{hint}</p>}
    </div>
  );
}
