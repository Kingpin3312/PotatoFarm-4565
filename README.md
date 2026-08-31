# PotatoFarm.io — the complete project

Everything built, in one place. **Read `01-START-HERE/PROJECT_CONTEXT.md`
first** — it is written for somebody arriving cold.

## What is in each folder

| | |
|---|---|
| **01-START-HERE** | `PROJECT_CONTEXT.md` and the GitHub setup notes |
| **02-the-project** | **The live code.** This is what you work on |
| **03-brand** | Logo files, the spec, the design system |
| **04-audit-scripts** | 13 checks that run against the code |
| **05-documents** | Every review, analysis and decision |
| **06-skills** | Three installable Claude skills |

The website lives in `02-the-project/website/` and deploys straight from
there — see its `DEPLOY.md`. There used to be a second copy at
`07-ready-to-deploy/`; the two drifted, so there is one now. There were
also two deploy checklists, `GO-LIVE.md` and `DEPLOY.md`, for the same
deploy; they are one document now, for the same reason.

Two things are in git history rather than the working tree.
`99-superseded/` held earlier versions of the site and design system —
`git log -- 99-superseded` will find them, and nothing in them should be
copied forward, because they carry an old palette and old pricing copy.
`COMPLETION.md` described a generation-older codebase (66 models, 20
routers, 22 jobs) and was contradicting `PROJECT_CONTEXT.md` on every
figure; two documents describing the same project is how the wrong one
gets read.

## The 20-second version

**PotatoFarm.io** — a WhatsApp-native lead qualification CRM for UAE
brokerages. $70 per agent per month.

- **The website is finished** and can go live today — including the demo
  form, which now has a server behind it
- **The application compiles, builds and runs.** 74 models, 27 routers,
  149 procedures, 43 screens, 28 scheduled jobs. Eight procedures have no
  screen — seven deliberately, one unfinished; `reachability.py` names them
- **Tenant isolation has been tested with two brokerages in one
  database**, which is the whole security promise of the product
- **Nothing is deployed**, because that needs a database, a Resend
  account with a verified domain, and a Vercel Pro plan — all of which
  need your name and your card
- **There is no customer.** This is still the thing that matters most

## What to do first

1. Read `01-START-HERE/PROJECT_CONTEXT.md` — sections 5 and 15 are the
   ones with actions in them
2. If you are moving to Claude Code, read
   `01-START-HERE/GITHUB-SETUP.md`
3. `cd 02-the-project/app && npm install && npx prisma generate`
4. Copy `.env.example` to `.env` and fill in what you have. The app boots
   without any of it and tells you in the log what each missing key stops
   working

## One thing that will not change by building more

Every review in `05-documents` ends the same way, and it was true when
the code did not compile and it is still true now that it does. The
website is ready and the form on it works. **The next move is a phone
call to a brokerage owner, not another commit.**
