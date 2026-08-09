/**
 * Where NextAuth sends somebody after the link goes out.
 *
 * `config.ts` names this as `verifyRequest` and it did not exist, so the
 * one moment in the flow where a person is told what to do next was a
 * 404 — after we had already sent the email, which is the worst place to
 * lose them.
 *
 * The junk-folder line is not filler. Sign-in depends entirely on email
 * delivery — that is the acknowledged cost of having no passwords — and
 * a first-time recipient at a brokerage on Microsoft 365 will often find
 * it in Other or Junk. Telling them up front is the difference between a
 * two-minute delay and a support call.
 */
export default function CheckYourEmail() {
  return (
    <main id="main" className="max-w-[46ch] mx-auto px-6 py-24">
      <h1 className="font-sans font-semibold text-[32px] text-ink -tracking-[0.026em] leading-tight">
        Check your email.
      </h1>
      <p className="text-[17px] text-ink-2 mt-4">
        The link signs you straight in. It works once and it lasts ten minutes.
      </p>
      <p className="text-[15px] text-ink-2 mt-4 leading-snug">
        Nothing after a minute or two? Look in Junk or Other — it is the first message we
        have sent you, so it has no history to be judged on.
      </p>

      <div className="mt-10 pt-6 border-t border-rule">
        <p className="text-[15px] text-ink-2 leading-snug">
          Wrong address, or it never arrives?{" "}
          <a href="/sign-in" className="text-accent-type underline">
            Try again
          </a>{" "}
          or email{" "}
          <a href="mailto:hello@potatofarm.io" className="text-accent-type underline">
            hello@potatofarm.io
          </a>{" "}
          and a person will sort it.
        </p>
      </div>
    </main>
  );
}
