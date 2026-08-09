import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

/**
 * The quiet ask, server side.
 *
 * A guide reader who leaves an email is the most qualified lead this
 * site produces — they have the problem, they read 300 words about it,
 * and they want the next one. Losing one to a validation error nobody
 * explains is worse than losing one to a bad headline.
 */

const Body = z.object({
  email: z.string().trim().toLowerCase().email().max(160),
  /** Which guide they were reading. The only segmentation worth having:
   *  somebody who came from the AML piece wants different things from
   *  somebody who came from the WhatsApp one. */
  from: z.string().trim().max(60).optional(),
  /** The honeypot. A human never sees this field. */
  company: z.string().max(200).optional(),
});

export async function POST(req: NextRequest) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ error: "That doesn't look like an email address." }, { status: 400 });
  }

  /**
   * A filled honeypot returns 200.
   *
   * Not 400. A bot told it failed retries with the field empty; a bot
   * told it succeeded goes away. The only cost is a log line.
   */
  if (parsed.company) {
    return NextResponse.json({ ok: true });
  }

  // Disposable domains. Not blocked — recorded. Somebody using a burner
  // to read a compliance guide may still become a customer, and refusing
  // them teaches us nothing.
  const disposable = /@(mailinator|guerrillamail|10minutemail|tempmail)\./i.test(parsed.email);

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "PotatoFarm.io <hello@potatofarm.io>",
        to: parsed.email,
        subject: subjectFor(parsed.from),
        text: bodyFor(parsed.from),
        // Every send carries it. A one-click unsubscribe is what the
        // form promised and it is what stops a mailbox provider
        // deciding we are the kind of sender who ignores that.
        headers: { "List-Unsubscribe": "<mailto:stop@potatofarm.io>" },
      }),
      signal: AbortSignal.timeout(10_000),
    });

    // LEAD_WEBHOOK_URL, not LEADS_. Every .env.example defines the
      // singular; this file read the plural, fell back to "", and POSTed
      // every newsletter signup to an empty URL. Silent — fetch("")
      // rejects and the catch below swallowed it.
      await fetch(process.env.LEAD_WEBHOOK_URL ?? "", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: parsed.email, from: parsed.from ?? "unknown",
        disposable, at: new Date().toISOString(),
      }),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => {
      // The lead record failing must not fail the reader's request.
      // They asked for a guide; they get the guide.
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "We couldn't send that. Email hello@potatofarm.io and we'll do it by hand." },
      { status: 502 }
    );
  }
}

/** What they actually asked for, not a welcome sequence. */
function subjectFor(from?: string) {
  switch (from) {
    case "whatsapp-24-hour-window": return "The 24-hour window, on one page";
    case "trakheesi-permits":       return "Trakheesi renewals, on one page";
    case "uae-aml-for-brokerages":  return "AML for brokerages, on one page";
    default:                        return "The next guide, when it's written";
  }
}

function bodyFor(from?: string) {
  const sign = "\n\n— PotatoFarm.io\nOne a month, roughly. Reply 'stop' and that's the end of it.";
  if (!from || from === "guides") {
    return "Thanks for reading.\n\nWe'll send the next guide when it's written — likely on service charges and NOCs, which is the one that costs brokerages the most weeks." + sign;
  }
  return "Thanks for reading. The one-page version is attached, and we'll send the next guide when it's written." + sign;
}
