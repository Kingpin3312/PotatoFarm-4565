"use client";

import { useState } from "react";
import { api } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/ui/query-state";
import { cn } from "@/lib/cn";
import { LONG_HORIZON_BUYER, PLAN_LIMITS, describeStep, planProblems, type Step } from "@/server/lib/plans/run";

/**
 * The brokerage's nurture plans.
 *
 * `plans.advance` had run every morning since it was written over a
 * table nothing could put a row in. This is where a plan is written, and
 * where everybody can see what each plan will ask of them and how the
 * people on it have fared.
 *
 * The honest measure of a plan is sitting next to it: "replied" is the
 * good ending, and a plan most people finish is one nobody answered.
 */
const AUDIENCES = [
  ["BUYER", "Buyers"], ["SELLER", "Sellers"], ["LANDLORD", "Landlords"],
  ["TENANT", "Tenants"], ["PAST_CLIENT", "Past clients"],
] as const;
const ACTIONS = [
  ["CHECK_MATCHES", "Look for a property that fits"],
  ["MESSAGE", "Send a template message"],
  ["TASK", "A task for the agent"],
  ["REVIEW", "Decide whether to carry on"],
] as const;

const input = "w-full min-h-11 px-3 text-control text-ink bg-sunk border border-rule rounded-lg focus-visible:outline-none focus-visible:shadow-[var(--ring)]";

