/**
 * Schema registry.
 *
 * Two kinds of document here, and the split is deliberate:
 *
 *   Singletons  — one of each, ever. Site settings, the homepage, the
 *                 security page. Editors open them, they don't create them.
 *   Collections — many of each. Plans, testimonials, posts, integrations.
 *
 * Getting that boundary right is most of what makes a CMS pleasant. If an
 * editor can accidentally create a second homepage, they eventually will.
 */
import siteSettings from "./singletons/siteSettings";
import homePage from "./singletons/homePage";
import securityPage from "./singletons/securityPage";

import plan from "./collections/plan";
import testimonial from "./collections/testimonial";
import customerLogo from "./collections/customerLogo";
import faq from "./collections/faq";
import integration from "./collections/integration";
import post from "./collections/post";
import person from "./collections/person";

import seo from "./objects/seo";
import cta from "./objects/cta";

export const singletonTypes = new Set(["siteSettings", "homePage", "securityPage"]);

export const schemaTypes = [
  siteSettings, homePage, securityPage,
  plan, testimonial, customerLogo, faq, integration, post, person,
  seo, cta,
];
