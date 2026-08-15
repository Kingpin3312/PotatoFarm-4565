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
 * Nothing here imports anything. That is deliberate — it is the leaf of
 * the graph, so no future component can close a cycle through it.
 */

/**
 * The top bar. Seven items, not ten.
 *
 * Setup disappears once it is done, and Team and Billing live under
 * Settings — they are things an owner visits monthly, not a place
 * anybody works. A nav bar with ten entries is one nobody reads.
 */
export const NAV = [
  // Today is first because it is the front door — `/` redirects here.
  // It carries the same natural-language input the Ask screen has, so
  // Ask is no longer a separate destination in a bar with a ceiling of
  // seven; it moved under More.
  { href: "/today", label: "Today" },
  { href: "/inbox", label: "Inbox" },
  { href: "/viewings", label: "Diary" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/blackbook", label: "Blackbook" },
  { href: "/offers", label: "Offers" },
  { href: "/settings", label: "Settings" },
];

/**
 * The second tier. Visited weekly or monthly, never lived in.
 *
 * The top bar drifted to nine items twice — each new screen looked like
 * it belonged there. The rule that holds it: a top-level item is
 * somewhere an agent goes several times a day. Everything else is here.
 */
export const SETTINGS_NAV = [
  { href: "/deals", label: "Deals" },
  { href: "/activity", label: "What it did" },
  { href: "/reports", label: "Reports" },
  { href: "/me", label: "Mine" },
  { href: "/leads", label: "Leads" },
  { href: "/listings", label: "Listings" },
  { href: "/settings", label: "General" },
  { href: "/compliance", label: "Compliance" },
  // Not under Compliance: a broker card and a Trakheesi permit are an
  // admin's problem, and the compliance screens are deliberately
  // invisible to admins.
  { href: "/documents", label: "Documents" },
  { href: "/settings/privacy", label: "Privacy" },
  { href: "/settings/access", label: "Access" },
  { href: "/settings/hours", label: "Working hours" },
  { href: "/settings/routing", label: "Routing" },
  { href: "/settings/channels", label: "Channels" },
  { href: "/settings/import", label: "Import" },
  { href: "/team", label: "Team" },
  { href: "/settings/commission", label: "Commission plans" },
  { href: "/settings/billing", label: "Billing" },
];

/** Behind More on a phone, ordered by how often an agent opens them. */
export const MORE = [
  { href: "/search", label: "Find anyone" },
  { href: "/ask", label: "Ask" },
  { href: "/deals", label: "Deals" },
  { href: "/activity", label: "What it did" },
  { href: "/blackbook", label: "Blackbook" },
  { href: "/offers", label: "Offers" },
  { href: "/leads", label: "Leads" },
  { href: "/listings", label: "Listings" },
  { href: "/commission", label: "Commission" },
  { href: "/compliance", label: "Compliance" },
  { href: "/documents", label: "Documents" },
  { href: "/reports", label: "Reports" },
  { href: "/team", label: "Team" },
  { href: "/settings", label: "Settings" },
];