export default function Plans() {
  const { data, isLoading, isError, refetch, error } = api.plans.list.useQuery();
  const utils = api.useUtils();
  const [building, setBuilding] = useState(false);
  const setActive = api.plans.setActive.useMutation({ onSuccess: () => void utils.plans.list.invalidate() });

  if (isError) return <QueryError retry={() => void refetch()} what="the plans" error={error} />;
  if (isLoading || !data) return <div className="max-w-[680px] mx-auto px-6 pt-10"><div className="h-64 bg-sunk rounded-sm" aria-busy /></div>;

  const inUse = data.plans.filter((p) => p.active);
  const retired = data.plans.filter((p) => !p.active);

  return (
    <div className="max-w-[680px] mx-auto px-6 pb-24">
      <header className="pt-10 pb-6">
        <span className="t-label text-ink-3 block mb-3">Nurture plans</span>
        <h1 className="font-sans font-semibold text-page text-ink">
          {inUse.length === 0 ? "No plans yet" : `${inUse.length} ${inUse.length === 1 ? "plan" : "plans"} in use`}
        </h1>
        <p className="text-sm text-ink-2 mt-3 max-w-[52ch]">
          For somebody who said &ldquo;in about six months&rdquo;. A plan puts the next thing to do on
          their agent&rsquo;s list at the right time — nothing is sent by itself, and a reply from them
          pauses it until the agent decides to carry on.
        </p>
        <p className="text-sm text-ink-2 mt-2 max-w-[52ch]">
          Put somebody on a plan from their page in the Blackbook.
        </p>
      </header>

      {data.canManage && !building && (
        <Button variant="primary" onClick={() => setBuilding(true)}>New plan</Button>
      )}
      {building && <Builder onDone={() => { setBuilding(false); void utils.plans.list.invalidate(); }} />}

      {setActive.error && <p role="alert" className="text-sm text-danger mt-4">{setActive.error.message}</p>}

      <div className="mt-8 border-t border-ink">
        {inUse.map((p) => (
          <PlanRow key={p.id} plan={p} action={data.canManage ? (
            <button type="button" className="btn-inline min-h-11" onClick={() => setActive.mutate({ planId: p.id, active: false })}>
              Retire
            </button>
          ) : null} />
        ))}
      </div>

      {retired.length > 0 && (
        <>
          <h2 className="font-sans font-medium text-sub text-ink mt-12 mb-1">Retired</h2>
          <p className="text-sm text-ink-2 mb-3 max-w-[52ch]">
            Nobody new goes on these. Anyone already on one carries on until their agent stops it.
          </p>
          <div className="border-t border-ink">
            {retired.map((p) => (
              <PlanRow key={p.id} plan={p} action={data.canManage ? (
                <button type="button" className="btn-inline min-h-11" onClick={() => setActive.mutate({ planId: p.id, active: true })}>
                  Bring back
                </button>
              ) : null} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

type Plan = {
  id: string; name: string; description: string | null; audience: string; active: boolean;
  steps: { order: number; afterDays: number; says: string }[];
  totalDays: number; running: number; paused: number; completed: number; stopped: number;
};

function PlanRow({ plan, action }: { plan: Plan; action: React.ReactNode }) {
  const audience = AUDIENCES.find(([k]) => k === plan.audience)?.[1] ?? plan.audience;
  return (
    <section className="py-5 border-b border-rule" aria-label={plan.name}>
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 className="text-control text-ink font-medium">{plan.name}</h2>
        <span className="t-label text-ink-3">{audience}</span>
        <span className="ms-auto">{action}</span>
      </div>
      {plan.description && <p className="text-sm text-ink-2 mt-1 max-w-[56ch]">{plan.description}</p>}
      <p className="text-sm text-ink-2 mt-1 tabular">
        {plan.steps.length} {plan.steps.length === 1 ? "step" : "steps"} over {plan.totalDays} days ·{" "}
        {plan.running} on it · {plan.paused} replied · {plan.completed} finished · {plan.stopped} stopped
      </p>
      {/* Numbered because it is a sequence: the order is the plan. */}
      <ol className="mt-3 space-y-1.5">
        {plan.steps.map((s) => (
          <li key={s.order} className="grid grid-cols-[88px_minmax(0,1fr)] gap-3 text-sm">
            <span className="text-ink-3 tabular">+{s.afterDays} {s.afterDays === 1 ? "day" : "days"}</span>
            <span className="text-ink leading-snug">{s.says}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

type Draft = { action: Step["action"]; afterDays: string; template: string; taskTitle: string };
const blank = (): Draft => ({ action: "TASK", afterDays: "14", template: "", taskTitle: "" });

function Builder({ onDone }: { onDone: () => void }) {
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<(typeof AUDIENCES)[number][0]>("BUYER");
  const [description, setDescription] = useState("");
  const [steps, setSteps] = useState<Draft[]>([blank()]);
  const create = api.plans.create.useMutation({ onSuccess: onDone });

  const asSteps: Step[] = steps.map((s, i) => ({
    order: i + 1, afterDays: Number(s.afterDays), action: s.action,
    template: s.template, taskTitle: s.taskTitle,
  }));
  // The server says the same sentences; showing them here means nobody
  // finds out by pressing Save.
  const problems = [...(name.trim().length < 2 ? ["Give the plan a name."] : []), ...planProblems(asSteps)];
  const set = (i: number, patch: Partial<Draft>) => setSteps(steps.map((s, j) => (j === i ? { ...s, ...patch } : s)));

  const example = () => {
    setName("Long horizon buyer");
    setAudience("BUYER");
    setDescription("For a buyer who said around six months. Six touches over five months, none of them “just checking in”.");
    setSteps(LONG_HORIZON_BUYER.map((s) => ({
      action: s.action, afterDays: String(s.afterDays), template: s.action === "MESSAGE" ? s.template ?? "" : "", taskTitle: s.taskTitle ?? "",
    })));
  };

  return (
    <section className="mt-6 border border-rule rounded-lg p-4" aria-labelledby="new-plan">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h2 id="new-plan" className="font-sans font-medium text-sub text-ink">New plan</h2>
        <button type="button" className="ms-auto btn-inline min-h-11" onClick={example}>Start from the example</button>
      </div>
      <p className="text-sm text-ink-2 mt-1 max-w-[56ch]">
        A plan can&rsquo;t be edited once people are on it — they are part-way through its steps. To
        change one, write a new plan and retire the old.
      </p>

      <div className="grid grid-cols-[minmax(0,1fr)_180px] max-[560px]:grid-cols-1 gap-4 mt-4">
        <label className="block">
          <span className="t-label text-ink-3 block mb-1.5">Name</span>
          <input className={input} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="block">
          <span className="t-label text-ink-3 block mb-1.5">For</span>
          <select className={input} value={audience} onChange={(e) => setAudience(e.target.value as typeof audience)}>
            {AUDIENCES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </label>
      </div>
      <label className="block mt-4">
        <span className="t-label text-ink-3 block mb-1.5">What it&rsquo;s for (optional)</span>
        <input className={input} value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
      </label>

      <ol className="mt-6 space-y-4">
        {steps.map((s, i) => (
          <li key={i} className="border-t border-rule pt-4">
            <div className="flex items-baseline gap-3">
              <span className="t-label text-ink-3">Step {i + 1}</span>
              {steps.length > 1 && (
                <button type="button" className="ms-auto btn-inline min-h-11"
                  onClick={() => setSteps(steps.filter((_, j) => j !== i))}>
                  Remove
                </button>
              )}
            </div>
            <div className="grid grid-cols-[minmax(0,1fr)_140px] max-[560px]:grid-cols-1 gap-4 mt-2">
              <label className="block">
                <span className="t-label text-ink-3 block mb-1.5">What happens</span>
                <select className={input} value={s.action} onChange={(e) => set(i, { action: e.target.value as Draft["action"] })}>
                  {ACTIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </label>
              <label className="block">
                <span className="t-label text-ink-3 block mb-1.5">{i === 0 ? "Days after they start" : "Days after the last"}</span>
                <input className={input} inputMode="numeric" value={s.afterDays}
                  onChange={(e) => set(i, { afterDays: e.target.value.replace(/\D/g, "") })} />
              </label>
            </div>
            {s.action === "MESSAGE" && (
              <label className="block mt-3">
                <span className="t-label text-ink-3 block mb-1.5">Approved WhatsApp template</span>
                <input className={input} value={s.template} maxLength={80} placeholder="e.g. market_note"
                  onChange={(e) => set(i, { template: e.target.value })} />
              </label>
            )}
            {(s.action === "TASK" || s.action === "REVIEW") && (
              <label className="block mt-3">
                <span className="t-label text-ink-3 block mb-1.5">
                  {s.action === "TASK" ? "What the agent should do" : "What to ask the agent (optional)"}
                </span>
                <input className={input} value={s.taskTitle} maxLength={160}
                  placeholder={s.action === "TASK" ? "e.g. Call — they said around now" : undefined}
                  onChange={(e) => set(i, { taskTitle: e.target.value })} />
              </label>
            )}
            <p className="text-sm text-ink-2 mt-2">{describeStep(asSteps[i]!)}</p>
          </li>
        ))}
      </ol>

      {steps.length < PLAN_LIMITS.maxSteps && (
        <button type="button" className="btn-inline min-h-11 mt-4" onClick={() => setSteps([...steps, blank()])}>
          Add a step
        </button>
      )}

      {(problems.length > 0 || create.error) && (
        <ul role="alert" className={cn("mt-4 space-y-1 text-sm", create.error ? "text-danger" : "text-ink-2")}>
          {create.error ? <li>{create.error.message}</li> : problems.map((p) => <li key={p}>{p}</li>)}
        </ul>
      )}

      <div className="flex gap-2 mt-5">
        <Button variant="primary" loading={create.isPending} disabled={problems.length > 0}
          onClick={() => create.mutate({
            name: name.trim(), audience, description: description.trim() || undefined,
            steps: asSteps.map((s) => ({ action: s.action, afterDays: s.afterDays, template: s.template || undefined, taskTitle: s.taskTitle || undefined })),
          })}>
          Save plan
        </Button>
        <button type="button" className="btn-inline" onClick={onDone}>Cancel</button>
      </div>
    </section>
  );
}
