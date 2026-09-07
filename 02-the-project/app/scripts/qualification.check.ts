import { PrismaClient } from "@prisma/client";
import { seedQualification, DEFAULT_QUESTIONS } from "@/server/lib/assistant/qualification";
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
