/**
 * The navigation lists, and why they are not in the shell any more.
 *
 * The command palette needs the same lists the top bar renders — a
 * second copy is a copy that drifts, and this codebase has already had
 * a nav list go stale in exactly that way. Importing them from
 * `shell.tsx` created a cycle: the shell renders the palette, the
 * palette read `NAV` at module scope, and the browser threw
 * "Cannot access 'NAV' before initialization" — a 500 with no dialog
 * anywhere in the DOM.
 *
 * Data in its own module, consumed by both. The rule the cycle was
 * pointing at: a component should not be the home of a constant another
 * component needs.
 *
 * Nothing here imports anything at runtime. That is deliberate — it is
 * the leaf of the graph, so no future component can close a cycle
 * through it. The one import below is `import type`, which TypeScript
 * erases entirely: it constrains the keys at compile time and leaves no
 * edge in the module graph for a cycle to travel along.
 *
 * ## Why these are keys and not words
 *
 * The labels used to be English strings, and the palette read them
 * directly to build its search index. Translating them in the palette
 * and not here — or the reverse — is the drift this file was created to
 * prevent, one language further on. So the list holds a key, and every
 * consumer runs it through the same catalogue.
 */
import type { MessageKey } from "@/lib/i18n/en";

export type NavItem = { href: string; labelKey: MessageKey };

/**
 * The top bar. Seven items, not ten.
 *
 * Setup disappears once it is done, and Team and Billing live under
 * Settings — they are things an owner visits monthly, not a place
 * anybody works. A nav bar with ten entries is one nobody reads.
 */
export const NAV: NavItem[] = [
  // Today is first because it is the front door — `/` redirects here.
  // It carries the same natural-language input the Ask screen has, so
  // Ask is no longer a separate destination in a bar with a ceiling of
  // seven; it moved under More.
  { href: "/today", labelKey: "nav.today" },
  { href: "/inbox", labelKey: "nav.inbox" },
  { href: "/viewings", labelKey: "nav.diary" },
  { href: "/pipeline", labelKey: "nav.pipeline" },
  { href: "/blackbook", labelKey: "nav.blackbook" },
  { href: "/offers", labelKey: "nav.offers" },
  { href: "/settings", labelKey: "nav.settings" },
];

/**
 * The second tier. Visited weekly or monthly, never lived in.
 *
 * The top bar drifted to nine items twice — each new screen looked like
 * it belonged there. The rule that holds it: a top-level item is
 * somewhere an agent goes several times a day. Everything else is here.
 */
export const SETTINGS_NAV: NavItem[] = [
  { href: "/deals", labelKey: "nav.deals" },
  { href: "/activity", labelKey: "nav.activity" },
  { href: "/reports", labelKey: "nav.reports" },
  { href: "/me", labelKey: "nav.mine" },
  { href: "/leads", labelKey: "nav.leads" },
  { href: "/listings", labelKey: "nav.listings" },
  { href: "/settings", labelKey: "nav.general" },
  { href: "/compliance", labelKey: "nav.compliance" },
  // Not under Compliance: a broker card and a Trakheesi permit are an
  // admin's problem, and the compliance screens are deliberately
  // invisible to admins.
  { href: "/documents", labelKey: "nav.documents" },
  { href: "/settings/privacy", labelKey: "nav.privacy" },
  { href: "/settings/access", labelKey: "nav.access" },
  { href: "/settings/assistant", labelKey: "nav.assistantQuestions" },
  { href: "/settings/hours", labelKey: "nav.hours" },
  { href: "/settings/routing", labelKey: "nav.routing" },
  { href: "/settings/channels", labelKey: "nav.channels" },
  { href: "/settings/import", labelKey: "nav.import" },
  { href: "/team", labelKey: "nav.team" },
  { href: "/settings/commission", labelKey: "nav.commissionPlans" },
  { href: "/settings/billing", labelKey: "nav.billing" },
];

/** Behind More on a phone, ordered by how often an agent opens them. */
export const MORE: NavItem[] = [
  { href: "/search", labelKey: "nav.findAnyone" },
  { href: "/ask", labelKey: "nav.ask" },
  { href: "/deals", labelKey: "nav.deals" },
  { href: "/activity", labelKey: "nav.activity" },
  { href: "/blackbook", labelKey: "nav.blackbook" },
  { href: "/offers", labelKey: "nav.offers" },
  { href: "/leads", labelKey: "nav.leads" },
  { href: "/listings", labelKey: "nav.listings" },
  { href: "/commission", labelKey: "nav.commission" },
  { href: "/compliance", labelKey: "nav.compliance" },
  { href: "/documents", labelKey: "nav.documents" },
  { href: "/reports", labelKey: "nav.reports" },
  { href: "/team", labelKey: "nav.team" },
  { href: "/settings", labelKey: "nav.settings" },
];
