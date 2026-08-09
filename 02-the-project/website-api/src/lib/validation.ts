import { z } from "zod";

/**
 * One schema, both sides. The client uses it for instant feedback; the
 * server uses it because client-side validation is a convenience, never
 * a control. Anyone can POST straight at the endpoint.
 */
export const demoRequest = z.object({
  name: z.string().trim().min(2, "Please give us your full name.").max(80),

  company: z.string().trim().min(2, "Which brokerage are you with?").max(120),

  // E.164. UAE mobiles are +9715XXXXXXXX, but brokerages here are run by
  // people from everywhere, so we accept any valid international number
  // rather than turning away a Saudi or British owner at the first hurdle.
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "Include the country code, like +971 50 123 4567."),

  email: z.string().trim().toLowerCase().email("That doesn't look like a working email address."),

  teamSize: z.enum(["solo", "2-10", "11-50", "50+"]),

  message: z.string().trim().max(1000).optional(),

  // Must be true. An unticked box is a refusal, not a validation error
  // to be talked around.
  consent: z.literal(true, {
    errorMap: () => ({ message: "We need your permission before we can call you." }),
  }),

  // Anti-spam. Both invisible to a real person — see spam.ts.
  website: z.string().max(0).optional(),   // honeypot
  startedAt: z.coerce.number().optional(), // client timestamp
  turnstileToken: z.string().optional(),
});

export type DemoRequest = z.infer<typeof demoRequest>;

/** Where the lead came from. Worth carrying through to the CRM. */
export const leadSource = z.object({
  path: z.string().optional(),
  referrer: z.string().optional(),
  utm_source: z.string().optional(),
  utm_medium: z.string().optional(),
  utm_campaign: z.string().optional(),
});
