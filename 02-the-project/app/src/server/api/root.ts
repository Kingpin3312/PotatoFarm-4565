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
import { offersRouter } from "./routers/offers";
import { blackbookRouter } from "./routers/blackbook";
import { channelsRouter } from "./routers/channels";
import { requestsRouter } from "./routers/requests";
import { vendorsRouter } from "./routers/vendors";
import { todayRouter } from "./routers/today";
import { dealsRouter } from "./routers/deals";

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
  offers: offersRouter,
  blackbook: blackbookRouter,
  channels: channelsRouter,
  requests: requestsRouter,
  vendors: vendorsRouter,
  commission: commissionRouter,
  aml: amlRouter,
  routing: routingRouter,

  privacy: privacyRouter,
  support: supportRouter,
  migration: migrationRouter,
});

export type AppRouter = typeof appRouter;
