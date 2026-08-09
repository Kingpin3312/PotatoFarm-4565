# Phase 9 — CMS

## Why Sanity

I've built this on **Sanity**, and the reason is narrow: the editing
experience decides whether content actually gets updated. A CMS nobody
enjoys opening produces a site that goes stale in four months, and a stale
site is worse than a small one.

The realistic alternative is **Payload**, which runs inside the same
Next.js app and keeps your data in your own database. If you'd rather not
have customer-facing content sitting on a third party — a reasonable
position given you have a security page arguing exactly that — say so and
I'll port the schemas across. They translate almost directly. Contentful
gets expensive per seat, and Strapi means you're now running a server;
neither earns its place here.

## What's editable

Everything. There is no string literal anywhere in the page components,
including the hero conversation — which matters, because that has to change
every time your qualifying script does.

| Document | Kind | Holds |
|---|---|---|
| Site settings | one | Logo, nav, footer, WhatsApp number, address |
| Homepage | one | Every section, in order, including the hero thread |
| Security page | one | Assurances, sub-processors, review date |
| Plans | many | Tiers, prices, features |
| Testimonials | many | Quote, result, person, photo, approval |
| Customer logos | many | Logo, permission flag |
| FAQs | many | Question, answer, category |
| Integrations | many | Name, category, live status |
| People | many | Team members |
| Posts | many | Blog |

## Three things built into the schemas on purpose

**Testimonials and logos have an "approved" tick, and nothing publishes
without it.** The filter lives in the query rather than the component, so
no future page can accidentally render one you don't have permission for.
This is the thing that would actually get you in trouble, and it's now
structurally impossible rather than a matter of remembering.

**Testimonials require a number.** The field warns if it's empty. A quote
without a measurable result is decoration, and it's the exact weakness that
makes Kendal's proof section fall flat.

**The security page carries its own warnings in the editor.** Every field
tells whoever's writing it to publish only what can be evidenced. That
warning sits where the mistake would be made, not in a document nobody
re-reads.

## How publishing works

No time-based revalidation. Content is cached indefinitely and cleared by
tag when Sanity fires the webhook at `/api/revalidate`. An edit appears
within a second or two of being published, and nothing is refetched in
between — which is how the site holds a Lighthouse score while still being
fully editable.

The webhook verifies a signature. Without that, anyone who finds the URL
can flush your cache in a loop.

## Setup

1. `npx sanity@latest init` — creates the project, gives you the ID.
2. Copy `sanity/` into the repo and point `sanity.config.ts` at
   `schemaTypes` from `sanity/schemas/index.ts`.
3. Set the environment variables below.
4. In Sanity: **API → Webhooks → Create**, URL `https://potato.ai/api/revalidate`,
   trigger on create, update and delete, and paste the same secret.
5. Studio at `/studio`. Give the team editor access, not admin.

    NEXT_PUBLIC_SANITY_PROJECT_ID=
    NEXT_PUBLIC_SANITY_DATASET=production
    SANITY_API_READ_TOKEN=        # server only — never expose this
    SANITY_REVALIDATE_SECRET=

## What this unblocks

The four things I've been asking you for now have somewhere to live, and
you can enter them yourself without coming back to me:

- **Price** → Plans
- **Testimonials** → Testimonials, with the approval tick
- **Logos** → Customer logos, with the permission flag
- **Security facts** → Security page

Every placeholder currently visible on the site is a field waiting for you.
