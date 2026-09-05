/**
 * Data quality on the way in.
 *
 * Nobody has clean data. Every brokerage export contains duplicate
 * contacts, dead numbers, leads owned by agents who left two years ago,
 * and a column somebody used for three different things.
 *
 * Two ways to get this wrong, and most migrations pick one:
 *
 *   - **Import it faithfully** and you have reproduced the mess, plus
 *     they now blame your system for it.
 *   - **Clean it silently** and they cannot trust anything, because they
 *     do not know what you changed.
 *
 * So: everything is surfaced, nothing is silently fixed, and anything
 * without a safe default waits for a person. A migration that quietly
 * tidies somebody's database is a migration they cannot trust, and trust
 * is the entire product at this moment.
 */

export type Row = Record<string, string | null | undefined>;

export type Issue = {
  severity: "BLOCKER" | "DECISION" | "NOTE";
  kind: string;
  entity: string;
  sourceRef?: string;
  detail: string;
  suggestion?: string;
};

export function inspectContacts(rows: Row[], opts: { agentEmails: Set<string> }): Issue[] {
  const issues: Issue[] = [];
  const byPhone = new Map<string, Row[]>();

  for (const r of rows) {
    const ref = r.id ?? r.reference ?? "(no id)";

    const phone = normalise(r.phone ?? r.mobile ?? r.contact_number);
    if (!phone && !r.email) {
      issues.push({
        severity: "BLOCKER", kind: "no_contact", entity: "contact", sourceRef: ref,
        detail: "No phone and no email — there is no way to reach this person.",
        suggestion: "Skip. A contact you cannot contact is a row, not a lead.",
      });
      continue;
    }

    if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), r]);

    if (r.phone && !phone) {
      issues.push({
        severity: "DECISION", kind: "bad_phone", entity: "contact", sourceRef: ref,
        detail: `"${r.phone}" is not a number we can dial.`,
        suggestion: "Import without the number, or fix it in the source first.",
      });
    }

    const owner = (r.agent ?? r.owner ?? "").toLowerCase();
    if (owner && !opts.agentEmails.has(owner)) {
      // Extremely common, and the reason a migrated pipeline looks like
      // nobody owns anything.
      issues.push({
        severity: "DECISION", kind: "unknown_owner", entity: "contact", sourceRef: ref,
        detail: `Assigned to "${r.agent ?? r.owner}", who is not on your team.`,
        suggestion: "Usually someone who has left. Reassign, or bring them in unassigned.",
      });
    }
  }

  for (const [phone, group] of byPhone) {
    if (group.length > 1) {
      issues.push({
        severity: "DECISION", kind: "duplicate", entity: "contact", sourceRef: phone,
        detail: `${group.length} records share this number.`,
        // Merging is the right answer nine times in ten and the wrong
        // one often enough that it is not ours to decide.
        suggestion: "Merge into one lead, keeping the earliest first-contact date.",
      });
    }
  }

  return issues;
}

/**
 * Open deals are the ones that matter.
 *
 * A brokerage switching mid-month has live transactions in flight, and
 * the fear is not losing records — it is losing their **position**. A
 * deal sitting at NOC stage that arrives as a new lead has lost six
 * weeks of work and, more to the point, the agent no longer trusts the
 * new system on day one.
 */
export function inspectDeals(rows: Row[], knownStages: Set<string>): Issue[] {
  const issues: Issue[] = [];

  for (const r of rows) {
    const ref = r.id ?? r.reference ?? "(no id)";
    const stage = (r.stage ?? r.status ?? "").trim();

    if (!stage) {
      issues.push({
        severity: "BLOCKER", kind: "no_stage", entity: "deal", sourceRef: ref,
        detail: "No stage on an open deal. We would not know where it sits.",
        suggestion: "Someone has to say where this deal actually is.",
      });
      continue;
    }

    if (!knownStages.has(stage.toUpperCase().replace(/\s+/g, "_"))) {
      issues.push({
        severity: "DECISION", kind: "unmapped_stage", entity: "deal", sourceRef: ref,
        detail: `Stage "${stage}" does not map to anything here.`,
        suggestion: "Map it once and every deal at that stage follows.",
      });
    }

    if (!r.completion_date && !r.expected_date) {
      issues.push({
        severity: "NOTE", kind: "no_completion_date", entity: "deal", sourceRef: ref,
        detail: "No completion date, so nothing can be planned backwards from it.",
        suggestion: "Add it after cutover — the timeline is useless without one.",
      });
    }
  }

  return issues;
}

function normalise(v: string | null | undefined) {
  if (!v) return null;
  let d = v.replace(/[^\d+]/g, "");
  if (d.startsWith("00")) d = "+" + d.slice(2);
  if (!d.startsWith("+")) {
    if (d.startsWith("0")) d = "+971" + d.slice(1);
    else if (d.length === 9) d = "+971" + d;
    else return null;
  }
  return /^\+[1-9]\d{7,14}$/.test(d) ? d : null;
}

/** Grouped, because 400 issues in a list is a reason to give up. */
export function summarise(issues: Issue[]) {
  const byKind = new Map<string, Issue[]>();
  for (const i of issues) byKind.set(i.kind, [...(byKind.get(i.kind) ?? []), i]);

  return {
    blockers: issues.filter((i) => i.severity === "BLOCKER").length,
    decisions: issues.filter((i) => i.severity === "DECISION").length,
    notes: issues.filter((i) => i.severity === "NOTE").length,
    groups: [...byKind.entries()]
      // `flatMap` with a guard rather than `map`. A group only exists
      // because something was pushed into it, so `items[0]` is always
      // there — but leaving it optional pushed an `undefined` severity
      // out to the import screen, which colour-codes on it.
      .flatMap(([kind, items]) => {
        const first = items[0];
        return first ? [{
        kind,
        count: items.length,
        severity: first.severity,
        suggestion: first.suggestion,
        examples: items.slice(0, 3).map((i) => i.sourceRef).filter(Boolean),
        }] : [];
      })
      .sort((a, b) => b.count - a.count),
  };
}
