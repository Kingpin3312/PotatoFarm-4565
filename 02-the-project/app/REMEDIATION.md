# Remediation backlog

From the pre-launch audit of 25 September 2026 (57/100). One row per
finding. Status is only ever changed after the fix is verified, and the
verification is named in the Test column.

Status: OPEN · IN PROGRESS · FIXED · PARTIAL · OWNER (needs a decision or
an outside party, not code) · N/A

| ID | Sev | Finding | Root cause | Solution | Files | Risk | Test | Status |
|---|---|---|---|---|---|---|---|---|
| A1 | P0 | Leads screen shows only 25 leads | Server pages by cursor; client never asks for page 2 | Infinite list with load-more and "select all matching"; filters and sort moved server-side | `leads/page.tsx`, `routers/leads.ts` | Medium: bulk assign, distribution strip share the filter | `check:lead-lists` at 1/25/26/60 rows; browser | OPEN |
| A2 | P0 | Listings screen shows only 25 | Same, `fetchNextPage` never called | Same pattern, filters by status, type, community, agent, price, bedrooms | `listings/page.tsx`, `routers/listings.ts` | Medium | `check:lead-lists` (listings half) | OPEN |
| A3 | P0 | No binding Terms, Privacy Policy, DPA | Legal text not written | Counsel drafts; the product then records acceptance and version at sign-up | `website/legal.html`, signup | Low | — | OWNER |
| A4 | P0 | No mapped import; no manager export | Import is issue-report only; export only for blackbook | Mapped CSV import (preview, column mapping, dedupe on normalised phone/email, per-row errors); CSV export of leads and listings honouring filters | `settings/import`, `routers/migration.ts`, new export | Medium: migration code path shared | `check:import-export` | OPEN |
| B1 | P1 | Phone search only matches exact E.164 | Digits parsed as money first; raw substring compare | One `lib/phone.ts` (three copies before); phone-like runs read before the budget; matched on the national number in search, owners and the leads list | `lib/phone.ts`, `search/parse.ts`, `search/run.ts`, `routers/leads.ts` | Low | `check:search` five typed forms + owner, proved red by removing the clause; unit tests | FIXED |
| B2 | P1 | Lead form rejects spaced/local numbers; raw JSON errors | Strict regex on input; `e.message` was the serialised issue list | Server normalises every written form to E.164; the tRPC error formatter puts the first issue's sentence in `message`, which every form already shows | `routers/leads.ts`, `api/trpc.ts`, `leads/add-lead.tsx` | Low | `browser:add-lead`, proved red with the old regex and with the old formatter | FIXED |
| B3 | P1 | Lead list tools too thin | Four presets, fixed sort, assign-only bulk | Filter bar, sort, tags, saved views, bulk status/stage/tag/archive/assign/export on all matching | leads router + page, schema (tags, SavedView) | Medium | `check:lead-lists` | OPEN |
| B4 | P1 | Delete cannot be undone; no archive | Only `deletedAt` | `archivedAt`; managers' "Recently deleted" with restore | schema, leads router, page | Low | `check:lead-lists` | OPEN |
| B5 | P1 | Data model fits secondary sales only | Listing thin; no rentals/off-plan; person = one opportunity | Additive: listing type, completion, developer/project, unit, furnishing, rent terms; Development model; Tenancy model; opportunity split designed separately | schema, listings forms | High (opportunity split) | migrations on empty DB + checks | OPEN |
| B6 | P1 | No portal publishing | No `Publisher` without partner agreements | Agreements are the owner's; feed remains the path | `portals/` | — | — | OWNER |
| B7 | P1 | Assistant cannot reply by itself | Owner chose drafts | Decision for the owner; measurement already collected | `assistant/run.ts` | — | — | OWNER |
| B8 | P1 | No native mobile app | `mobile/` cannot build | Make the web app the mobile product: phone-first lead screen, quick actions, installable | app screens | Medium | browser at 375px | OPEN |
| B9 | P1 | Sweep stops at 5,000 leads / 500 listings; ~5 queries per lead | Hard `take` caps; per-lead round trips | Cursor through all leads in batches; listing index by community and price | `intelligence/sweep.ts` | Medium: scores/recommendations | `check:intelligence` + load | OPEN |
| B11 | P1 | Buyer requirements are never captured | Only voice intake wrote a `Requirement`; the assistant's extraction had no areas or bedrooms, and its prompt named none of the fields it parses; the matcher compared areas by exact text | Agents record them on the person page (`requirements` router); extraction names its shape and keeps an assistant requirement current until an agent saves one; areas canonicalised; matcher compares places, not strings; seed gives all 42 demo buyers one | `routers/requirements.ts`, `blackbook/[leadId]/requirements.tsx`, `lib/requirements/save.ts`, `assistant/extract.ts`, `assistant/run.ts`, `matching/score.ts`, `places.ts`, seed | Medium | `check:requirements` (search and matcher find the buyer, alias meets listing spelling, scope, assistant never overwrites an agent), each proved red at its line | FIXED |
| B10 | P1 | Email and calendar not connected | Needs Google/Microsoft app registration | Owner registers apps; code path exists | `email/` | — | — | OWNER |
| C1 | P2 | No spelling tolerance | `contains` only | pg_trgm word similarity ≥ 0.5 on lead and owner names, inside a scoped transaction; ranked below an exact name and labelled "name is close to" | `search/run.ts` | Low | `check:search` (Stephan→Stephen, Rashed→Rashid, exact outranks close), proved red at threshold 0.99 | FIXED |
| C2 | P2 | References must be exact | No normalisation | `AR508`, `ar 508`, `AR-508` read as one reference before the budget can take the digits; the listing ranks first, its owner second | `search/parse.ts`, `search/match.ts`, `search/run.ts` | Low | `check:search` four spellings; unit tests | FIXED |
| C3 | P2 | "buyers in dubai marina" returns 0 | The query was read correctly; nobody had a requirement (B11) | Fixed by B11 | — | — | `check:requirements` asks exactly this | FIXED |
| C4 | P3 | "villa" matches "Village" | Substring match used to decide a match | Candidates still fetched with `contains`; a candidate only scores when the term is a whole word or takes an ending (villas, relocating) | `search/match.ts`, `search/run.ts` | Low | `check:search`, proved red with substring scoring; unit tests | FIXED |
| C5 | P2 | 49 of 66 tenant tables lack FK to Organisation | Relations never declared | FKs added `NOT VALID` (enforced for new rows, no data touched) | schema, migration | Medium: check-suite cleanups | migrations + all suites | OPEN |
| C6 | P2 | Pink text / white-on-pink below AA | Owner palette decision | Keep colours; AA-large button labels considered | tokens | Low | `browser:a11y` | OWNER |
| C7 | P2 | Tasks are personal reminders only | `FollowUp` narrow | Delegation, due date/time, linked record, list view | schema, today | Medium | check | OPEN |
| C8 | P2 | No second factor for owners/admins | Magic link only | Optional TOTP for owners/admins; session list | auth | Medium | check | OPEN |
| C9 | P2 | No end-to-end journey test | Suites are per workflow | Journey suites 1–5 | scripts | Low | themselves | OPEN |
| C10 | P2 | Scale beyond 5,000 unmeasured | Load suite size | 25,000-lead profile | `check:load` | Low | itself | OPEN |
| C11 | P2 | Missing management KPIs | Reports incomplete | Source conversion, time to close, weighted pipeline, expected commission, cold by agent; each drills to records | reports | Low | check | OPEN |
| D1 | P3 | Blackbook capped at 300 | `take: 300` | Paginate | blackbook | Low | check | OPEN |
| D2 | P3 | Upload type trusted from browser | No content sniff | Check magic bytes on confirm | `files/upload.ts` | Low | unit | OPEN |
| D3 | P3 | Demo data ages | Seed dates fixed at seed time | Seed relative to today on every run | seed | Low | seed run | OPEN |
| D4 | P3 | Unbuildable / unused code | `mobile/`, `email/sync`, `respond()` | Documented; decision with B7/B8/B10 | — | — | — | OWNER |
| D5 | P2 | No dependency scan in CI | Not configured | `npm audit --omit=dev` step, fails on high | `verify.yml` | Low | CI | OPEN |
| D6 | P3 | Today buries new enquiries under deal warnings | Ranking | Group deal-risk items; drill-through from every figure | today | Low | browser | OPEN |
| D7 | P3 | Listings rows crowded with five actions | Layout | One primary action and a row menu | listings | Low | browser | OPEN |
| D8 | P3 | Pipeline staleness shown on every card | Threshold not applied in label | Show only past the stage's threshold | board | Low | browser | OPEN |
| D9 | P3 | Team "Remove" is the loudest element | Styling | Quiet row action | team | Low | browser | OPEN |
| D10 | P3 | Search does not show what it understood | UI | Chips of the parsed reading | search | Low | browser | OPEN |
