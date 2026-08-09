# Potato.ai — form backend

One endpoint, `POST /api/demo`. Everything below is wired to it.

## What happens to a submission

1. **Rate limit** by IP, before any work is done. Five a minute.
2. **Parse.** Malformed JSON is rejected outright.
3. **Validate** against the same Zod schema the form uses. Field errors go
   back individually so each message lands under the field it belongs to.
4. **Spam**, cheapest check first:
   - honeypot field
   - submission timing (under three seconds is not a person)
   - Cloudflare Turnstile
5. **Capture**, with a UUID, timestamp, IP, user agent and UTM parameters.
6. **Fan out** to the sales inbox, the lead's own confirmation email, the
   CRM and a signed webhook — without blocking the response.

## Two decisions worth knowing about

**Honeypot and timing failures return a success response.** Telling a bot
it was caught only teaches whoever wrote it what to change next time. A
real person cannot trip either check.

**The person gets a success response as soon as the lead is captured.** If
the CRM is having a bad afternoon that is our problem, not theirs. Failed
deliveries are logged against the lead ID so they can be traced and
replayed rather than quietly disappearing.

## Before this goes live

- Set `TURNSTILE_SECRET_KEY`. Without it the captcha check is skipped and
  only a warning is logged.
- Set the Upstash variables, or accept that rate limiting is per-instance
  and only slows an attacker down.
- Verify your sending domain with Resend, or the confirmation emails will
  land in spam and you will never know.
- Decide how long you keep lead data, and say so in the privacy policy.
  Consent timestamp and IP are captured for exactly this reason.

## Testing

    curl -X POST http://localhost:3000/api/demo \
      -H "Content-Type: application/json" \
      -d '{"name":"Test Person","company":"Test Brokerage",
           "phone":"+971501234567","email":"test@example.com",
           "teamSize":"2-10","consent":true}'

Expect `{"ok":true,"id":"..."}`. Then check the sales inbox, the CRM and
the webhook receiver — all three, not just the one that is easiest to look at.
