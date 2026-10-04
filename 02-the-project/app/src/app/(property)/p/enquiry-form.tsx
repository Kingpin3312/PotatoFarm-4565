/**
 * "Tell us what you're looking for" — the form on a brokerage's pages.
 *
 * For the buyer who will not open WhatsApp from a web page: a plain form
 * that works with no script, posting to `/p/<slug>/enquire`, which files
 * it as a lead and sends the buyer back here with a thank-you or with
 * what to fix. `website` is hidden from people and filled only by
 * scripts (`enquiry-form.ts`).
 */
export function EnquiryForm({ slug, back, reference, sent, problem, heading }: {
  slug: string; back: string; reference?: string; sent: boolean; problem: string | null; heading: string;
}) {
  const field = "w-full min-h-12 px-4 rounded-md bg-raised border border-rule-strong text-ui text-ink placeholder:text-ink-3 focus:outline-none focus:border-ink";
  return (
    <section id="enquire" className="mt-16 scroll-mt-6" aria-labelledby="enquire-h">
      <h2 id="enquire-h" className="text-note text-ink-3 uppercase tracking-[0.18em]">{heading}</h2>
      {sent ? (
        <p role="status" className="mt-4 text-body-lg text-ink">Thank you — we have your message and will be in touch shortly.</p>
      ) : (
        <form method="post" action={`/p/${encodeURIComponent(slug)}/enquire`} className="mt-4 grid gap-3 max-w-[560px]">
          {problem && <p role="alert" className="text-sm text-danger">{problem}</p>}
          <input type="hidden" name="back" value={back} />
          {reference && <input type="hidden" name="reference" value={reference} />}
          <label className="grid gap-1.5">
            <span className="text-sm text-ink-2">Your name</span>
            <input name="name" required maxLength={120} autoComplete="name" className={field} />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="grid gap-1.5">
              <span className="text-sm text-ink-2">Phone or WhatsApp</span>
              <input name="phone" type="tel" maxLength={30} autoComplete="tel" inputMode="tel" className={field} />
            </label>
            <label className="grid gap-1.5">
              <span className="text-sm text-ink-2">Email</span>
              <input name="email" type="email" maxLength={254} autoComplete="email" className={field} />
            </label>
          </div>
          <label className="grid gap-1.5">
            <span className="text-sm text-ink-2">What are you looking for?</span>
            <textarea name="message" rows={4} maxLength={2000} className={`${field} py-3`} />
          </label>
          {/* Hidden from people; a script fills it in. */}
          <div aria-hidden="true" className="sr-only">
            <label>Website <input name="website" tabIndex={-1} autoComplete="off" /></label>
          </div>
          <p className="text-sm text-ink-3">A phone number or an email, so we can reply. We use it only to answer you.</p>
          <div>
            <button type="submit"
              className="inline-flex items-center justify-center min-h-12 px-7 rounded-full bg-accent text-on-accent border border-[color:var(--accent-edge)] font-medium text-ui hover:bg-accent-hover focus-visible:outline-none focus-visible:shadow-[var(--ring)]">
              Send
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
