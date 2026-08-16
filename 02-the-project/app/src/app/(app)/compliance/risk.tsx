"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";

/**
 * Risk assessment.
 *
 * My first version asked the officer to pick low, medium or high. That
 * was wrong, and the router shows why: it takes **factors** and derives
 * the rating itself.
 *
 * That is the better design. An officer answering "is this a company?"
 * and "is cash involved?" is answering questions of fact. An officer
 * picking "medium" is making a judgement they will later struggle to
 * defend — and an inspector asks what the rating was based on, not what
 * it was.
 */
/**
 * Nothing mounts this yet.
 *
 * `AssessRisk` is imported by no screen — the compliance pages show
 * screenings and reviews, and never offer the risk assessment that
 * `aml.assessRisk` exists to record. Worth knowing before anyone counts
 * risk rating as a working feature.
 *
 * `dealValueFils` is a required prop rather than a defaulted one:
 * transaction value is one of the inputs that decides the rating, and a
 * silent zero would quietly rate every high-value deal as low risk.
 * Whoever mounts this has to supply it.
 */
export function AssessRisk({ kycId, dealValueFils }: {
  kycId: string;
  dealValueFils: bigint;
}) {
  const assess = api.aml.assessRisk.useMutation();
  const [f, setF] = useState({
    isPep: false, isNonResident: false, isCompany: false,
    uboCount: 0, cashInvolved: false,
  });

  if (assess.isSuccess) {
    return (
      <div className="border-t border-rule pt-5">
        <p className="text-sub text-ink font-medium">
          {assess.data.rating} risk
        </p>
        <ul className="mt-2 space-y-1">
          {assess.data.reasons.map((r, i) => (
            <li key={i} className="text-sm text-ink-2">{r}</li>
          ))}
        </ul>
        <p className="text-sm text-ink-3 mt-3">
          Review due {new Date(assess.data.reviewDueAt).toLocaleDateString("en-GB")}.
        </p>
      </div>
    );
  }

  return (
    <div className="border-t border-rule pt-5">
      <h2 className="font-sans font-medium text-sub text-accent-deep mb-1">Risk factors</h2>
      <p className="text-sm text-ink-2 mb-4 max-w-[46ch] leading-snug">
        Questions of fact, not judgement. The rating and the review interval come out of
        these — which is what an inspector asks about.
      </p>

      <Check label="A politically exposed person"
        hint="Or an immediate family member or close associate of one."
        on={f.isPep} set={(v) => setF({ ...f, isPep: v })} />
      <Check label="Not resident in the UAE"
        on={f.isNonResident} set={(v) => setF({ ...f, isNonResident: v })} />
      <Check label="Buying through a company"
        on={f.isCompany} set={(v) => setF({ ...f, isCompany: v })} />
      <Check label="Cash is involved"
        hint="Any part of the consideration, not only the whole."
        on={f.cashInvolved} set={(v) => setF({ ...f, cashInvolved: v })} />

      {f.isCompany && (
        <div className="py-4 border-b border-rule">
          <label htmlFor="ubo" className="block t-label text-ink-3 mb-2">
            Beneficial owners identified
          </label>
          <input id="ubo" type="number" min={0} value={f.uboCount}
            onChange={(e) => setF({ ...f, uboCount: Number(e.target.value) || 0 })}
            className="w-24 min-h-11 px-4 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)] tabular" />
          <p className="text-sm text-ink-2 mt-1.5 max-w-[44ch] leading-snug">
            Anyone holding 25% or more. Zero identified on a company purchase is itself a
            risk factor.
          </p>
        </div>
      )}

      <Button variant="primary" className="mt-5" loading={assess.isPending}
        onClick={() => assess.mutate({ kycId, dealValueFils, ...f })}>
        Assess
      </Button>
    </div>
  );
}

function Check({ label, hint, on, set }: {
  label: string; hint?: string; on: boolean; set: (v: boolean) => void;
}) {
  const id = "rf-" + label.toLowerCase().replace(/[^a-z]+/g, "-");
  return (
    <div className="py-4 border-b border-rule">
      <label htmlFor={id} className="flex items-start gap-3 cursor-pointer min-h-11">
        <input id={id} type="checkbox" checked={on} onChange={(e) => set(e.target.checked)}
          className="mt-1 w-5 h-5 accent-[var(--accent)]" />
        <span>
          <span className="text-control text-ink">{label}</span>
          {hint && <span className="block text-sm text-ink-2 mt-0.5 max-w-[44ch] leading-snug">{hint}</span>}
        </span>
      </label>
    </div>
  );
}
