import { aedToFils, aedWhole } from "@/lib/money";
import type { forOrg } from "@/server/db/client";
import { answersFrom, type Extraction } from "./extract";

/**
 * What the lead told the assistant, stored against the questions the
 * brokerage's script asks.
 *
 * `extractAndStore` in `run.ts` took a `profileId` and **never mentioned
 * it again** — its only write was the `lead.update`. So `Answer` had no
 * writer, had never held a row, and the two things that read it were
 * both wrong in the same quiet way:
 *
 *   - `privacy/export.ts` maps `lead.answers` into `whatYouToldUs`, so a
 *     subject access request replied **"we hold nothing you told us"**
 *     — while this person's budget, timeframe, intent and financing, all
 *     extracted from their own conversation, appear nowhere else in the
 *     export. An incomplete disclosure, silently, for every subject who
 *     ever asked.
 *   - the settings screen tells the brokerage "The answers feed the
 *     pipeline, so what each question is for is fixed", which is a screen
 *     standing as positive evidence for a table that had never had a row
 *     — the sanctions-screening shape again.
 *
 * `Answer.confidence` has a doc comment describing behaviour nothing
 * implemented; it is written here, so a low-confidence value is recorded
 * as low-confidence rather than only appearing in a prose `notes` string.
 *
 * Keyed on the existing `@@unique([leadId, questionId])`, so a lead who
 * revises their budget updates one row rather than accumulating a
 * history the export would read as contradictions. Only questions this
 * profile actually asks are written, and only where the extractor
 * produced something.
 *
 * Its own module, rather than a block inside `run.ts`, so that
 * `check:qualification` can run it against a real database without
 * importing the WhatsApp client and the credential store. The model call
 * that feeds it cannot run in the check, and this half should not have
 * to wait for one to be proved.
 */
export async function storeAnswers(
  db: ReturnType<typeof forOrg>,
  args: { orgId: string; leadId: string; profileId: string; extracted: Extraction },
): Promise<number> {
  const { orgId, leadId, profileId } = args;
  const produced = answersFrom(args.extracted, (aed) => aedWhole(aedToFils(aed)));
  if (produced.length === 0) return 0;

  const questions = await db.question.findMany({
    where: { profileId, key: { in: produced.map((a) => a.key) } },
    select: { id: true, key: true },
  });
  const byKey = new Map(questions.map((q) => [q.key, q.id]));

  let written = 0;
  for (const a of produced) {
    const questionId = byKey.get(a.key);
    // A profile that does not ask this question gets no answer to it.
    if (!questionId) continue;
    await db.answer.upsert({
      where: { leadId_questionId: { leadId, questionId } },
      create: { orgId, leadId, questionId, profileId, value: a.value, confidence: a.confidence },
      update: { value: a.value, confidence: a.confidence },
    });
    written++;
  }
  return written;
}

/**
 * Where the buyer is in the brokerage's script, from the answers stored.
 *
 * Nothing moved a lead on when the assistant had its answers: no code
 * set QUALIFYING or QUALIFIED from this side, so the board's "Qualified"
 * column filled only by hand, a brokerage with automatic replies on kept
 * qualifying a buyer for ever (`sendsItself` reads NEW or QUALIFYING), and
 * "qualified and unclaimed" could never fire for anybody the assistant
 * qualified. Every required question answered is QUALIFIED; any answered
 * is QUALIFYING; none is no change. A profile with no required questions
 * qualifies nobody — it has said nothing about what qualified means.
 */
export async function qualificationState(
  db: ReturnType<typeof forOrg>, leadId: string, profileId: string,
): Promise<"QUALIFIED" | "QUALIFYING" | null> {
  const [required, answered] = await Promise.all([
    db.question.findMany({ where: { profileId, required: true }, select: { id: true } }),
    db.answer.findMany({ where: { leadId, profileId }, select: { questionId: true } }),
  ]);
  if (!answered.length) return null;
  const have = new Set(answered.map((a) => a.questionId));
  if (required.length && required.every((q) => have.has(q.id))) return "QUALIFIED";
  return "QUALIFYING";
}
