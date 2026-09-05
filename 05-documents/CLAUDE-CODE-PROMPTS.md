# Working with Claude Code on this

## Getting it in

1. **Download `potato-repo.zip`** and unzip in Files. You get one folder
   called `repo`.
2. **Working Copy** (iPad, about £20 one-off) → new repository → import
   the folder → commit → push to a new **private** GitHub repo.
3. **`claude.ai/code`** in Safari → connect the repo.

It reads `CLAUDE.md` automatically. That file is the reason this handover
has a chance.

---

## Do not ask it to "assess and improve all work"

That prompt will produce a hundred unfocused changes across two projects,
most of them opinions rather than fixes, and you will not be able to tell
which ones mattered. It is the single most expensive way to use a
session.

**Three reasons it goes wrong here specifically:**

- The website is **finished**. An open-ended improve instruction will
  rewrite copy that went through a design review and a client palette
  decision.
- The CRM has **never compiled**. Any judgement about its quality made
  before it runs is a guess.
- Eleven things in this repo look wrong and are deliberate. An unbounded
  session will "fix" several.

**Scope every session to one outcome.** Below are the prompts, in order.

---

## Session 1 — Make it compile

This is the only thing that matters until it is done. Nothing else can be
assessed honestly first.

> Read CLAUDE.md and crm/PRE-FLIGHT.md before doing anything.
>
> Task: get `npm run typecheck` clean in `crm/`. Work through the errors
> one file at a time and do not batch changes. After each file, run
> typecheck again and show me only what changed.
>
> Start with the `any` types listed in PRE-FLIGHT — replace each with the
> real type rather than silencing the error.
>
> If a fix would touch anything in the "do not undo" list in CLAUDE.md,
> stop and ask me first. Do not change the website in this session.

**When it is done, commit.** That commit is the first honest baseline.

---

## Session 2 — Prove the tenant boundary

Do this before anything else, because if it does not hold nothing else
matters.

> Task: prove tenant isolation works.
>
> Apply `crm/src/server/db/rls.sql` and `scheduling.sql` to the database.
> Then write a test that connects as the `potato_app` role, sets one org
> id, and confirms it cannot read a second org's leads — including via a
> query that deliberately omits an orgId filter.
>
> The test must fail if row-level security is off. Show me it failing
> with RLS disabled before you show me it passing.

That last sentence is the important one. A test that passes because it
tests nothing is worse than no test.

---

## Session 3 — One route end to end

> Task: get one vertical slice genuinely working.
>
> Seed a database with one organisation, two users and twenty leads. Then
> make `/api/trpc` serve `leads.list` against it and render the inbox
> list from real data.
>
> Do not touch any other route. I want one thing that works completely
> rather than everything half-working.

---

## Session 4 — Then, and only then, ask for an assessment

> Now that it compiles and one route works: review `crm/src/server/lib/`
> and tell me the three things most likely to break in production. Do not
> change anything yet — give me the list and your reasoning, and I will
> pick.

**Assessment before it runs is speculation. Assessment after is
evidence.**

---

## Website sessions, separately

Keep these apart from CRM work. Different risk, different pace.

**Copy only:**

> Task: proofread `website/` for typos, UK English consistency and
> factual accuracy against the guides. Do not change layout, structure,
> colour or any claim about what the product does. Show me a list before
> changing anything.

**A new guide:**

> Task: write one new guide page for `website/`, matching the structure
> and voice of `whatsapp-24-hour-window.html` exactly.
>
> Topic: why outstanding service charges block an NOC, and when to check
> them. Reuse the existing page shell, nav and footer. Add it to
> `guides.html`, the footer, and `sitemap.xml`. Then run
> `python3 tests/audit.py website` and `tests/site-deep.py website` and
> fix anything they report.

That last instruction — run the audits and fix what they report — should
end every website session.

---

## Rules for every session

**Commit before you start.** So you can always see exactly what changed
and throw it away if you need to.

**One outcome per session.** If you find yourself asking for two things,
that is two sessions.

**End with the audits.** Always:

    python3 tests/crm-audit.py crm
    python3 tests/deep-audit.py crm
    python3 tests/architecture.py crm
    python3 tests/security.py crm

**When it disagrees with CLAUDE.md, CLAUDE.md wins** — or you decide it
does not, deliberately, and update the file. What must not happen is a
decision quietly reversing because it looked odd at eleven at night.

---

## The honest expectation

Session 1 is a few hours and will be tedious. Sessions 2 and 3 are where
you find out whether the design survives contact with a database — and
some of it will not.

That is the point. Every judgement in this codebase is untested. Finding
out which ones are wrong is the work, and it cannot start until it runs.
