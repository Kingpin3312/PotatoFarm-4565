import { PrismaClient } from "@prisma/client";
import { seedQualification, DEFAULT_QUESTIONS } from "@/server/lib/assistant/qualification";
import { answersFrom } from "@/server/assistant/extract";
import { storeAnswers } from "@/server/assistant/answers";
import { exportSubject } from "@/server/lib/privacy/export";
import { forOrg } from "@/server/db/client";
import { buildSystemPrompt } from "@/server/assistant/prompt";

/**
 * The assistant can get past its own front door.
 *
 * `assistant/run.ts` reads an active `QualificationProfile` and, finding
 * none, hands the conversation to a human before the model is ever
 * called. **Nothing in this codebase had ever created one**, so every
 * enquiry to every brokerage had always been answered by a person — and
 * nothing reported it, because a person answering an enquiry looks
 * exactly like a working inbox.
 *
 * ## What this can and cannot prove here
 *
 * It cannot prove a reply is sent: that needs `ANTHROPIC_API_KEY`, and
 * a check that quietly passes when the key is missing is the failure
 * this project keeps finding. So it proves the parts that are true
 * without a model, and says so:
 *
 *   - a seeded brokerage has exactly one active profile with the five
 *     questions in order;
 *   - the query `run.ts` actually runs returns it — the same
 *     `findFirst({ active: true })`, not a paraphrase;
 *   - the questions reach the system prompt, so the assistant is asking
 *     something rather than holding an empty script;
 *   - deactivating the profile puts the gate back, which is what makes
 *     the first three mean anything;
 *   - seeding twice does not produce two active profiles, because
 *     `findFirst` on two of them is a coin flip over which script the
 *     assistant follows.
 *
 *     npm run check:qualification
 */
let bad = 0;
const ok = (l: string, p: boolean, d = "") => {
  console.log(`  ${p ? "✓" : "✗"} ${l}${d ? "  — " + d : ""}`);
  if (!p) bad++;
};

const db = new PrismaClient({
  datasources: { db: { url: process.env.DATABASE_URL_UNSCOPED ?? process.env.DATABASE_URL } },
});

const org = await db.organisation.findFirst({ where: { deletedAt: null }, select: { id: true, name: true } });
if (!org) { console.error("no organisation to test against"); process.exit(1); }

/** Exactly the query `run.ts` opens with. Copied, not approximated. */
const asRunDoes = () =>
  db.qualificationProfile.findFirst({
    where: { orgId: org.id, active: true },
    include: { questions: { orderBy: { order: "asc" } } },
  });

console.log("\n=== the brokerage has a script ===");
{
  const profile = await asRunDoes();
  ok("run.ts's own query finds an active profile", !!profile,
     profile ? profile.name : "null — every enquiry hands over before the model is called");
  ok("with the five questions", profile?.questions.length === DEFAULT_QUESTIONS.length,
     `${profile?.questions.length ?? 0}`);
  ok("in the order they are asked",
     JSON.stringify(profile?.questions.map((q) => q.key)) ===
     JSON.stringify(DEFAULT_QUESTIONS.map((q) => q.key)),
     (profile?.questions.map((q) => q.key) ?? []).join(" → "));
  // The viewing is the point of the conversation and the one thing that
  // must not be demanded before the rest is known.
  ok("the viewing is asked last and is not required",
     profile?.questions.at(-1)?.key === "viewing" && profile?.questions.at(-1)?.required === false);
}

console.log("\n=== the questions reach the prompt ===");
{
  const profile = await asRunDoes();
  const system = buildSystemPrompt({
    brokerage: org.name,
    agentName: null,
    questions: (profile?.questions ?? []).map((q) => ({ key: q.key, prompt: q.prompt, required: q.required })),
    listing: null,
    language: "en",
    tone: profile?.tone,
  });
  for (const q of DEFAULT_QUESTIONS) {
    ok(`"${q.key}" is in the system prompt`, system.includes(q.prompt),
       system.includes(q.prompt) ? "" : "built, seeded, and not passed through");
  }
  // The tone is a brokerage's own voice and it is the one field an owner
  // is most likely to edit. If it is dropped the edit does nothing.
  ok("the tone is carried too", !!profile?.tone && system.includes(profile.tone.slice(0, 24)));
}

