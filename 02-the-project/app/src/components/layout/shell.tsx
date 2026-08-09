"use client";

import { useEffect, useRef, useState } from "react";
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
          <Link href="/today" className="flex min-h-11 items-center no-underline">
            {/* The potato. Same file the site and the app icon use — one mark,
                  not three that drift. */}
              <svg viewBox="0 0 64 64" aria-hidden="true" className="w-[26px] h-[26px] mr-2.5 shrink-0"><g transform="translate(0.0,0.0) scale(1.0)"><defs><linearGradient id="shm1" x1="24%" y1="14%" x2="70%" y2="86%"><stop offset="0" stopColor="#EE9149"/><stop offset="0.5" stopColor="#E87A2E"/><stop offset="1" stopColor="#DB6E22"/></linearGradient><filter id="blm1"><feGaussianBlur stdDeviation="7"/></filter><filter id="dpm1" x="-35%" y="-35%" width="180%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="2.2" floodColor="#8A4310" floodOpacity="0.18"/></filter><clipPath id="cpm1"><path d="M33,4 C42,4.5 48,11 50,20 C52,29 50,37 48,44 C45,53 38,60 30,60 C21,60 15,54 13,45 C11,35 12,24 16,15 C20,7 26,3.5 33,4 Z"/></clipPath></defs><path d="M33,4 C42,4.5 48,11 50,20 C52,29 50,37 48,44 C45,53 38,60 30,60 C21,60 15,54 13,45 C11,35 12,24 16,15 C20,7 26,3.5 33,4 Z" fill="url(#shm1)" filter="url(#dpm1)"/><g clipPath="url(#cpm1)"><ellipse cx="25" cy="20" rx="17" ry="19" fill="#FFFFFF" opacity="0.15" filter="url(#blm1)"/></g><ellipse cx="25.5" cy="25" rx="3.2" ry="4.9" fill="#8A4310"/><ellipse cx="38.5" cy="24.2" rx="3.1" ry="4.8" fill="#8A4310"/></g></svg>
            {/* One line, deliberately. JSX collapses the whitespace around a
                newline or a comment into a real space — this was written across
                several lines for readability and rendered "PotatoFarm .io".
                The extension takes accent-type at 5.56:1; the fill orange is
                3.12:1 and unreadable at 20px. */}
            <span className="font-sans font-semibold text-[20px] text-ink -tracking-[0.024em]">PotatoFarm<span className="text-accent-type font-medium">.io</span></span>
          </Link>

          {/* Desktop only. At 375px this scrolled sideways with 356px
              of itself hidden and no affordance saying so — roughly
              half the navigation was unreachable. The bottom bar below
              takes over on a phone. */}
          <nav className="hidden md:flex gap-5 ml-2 overflow-x-auto">
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

      {/* `id="main"` is the target of the skip link in the root
          layout. Without it the first thing a keyboard or screen-reader
          user meets on every screen is a link that goes nowhere.

          The bottom padding on mobile is the height of the tab bar plus
          the home indicator. Without it the last row of every list sits
          underneath the bar, which is the sort of thing that makes an
          app feel broken without anyone being able to say why. */}
      <main
        id="main"
        className="flex-1 min-h-0 pb-[calc(3.5rem+env(safe-area-inset-bottom))] md:pb-0"
      >
        {children}
      </main>

      <MobileTabs pathname={pathname} />
    </div>
  );
}

/**
 * The phone navigation.
 *
 * Seven items across the top does not fit a 375px screen — it scrolled
 * with more than half of itself hidden and nothing to say so. A bottom
 * bar instead, for two reasons that are not aesthetic: it is within
 * thumb reach on a phone held one-handed, which is how an agent uses
 * this between viewings, and it is always visible, so the number of
 * places you can go is honest.
 *
 * **Five, and the fifth is More.** The mobile app made the same call and
 * wrote down why: shipping a full CRM on a phone looks more complete in
 * a demo and is worse to use. These four are what an agent does standing
 * in a lobby — read a message, see what is next, check the board, ask a
 * question. Everything else is a considered visit and lives behind More.
 */
