"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { demoRequest, type DemoRequest } from "@/lib/validation";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";

export function DemoForm() {
  const [sent, setSent] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const startedAt = useRef(Date.now());

  const {
    register,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<DemoRequest>({
    resolver: zodResolver(demoRequest),
    // Validate on blur, not on every keystroke. Telling someone their email
    // is invalid while they are still halfway through typing it is the
    // fastest way to make a form feel hostile.
    mode: "onBlur",
  });

  useEffect(() => setFocus("name"), [setFocus]);

  async function onSubmit(values: DemoRequest) {
    setFailed(null);
    try {
      const res = await fetch("/api/demo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, startedAt: startedAt.current }),
      });

      if (res.ok) {
        setSent(true);
        return;
      }

      const body = (await res.json()) as {
        error?: string;
        fields?: Record<string, string[]>;
      };

      // Server-side field errors land back under the right field rather
      // than in one lump at the top.
      if (body.fields) {
        Object.entries(body.fields).forEach(([k, msgs]) =>
          setError(k as keyof DemoRequest, { message: msgs[0] })
        );
        return;
      }
      setFailed(body.error ?? "Something went wrong at our end.");
    } catch {
      // Network failure. Say what happened and reassure them nothing was
      // lost, because that is the first thing anyone worries about.
      setFailed("We couldn't reach the server. Check your connection — nothing was lost.");
    }
  }

  if (sent) {
    // role="status" so a screen reader announces this without the user
    // having to go looking for it.
    return (
      <div role="status" className="formcard">
        <h3>Thanks — that&rsquo;s with us.</h3>
        <p className="mt-2">
          We&rsquo;ll message you on WhatsApp within the hour during working hours,
          and first thing otherwise.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} noValidate className="formcard">
      {/* Honeypot. Hidden from people, visible to bots. Not display:none —
          some bots skip those — and taken out of the tab order. */}
      <div aria-hidden className="absolute left-[-9999px] h-0 overflow-hidden">
        <label htmlFor="website">Website</label>
        <input id="website" tabIndex={-1} autoComplete="off" {...register("website")} />
      </div>

      <Field label="Your name" error={errors.name?.message}
        hint="We'll need this to know who we're calling." {...register("name")} />

      <Field label="Brokerage" error={errors.company?.message}
        hint="So we can look at your listings before the call." {...register("company")} />

      <Field label="WhatsApp number" type="tel" error={errors.phone?.message}
        hint="Include the country code, like +971 50 123 4567." {...register("phone")} />

      <Field label="Work email" type="email" error={errors.email?.message}
        hint="For the calendar invite and nothing else." {...register("email")} />

      <div className="field">
        <label htmlFor="teamSize">How many agents?</label>
        <select id="teamSize" className="ctrl" {...register("teamSize")}>
          <option value="solo">Just me</option>
          <option value="2-10">2 – 10</option>
          <option value="11-50">11 – 50</option>
          <option value="50+">50+</option>
        </select>
      </div>

      <label className="consent">
        <input type="checkbox" {...register("consent")} />
        <span>
          I&rsquo;m happy for Potato to contact me about a demo. We won&rsquo;t add you to a
          mailing list and we won&rsquo;t pass your details on.
        </span>
      </label>
      {errors.consent && <p className="hint err">{errors.consent.message}</p>}

      {failed && (
        <p role="alert" className="hint err mb-3">
          {failed}
        </p>
      )}

      <Button type="submit" size="lg" full loading={isSubmitting}>
        Book the call
      </Button>
      <p className="note text-center">Usually answered within the hour during working hours.</p>
    </form>
  );
}
