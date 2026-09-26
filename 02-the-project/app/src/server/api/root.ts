import { router } from "./trpc";
import { orgRouter } from "./routers/org";
import { leadsRouter } from "./routers/leads";
import { conversationsRouter } from "./routers/conversations";
import { pipelineRouter } from "./routers/pipeline";
import { listingsRouter } from "./routers/listings";
import { viewingsRouter } from "./routers/viewings";
import { assistantRouter } from "./routers/assistant";
import { reportsRouter } from "./routers/reports";
import { privacyRouter } from "./routers/privacy";
import { supportRouter } from "./routers/support";
import { onboardingRouter } from "./routers/onboarding";
import { commissionRouter } from "./routers/commission";
import { amlRouter } from "./routers/aml";
import { copyRouter } from "./routers/copy";
import { routingRouter } from "./routers/routing";
import { migrationRouter } from "./routers/migration";
import { billingRouter } from "./routers/billing";
import { securityRouter } from "./routers/security";
import { opportunitiesRouter } from "./routers/opportunities";
import { emailRouter } from "./routers/email";
import { offersRouter } from "./routers/offers";
import { blackbookRouter } from "./routers/blackbook";
import { channelsRouter } from "./routers/channels";
import { requestsRouter } from "./routers/requests";
import { vendorsRouter } from "./routers/vendors";
import { todayRouter } from "./routers/today";
import { dealsRouter } from "./routers/deals";
import { activityRouter } from "./routers/activity";
import { searchRouter } from "./routers/search";
import { documentsRouter } from "./routers/documents";
import { plansRouter } from "./routers/plans";
import { requirementsRouter } from "./routers/requirements";
import { viewsRouter } from "./routers/views";
import { importsRouter } from "./routers/imports";
import { tenanciesRouter } from "./routers/tenancies";
import { tasksRouter } from "./routers/tasks";

/**
 * The API surface.
 *
 * This file did not exist until an audit went looking for it. Eleven
 * routers had been written, every one of them correct in isolation, and
 * none of them reachable — the API did not exist as far as any client was
 * concerned.
 *
 * It is a good example of the failure that a long build produces and a
 * code review does not catch: nothing is wrong with any individual file,
 * so nothing looks wrong. Only a question asked across the whole
 * codebase finds it.
 */
export const appRouter = router({
  // The front door. Everything it reads was computed overnight.
  today: todayRouter,
  // The module that had a nightly health job and no way to look at it.
  deals: dealsRouter,
  // What the product did on its own, and the button that reverses it.
  activity: activityRouter,
  // One box, the whole brokerage. The only search before this was
  // `contains` on a name, on two screens, each looking at one table.
  search: searchRouter,
  org: orgRouter,
  onboarding: onboardingRouter,

  leads: leadsRouter,
  conversations: conversationsRouter,
  pipeline: pipelineRouter,
  listings: listingsRouter,
  viewings: viewingsRouter,

  assistant: assistantRouter,
  copy: copyRouter,
  reports: reportsRouter,

  billing: billingRouter,
  security: securityRouter,
  opportunities: opportunitiesRouter,
  email: emailRouter,
  offers: offersRouter,
  blackbook: blackbookRouter,
  channels: channelsRouter,
  requests: requestsRouter,
  vendors: vendorsRouter,
  commission: commissionRouter,
  aml: amlRouter,
  // The table a nightly job had been sweeping since the first schema
  // with nothing able to put a row in it.
  documents: documentsRouter,
  routing: routingRouter,
  // Nurture plans. The nightly job that works them had been running
  // over a table nothing could write.
  plans: plansRouter,
  // What a buyer is looking for. Matching and search read it; only voice
  // intake had ever written one.
  requirements: requirementsRouter,
  // Saved filters for the lists.
  views: viewsRouter,
  // Leads in from a spreadsheet. The migration router records what is
  // wrong with an export; this one brings the rows in.
  imports: importsRouter,
  // Leases on rentals, so the renewal comes round before the notice line.
  tenancies: tenanciesRouter,
  // Tasks a person writes, and hands to a colleague.
  tasks: tasksRouter,

  privacy: privacyRouter,
  support: supportRouter,
  migration: migrationRouter,
});

export type AppRouter = typeof appRouter;
