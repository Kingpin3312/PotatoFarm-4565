"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { api } from "@/lib/trpc";

/**
 * Six items, not ten.
 *
 * Setup disappears once it is done, and Team and Billing live under
 * Settings — they are things an owner visits monthly, not a place
 * anybody works. A nav bar with ten entries is one nobody reads.
 */
/** Under Settings. Visited occasionally, never lived in. */
/**
 * The second tier. Visited weekly or monthly, never lived in.
 *
 * The top bar drifted to nine items twice — each new screen looked like
 * it belonged there. The rule that holds it: a top-level item is
 * somewhere an agent goes several times a day. Everything else is here.
 */
export const SETTINGS_NAV = [
  { href: "/reports", label: "Reports" },
  { href: "/me", label: "Mine" },
  { href: "/leads", label: "Leads" },
  { href: "/listings", label: "Listings" },
  { href: "/settings", label: "General" },
  { href: "/compliance", label: "Compliance" },
  { href: "/settings/privacy", label: "Privacy" },
  { href: "/settings/access", label: "Access" },
  { href: "/settings/routing", label: "Routing" },
  { href: "/settings/channels", label: "Channels" },
  { href: "/settings/import", label: "Import" },
  { href: "/team", label: "Team" },
  { href: "/settings/billing", label: "Billing" },
];

const NAV = [
  { href: "/inbox", label: "Inbox" },
  { href: "/ask", label: "Ask" },
  { href: "/viewings", label: "Today" },
  { href: "/pipeline", label: "Pipeline" },
  { href: "/blackbook", label: "Blackbook" },
  { href: "/offers", label: "Offers" },
  { href: "/settings", label: "Settings" },
];

/**
 * The frame every screen sits in.
 *
 * Two things it carries that are not decoration: the brokerage switcher,
 * because an agent working across two agencies needs to know which one
 * they are looking at before they message somebody — and the assistant's
 * state, because silence with no explanation reads as a fault.
 */
export function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { data: orgs , isError, refetch , isLoading } = api.org.mine.useQuery();
  const { data: assistant } = api.assistant.isRunning.useQuery();
  const active = orgs?.find((o) => o.active);

  return (
    <div className="min-h-dvh flex flex-col">
      <header className="sticky top-0 z-50 bg-ground border-b border-ink">
        <div className="flex items-center gap-5 px-5 h-14">
          <Link href="/inbox" className="flex items-center no-underline">
            {/* The potato. Same file the site and the app icon use — one mark,
                  not three that drift. */}
              <svg viewBox="0 0 64 64" aria-hidden="true" className="w-[26px] h-[26px] mr-2.5 shrink-0"><g transform="translate(0.0,0.0) scale(1.0)"><defs><linearGradient id="shm1" x1="24%" y1="14%" x2="70%" y2="86%"><stop offset="0" stop-color="#EE9149"/><stop offset="0.5" stop-color="#E87A2E"/><stop offset="1" stop-color="#DB6E22"/></linearGradient><filter id="blm1"><feGaussianBlur stdDeviation="7"/></filter><filter id="dpm1" x="-35%" y="-35%" width="180%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="2.2" flood-color="#8A4310" flood-opacity="0.18"/></filter><clipPath id="cpm1"><path d="M33,4 C42,4.5 48,11 50,20 C52,29 50,37 48,44 C45,53 38,60 30,60 C21,60 15,54 13,45 C11,35 12,24 16,15 C20,7 26,3.5 33,4 Z"/></clipPath></defs><path d="M33,4 C42,4.5 48,11 50,20 C52,29 50,37 48,44 C45,53 38,60 30,60 C21,60 15,54 13,45 C11,35 12,24 16,15 C20,7 26,3.5 33,4 Z" fill="url(#shm1)" filter="url(#dpm1)"/><g clip-path="url(#cpm1)"><ellipse cx="25" cy="20" rx="17" ry="19" fill="#FFFFFF" opacity="0.15" filter="url(#blm1)"/></g><ellipse cx="25.5" cy="25" rx="3.2" ry="4.9" fill="#8A4310"/><ellipse cx="38.5" cy="24.2" rx="3.1" ry="4.8" fill="#8A4310"/></g></svg>
            {/* One line, deliberately. JSX collapses the whitespace around a
                newline or a comment into a real space — this was written across
                several lines for readability and rendered "PotatoFarm .io".
                The extension takes accent-type at 5.56:1; the fill orange is
                3.12:1 and unreadable at 20px. */}
            <span className="font-sans font-semibold text-[20px] text-ink -tracking-[0.024em]">PotatoFarm<span className="text-accent-type font-medium">.io</span></span>
          </Link>

          <nav className="flex gap-5 ml-2 overflow-x-auto">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={pathname.startsWith(n.href) ? "page" : undefined}
                className={cn(
                  "text-[15px] no-underline py-1 border-b whitespace-nowrap",
                  pathname.startsWith(n.href)
                    ? "text-ink border-ink"
                    : "text-ink-3 border-transparent hover:text-ink"
                )}
              >
                {n.label}
              </Link>
            ))}
          </nav>

          <div className="ml-auto flex items-center gap-3">
            {/* Only shown when it is off. A green "everything is fine"
                badge is noise; its absence is the normal state. */}
            {assistant && !assistant.enabled && (
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-accent">
                Assistant stopped
              </span>
            )}
            {active && (
              <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-ink-3">
                {active.name}
              </span>
            )}
          </div>
        </div>
      </header>

      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