const TABS = [
  { href: "/today", label: "Today", icon: "M12 3a4 4 0 0 1 4 4v4a4 4 0 0 1-8 0V7a4 4 0 0 1 4-4ZM5 11a7 7 0 0 0 14 0M12 18v3" },
  { href: "/inbox", label: "Inbox", icon: "M3 5h18v12H7l-4 4V5Z" },
  { href: "/viewings", label: "Diary", icon: "M4 5h16v16H4zM4 9h16M9 3v4M15 3v4" },
  { href: "/pipeline", label: "Pipeline", icon: "M4 5h5v14H4zM10 5h5v9h-5zM16 5h4v6h-4z" },
] as const;

/** Behind More, ordered by how often an agent opens them. */
const MORE = [
  { href: "/ask", label: "Ask" },
  { href: "/blackbook", label: "Blackbook" },
  { href: "/offers", label: "Offers" },
  { href: "/leads", label: "Leads" },
  { href: "/listings", label: "Listings" },
  { href: "/commission", label: "Commission" },
  { href: "/compliance", label: "Compliance" },
  { href: "/reports", label: "Reports" },
  { href: "/team", label: "Team" },
  { href: "/settings", label: "Settings" },
];

function MobileTabs({ pathname }: { pathname: string }) {
  const [more, setMore] = useState(false);
  const onMore = MORE.some((m) => pathname.startsWith(m.href));
  const trigger = useRef<HTMLButtonElement>(null);

  /**
   * Escape closes it, and focus goes back to the button that opened it.
   *
   * A native `<dialog>` gives both of these free. This is a `div` with
   * `role="dialog"` — chosen so the sheet can sit above the tab bar and
   * animate, which `showModal` fights — and a div gives you nothing. Open
   * on a keyboard and the only way out was Tab through every link to the
   * backdrop, which reads as a trap.
   *
   * The sheet is closed on every navigation anyway (each Link calls
   * setMore(false)), so this listener is only bound while it is open.
   */
  useEffect(() => {
    if (!more) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setMore(false);
      trigger.current?.focus();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [more]);

  return (
    <>
      {more && (
        <div className="md:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="More">
          <button
            className="absolute inset-0 w-full bg-[rgb(26_26_26/.45)]"
            aria-label="Close"
            onClick={() => setMore(false)}
          />
          <div className="absolute bottom-[calc(3.5rem+env(safe-area-inset-bottom))] left-0 right-0 max-h-[70dvh] overflow-y-auto rounded-t-2xl border-t border-rule bg-raised p-2">
            {MORE.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setMore(false)}
                className={cn(
                  "flex min-h-12 items-center rounded-lg px-4 text-[16px] no-underline",
                  pathname.startsWith(m.href) ? "bg-sunk font-semibold text-ink" : "text-ink-2"
                )}
              >
                {m.label}
              </Link>
            ))}
          </div>
        </div>
      )}

      <nav
        aria-label="Main"
        className="md:hidden fixed bottom-0 inset-x-0 z-50 grid grid-cols-5 border-t border-rule bg-ground pb-[env(safe-area-inset-bottom)]"
      >
        {TABS.map((t) => {
          const on = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              aria-current={on ? "page" : undefined}
              className={cn(
                "flex h-14 flex-col items-center justify-center gap-1 no-underline",
                on ? "text-ink" : "text-ink-3"
              )}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px]"
                   fill="none" stroke="currentColor" strokeWidth="1.6"
                   strokeLinecap="round" strokeLinejoin="round">
                <path d={t.icon} />
              </svg>
              <span className="font-mono text-[9px] uppercase tracking-[0.08em]">{t.label}</span>
            </Link>
          );
        })}

        <button
          ref={trigger}
          onClick={() => setMore((v) => !v)}
          aria-expanded={more}
          className={cn(
            "flex h-14 flex-col items-center justify-center gap-1",
            more || onMore ? "text-ink" : "text-ink-3"
          )}
        >
          <svg viewBox="0 0 24 24" aria-hidden="true" className="h-[22px] w-[22px]"
               fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round">
            <path d="M4 7h16M4 12h16M4 17h16" />
          </svg>
          <span className="font-mono text-[9px] uppercase tracking-[0.08em]">More</span>
        </button>
      </nav>
    </>
  );
}
