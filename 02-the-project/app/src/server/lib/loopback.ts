/**
 * An address a test may redirect — to this machine only.
 *
 * Four calls leave the product for a provider: fetching a Meta lead ad,
 * sending on WhatsApp, asking the model for a reply, and sending an
 * email (`RESEND_API_BASE`, so the VAT threshold warning can be proved
 * to leave rather than assumed to). Each can be
 * pointed at a stand-in on loopback so a check can drive the real code
 * path end to end — and nothing else. The assistant's reply had never
 * run anywhere, not even in a check, because its address was fixed.
 *
 * Loopback is the whole guard. Each of these calls carries a secret — a
 * Page token, a WhatsApp access token, the model API key, the mail key — so an override
 * free to name any host would hand that secret to whoever set the
 * variable. A non-loopback value is refused rather than ignored: falling
 * back to the real provider would hide the mistake, and in a check would
 * send a real message.
 *
 * The names are deliberately not the providers' SDK conventions
 * (`ANTHROPIC_BASE_URL` is commonly set to a gateway), so a variable
 * meant for something else can never switch this on.
 */
export function endpoint(variable: string, real: string): string {
  const override = process.env[variable];
  if (!override) return real;
  if (!/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/.test(override)) {
    throw new Error(`${variable} is only honoured for a loopback address`);
  }
  return override.replace(/\/+$/, "");
}