console.log("\n=== the gate is real ===");
{
  // Deliberately break it. Three assertions above pass trivially if the
  // profile lookup can never return null, so this proves it can.
  const profile = await asRunDoes();
  await db.qualificationProfile.update({ where: { id: profile!.id }, data: { active: false } });
  const gone = await asRunDoes();
  ok("deactivated, run.ts finds nothing and would hand over", gone === null);
  await db.qualificationProfile.update({ where: { id: profile!.id }, data: { active: true } });
  ok("restored", (await asRunDoes()) !== null);
}

console.log("\n=== seeding twice does not fork the script ===");
{
  const before = await db.qualificationProfile.count({ where: { orgId: org.id, active: true } });
  const again = await db.$transaction((tx) => seedQualification(tx, org.id));
  const after = await db.qualificationProfile.count({ where: { orgId: org.id, active: true } });
  ok("the second seed creates nothing", again.created === false);
  ok("still exactly one active profile", after === 1 && before === 1,
     `${before} → ${after} — two actives is a coin flip over which script is followed`);
}

console.log("\n=== the answers reach the record a subject access request reads ===");
{
  /**
   * The coupling most likely to rot, asserted in both directions.
   *
   * `extractAndStore` took a `profileId` and never used it, so `Answer`
   * had no writer and had never held a row — while `privacy/export.ts`
   * maps `lead.answers` into `whatYouToldUs`. A subject access request
   * therefore replied **"we hold nothing you told us"** to a person
   * whose budget, timeframe, intent and financing were sitting on their
   * lead, disclosed nowhere.
   *
   * `answersFrom` writes against `Question.key`. Rename a question and
   * the writer stops writing, silently, and the disclosure goes empty
   * again — which is exactly how this failed the first time.
   */
  const produced = answersFrom(
    {
      budgetMin: 2_500_000, budgetMax: 3_000_000, intent: "BUY_TO_LIVE",
      timeframe: "3 months", financing: "MORTGAGE", confidence: {},
    },
    (aed) => `AED ${aed}`,
  ).map((a) => a.key);

  const asked = DEFAULT_QUESTIONS.map((q) => q.key);
  const orphans = produced.filter((k) => !asked.includes(k));
  ok("every answer the extractor produces maps to a question the profile asks",
     orphans.length === 0,
     orphans.length ? `no question keyed ${orphans.join(", ")}` : produced.join(", "));

  // The reverse is a note rather than a failure: a profile may ask
  // something the extractor cannot answer, and `viewing` is exactly
  // that. Inventing a value for it would put a fabricated statement in
  // a disclosure document.
  const unanswerable = asked.filter((k) => !produced.includes(k));
  console.log(`  · ${unanswerable.length} question(s) the extractor cannot answer: ${unanswerable.join(", ") || "none"}`);

}

