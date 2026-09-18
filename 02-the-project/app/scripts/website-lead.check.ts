/**
 * A website enquiry survives a failed email.
 *
 * The check exists because the failure it guards is invisible. Before
 * this, `dispatchLead` sent two emails and logged an error if either
 * failed — so an unset `RESEND_API_KEY`, an expired sending domain or a
 * bad afternoon at the provider meant somebody asked us for a call and
 * no record of it existed anywhere. Nothing errored on the visitor's
 * side either: they saw the thank-you.
 *
 * So the assertion is deliberately about the *unhappy* path. Mail is
 * broken on purpose, and the row has to be there afterwards with
 * `emailedAt` still null, because that null is what the hourly
 * `website.undelivered` sweep reads. A row that exists but that the
 * sweep would not select is the same silence one step further on, so
 * the sweep's own query is run here rather than assumed.
 */
import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

let failures = 0;
function ok(label: string, cond: boolean, detail = "") {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${label}${detail ? `  — ${detail}` : ""}`);
  if (!cond) failures++;
}

async function main() {
  console.log("\nWebsite enquiry durability\n");

  // Blanked for this process, so both sends fail exactly as they would
  // with an unset key in production.
  delete process.env.RESEND_API_KEY;
  const { dispatchLead } = await import("../src/server/lib/website/forms");

  const id = randomUUID();
  const email = `check-${id.slice(0, 8)}@example.test`;

  await dispatchLead({
    id,
    name: "Test Owner",
    company: "Test Brokerage",
    phone: "+971501234567",
    email,
    teamSize: "11-50",
    consent: true,
    message: "checking durability",
    receivedAt: new Date().toISOString(),
    ip: "203.0.113.9",
    userAgent: "check",
    source: {},
  });

  const row = await db.websiteLead.findUnique({ where: { id } });

  ok("the enquiry exists after both emails failed", row !== null);
  ok("it is stored as a demo request", row?.kind === "DEMO", String(row?.kind));
  ok("the email address was kept", row?.email === email);
  ok("the brokerage name was kept", row?.company === "Test Brokerage");
  ok("consent evidence was captured", !!row?.ip && !!row?.userAgent);
  ok(
    "emailedAt is null, so the sweep will find it",
    row?.emailedAt === null,
    String(row?.emailedAt),
  );
  ok("the delivery failure was recorded verbatim", !!row?.emailError);

  const swept = await db.websiteLead.findMany({
    where: { emailedAt: null, createdAt: { lt: new Date(Date.now() + 60_000) } },
    select: { id: true },
  });
  ok("the undelivered sweep selects it", swept.some((s) => s.id === id));

  await db.websiteLead.delete({ where: { id } });
  await db.$disconnect();

  console.log(
    failures === 0
      ? "\n  the enquiry cannot be lost.\n"
      : `\n  ${failures} failure(s)\n`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await db.$disconnect();
  process.exit(1);
});
