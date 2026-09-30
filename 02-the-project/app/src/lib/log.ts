/**
 * Structured logging.
 *
 * Lives in `src/lib` rather than inside a domain module, because logging
 * is infrastructure: everything depends on it and it depends on nothing.
 *
 * It used to sit in `lib/health/`, which seemed reasonable — health is
 * where absence is watched. It was invisible until the portal ingest
 * needed to log something, at which point `health -> portals -> health`
 * closed a cycle.
 *
 * The lesson is worth more than the move: **a utility inside a domain
 * module is a cycle waiting for a second consumer.**
 *
 * Two rules, and the first is not negotiable.
 *
 * **Nothing personal reaches a log.** This system handles buyers' phone
 * numbers, their budgets and their private messages. Logs get shipped to
 * third parties, kept for months, and read by people who have no business
 * reading a buyer's conversation. A phone number in a log line is a data
 * breach with a long fuse.
 *
 * **Every line carries the tenant.** In a multi-tenant product the useful
 * question is never "what happened", it is "what happened to Marina
 * Properties". A log you cannot filter to one customer is a log you read
 * once, during an incident, and give up on.
 */

type Level = "debug" | "info" | "warn" | "error";

/** Field names that must never be logged, whatever the caller passes. */
const REDACT = new Set([
  "phone", "email", "body", "message", "name", "firstName", "lastName",
  "accessToken", "apiKey", "token", "secret", "secretRef", "password",
  "budgetMin", "budgetMax", "ip", "userAgent",
]);

/**
 * Patterns that catch the same data arriving inside a string.
 *
 * The first is the one error messages need. A Prisma validation error
 * prints the call it refused — `name: "Priya Nair", phone: "+97150…"` —
 * and `report()` logs an error's message as the line's message. A name
 * matches none of the patterns below it, so it takes the field name to
 * catch it.
 */
const PATTERNS: [RegExp, string][] = [
  [new RegExp(`\\b(${[...REDACT].join("|")}|notes|comment)(\\s*[:=]\\s*)("[^"]*"|'[^']*'|\`[^\`]*\`)`, "g"), "$1$2[redacted]"],
  [/\+\d{8,15}/g, "[phone]"],
  [/[\w.+-]+@[\w-]+\.[\w.]+/g, "[email]"],
  [/\b\d{13,19}\b/g, "[long-number]"],
];

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[deep]";
  if (typeof value === "string") {
    return PATTERNS.reduce((s, [re, rep]) => s.replace(re, rep), value).slice(0, 500);
  }
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => scrub(v, depth + 1));

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([k, v]) =>
      REDACT.has(k) ? [k, "[redacted]"] : [k, scrub(v, depth + 1)]
    )
  );
}

export type LogContext = {
  orgId?: string;
  userId?: string;
  requestId?: string;
  /** The thing being acted on, by id only. Ids are not personal data. */
  entityId?: string;
};

function emit(level: Level, message: string, ctx: LogContext, extra?: Record<string, unknown>) {
  /**
   * All three parts scrubbed, not only `extra`.
   *
   * The message and the context went out as given. The context is typed
   * as ids, but a type is not a filter; the message is where `report()`
   * puts an error's own text — which is exactly where a refused database
   * call or a Meta error quotes the buyer's details back. "Nothing
   * personal reaches a log" held for the one part of the line least
   * likely to carry it.
   */
  const line = {
    ts: new Date().toISOString(),
    level,
    msg: scrub(message) as string,
    ...(scrub(ctx) as LogContext),
    ...(extra ? (scrub(extra) as Record<string, unknown>) : {}),
  };
  // JSON on one line, so it is queryable wherever it lands rather than
  // needing a regex to parse in an incident.
  const out = JSON.stringify(line);
  level === "error" ? console.error(out) : level === "warn" ? console.warn(out) : console.log(out);
}

export const log = {
  debug: (m: string, c: LogContext = {}, e?: Record<string, unknown>) =>
    process.env.NODE_ENV !== "production" && emit("debug", m, c, e),
  info: (m: string, c: LogContext = {}, e?: Record<string, unknown>) => emit("info", m, c, e),
  warn: (m: string, c: LogContext = {}, e?: Record<string, unknown>) => emit("warn", m, c, e),
  error: (m: string, c: LogContext = {}, e?: Record<string, unknown>) => emit("error", m, c, e),
};

/**
 * Error reporting. Sentry or equivalent behind one function, with the
 * same scrubbing applied — an exception carrying a request body is the
 * most common way personal data escapes into a third-party tool.
 */
export function report(err: unknown, ctx: LogContext, extra?: Record<string, unknown>) {
  log.error(err instanceof Error ? err.message : String(err), ctx, {
    ...extra,
    stack: err instanceof Error ? err.stack?.split("\n").slice(0, 8).join("\n") : undefined,
  });
  // captureException(err, { tags: { orgId: ctx.orgId }, extra: scrub(extra) })
}