console.log("\n=== and a subject access request discloses them ===");
{
  /**
   * The write, against a real database, read back by the real export.
   *
   * The key agreement above proves the writer *would* find its
   * questions. It cannot prove the row is written, that row-level
   * security on `Answer` lets the assistant's own tenant client write
   * it, or that `exportSubject` — the document a person actually
   * receives — then contains it. Those were the three things that were
   * false, and none of them needs a model to check.
   *
   * A throwaway lead, removed at the end; its answers go with it by
   * cascade. Written through `forOrg`, the client `run.ts` uses, not the
   * unscoped one this file sets up with — a fixture that bypasses
   * row-level security proves nothing about a table that enforces it.
   */
  const phone = `+97150${String(Date.now()).slice(-7)}`;
  const profile = await asRunDoes();
  const lead = await db.lead.create({ data: { orgId: org.id, phone, name: "Qualification Check" } });
  try {
    const scoped = forOrg(org.id);
    const base = {
      budgetMin: 2_500_000, budgetMax: 3_000_000, intent: "BUY_TO_LIVE" as const,
      timeframe: "within 3 months", financing: "MORTGAGE" as const,
      confidence: { budgetMin: 0.95, budgetMax: 0.55, timeframe: 0.9, intent: 0.8, financing: 0.99 },
    };
    const written = await storeAnswers(scoped, {
      orgId: org.id, leadId: lead.id, profileId: profile!.id, extracted: base,
    });
    // Counted in the table, not taken from the function's own return:
    // with the upsert deleted, the loop still counted to four.
    const rows = await db.answer.count({ where: { leadId: lead.id } });
    ok("the assistant's tenant client writes four answers", written === 4 && rows === 4,
       `${written} reported, ${rows} in the table`);

    const sar = await exportSubject(org.id, phone);
    const told = sar?.whatYouToldUs ?? [];
    ok("the subject export lists them", told.length === 4,
       told.length ? `${told.length}` : "0 — \"we hold nothing you told us\"");

    // By the question as the person was asked it, which is what the
    // export shows them — not by an internal key they never saw.
    const byPrompt = new Map(told.map((t) => [t.question, t.answer]));
    const prompt = (k: string) => DEFAULT_QUESTIONS.find((q) => q.key === k)!.prompt;
    ok("the budget reads as the range they gave",
       byPrompt.get(prompt("budget")) === "AED 2,500,000 \u2013 AED 3,000,000",
       JSON.stringify(byPrompt.get(prompt("budget"))));
    ok("the timeline is theirs, verbatim",
       byPrompt.get(prompt("timeline")) === "within 3 months");

    const stored = await db.answer.findMany({
      where: { leadId: lead.id }, include: { question: { select: { key: true } } },
    });
    const confOf = (k: string) => stored.find((a) => a.question.key === k)?.confidence;
    // Keyed as the model keys it. With the answer's own key this was
    // null for everything but financing.
    ok("confidence is recorded, not dropped", confOf("timeline") === 0.9 && confOf("purpose") === 0.8,
       `timeline ${confOf("timeline")}, purpose ${confOf("purpose")}`);
    ok("a range is as sure as its least sure end", confOf("budget") === 0.55, `${confOf("budget")}`);

    // A lead who changes their mind updates the answer. A second row
    // would put two budgets in the same disclosure and read as a
    // contradiction the brokerage recorded.
    await storeAnswers(scoped, {
      orgId: org.id, leadId: lead.id, profileId: profile!.id,
      extracted: { ...base, budgetMin: null, budgetMax: 4_000_000, confidence: { budgetMax: 0.9 } },
    });
    const after = (await exportSubject(org.id, phone))?.whatYouToldUs ?? [];
    ok("a revised budget replaces the old one rather than joining it",
       after.length === 4 && after.find((t) => t.question === prompt("budget"))?.answer === "AED 4,000,000",
       `${after.length} answers, budget ${JSON.stringify(after.find((t) => t.question === prompt("budget"))?.answer)}`);
  } finally {
    await db.lead.delete({ where: { id: lead.id } });
  }
  ok("the fixture leaves nothing behind",
     (await db.answer.count({ where: { leadId: lead.id } })) === 0);
}

console.log("\n=== and what still is not proven ===");
{
  const keyed = !!process.env.ANTHROPIC_API_KEY;
  console.log(
    keyed
      ? "  · ANTHROPIC_API_KEY is set — a live reply is still not exercised here"
      : "  · ANTHROPIC_API_KEY is not set, so no reply has actually been generated.\n" +
        "    This proves the assistant reaches the model, not that it answers well."
  );
}

await db.$disconnect();
console.log(bad ? `\n${bad} FAILED\n` : "\nthe assistant has a script and gets past the door.\n");
process.exit(bad ? 1 : 0);
