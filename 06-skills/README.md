# The operating setup

Three skills and a project-knowledge pack.

## Skills — install once

Open each `.skill` file and press **Save skill**. They then load
automatically whenever the work matches.

| | Triggers on |
|---|---|
| **uae-real-estate-crm** | Dubai property, brokerage software, listings, offers, AML, Trakheesi |
| **potatofarm-brand** | Anything carrying the brand — pages, screens, decks, documents, icons |
| **brokerage-sales** | Anything aimed at a prospect — emails, decks, demo scripts, pricing |

**Skills hold what stays true across projects.** The 24-hour WhatsApp
window, the two oranges and why there are two, what cannot be claimed.

## Project knowledge — paste into a Claude Project

The four files in `project-knowledge/`. **These hold what is true about
this project today**: where the build stands, the invariants, and the
mistakes worth not repeating.

The split matters. A skill saying "the interface is 95% built" would be
wrong within a week. A skill saying "an agent never sees a sanctions
reason" is true regardless of project.

## The rest of the diagram

Claude Code, Cowork, Research, Web Search and File Creation are
Anthropic surfaces rather than things to build — they read the same
skills and project knowledge once installed. The repo already carries
`CLAUDE.md` for Claude Code.
