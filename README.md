# PotatoFarm.io — the complete project

Everything built, in one place. **Read `01-START-HERE/PROJECT_CONTEXT.md`
first** — it is written for somebody arriving cold.

## What is in each folder

| | |
|---|---|
| **01-START-HERE** | Read these three first |
| **02-the-project** | **The live code.** This is what you work on |
| **03-brand** | Logo files, the spec, the design system |
| **04-audit-scripts** | 13 checks that run against the code |
| **05-documents** | Every review, analysis and decision |
| **06-skills** | Three installable Claude skills |

The website lives in `02-the-project/website/` and deploys straight from
there — see its `GO-LIVE.md`. There used to be a second copy at
`07-ready-to-deploy/`; the two drifted, so there is one now.

Earlier versions of the site and design system used to sit in
`99-superseded/`. They are in git history rather than the working tree —
`git log -- 99-superseded` will find them. Nothing in them should be
copied forward: they carry an old palette and old pricing copy.

## The 20-second version

**PotatoFarm.io** — a WhatsApp-native lead qualification CRM for UAE
brokerages. $70 per agent per month.

- **The website is finished** and can go live today
- **The application is written** — 68 models, 22 routers, 103 procedures,
  29 screens. 97 of the 103 procedures have a screen
- **It has never been compiled.** No database, no `npm install`, no
  deployment. It does not currently start: there is no login handler and
  no sign-in page. See the audit for the full list
- **There is no customer.** This is the thing that matters most

## What to do first

1. Read `01-START-HERE/PROJECT_CONTEXT.md`
2. If you are moving to Claude Code, read
   `01-START-HERE/GITHUB-SETUP.md`
3. `cd 02-the-project/app && npm install`
4. Expect real errors on the first build. That is normal for a codebase
   this size that has never been compiled

## One thing that will not change by building more

Every review in `05-documents` ends the same way. The website is ready.
The next move is a phone call to a brokerage owner, not another commit.
