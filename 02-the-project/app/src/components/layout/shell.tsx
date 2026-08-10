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
  { href: "/deals", label: "Deals" },
  { href: "/activity", label: "What it did" },
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
              <svg viewBox="0 0 64 64" aria-hidden="true" className="w-[26px] h-[26px] mr-2.5 shrink-0"><g transform="translate(0.0,0.0) scale(1.0)"><defs><linearGradient id="shm1" x1="22%" y1="10%" x2="74%" y2="90%"><stop offset="0" stopColor="#F8BA5E"/><stop offset="0.5" stopColor="#F0A03A"/><stop offset="1" stopColor="#E5842A"/></linearGradient><filter id="blm1"><feGaussianBlur stdDeviation="7"/></filter><filter id="dpm1" x="-35%" y="-35%" width="180%" height="180%"><feDropShadow dx="0" dy="2" stdDeviation="2.2" floodColor="#8A4310" floodOpacity="0.18"/></filter><clipPath id="cpm1"><path d="M31.8,3.2 C38.4,2.9 43.8,7.4 46.6,14.2 C49.0,20.0 49.8,26.4 50.4,32.6 C51.0,39.2 50.6,46.2 46.8,51.8 C42.9,57.6 35.6,61.2 28.6,60.6 C21.6,60.0 15.6,55.0 13.2,48.4 C10.8,41.8 11.4,34.4 12.6,27.4 C13.9,19.8 16.2,11.6 21.8,6.6 C24.6,4.1 28.0,3.4 31.8,3.2 Z"/></clipPath></defs><path d="M31.8,3.2 C38.4,2.9 43.8,7.4 46.6,14.2 C49.0,20.0 49.8,26.4 50.4,32.6 C51.0,39.2 50.6,46.2 46.8,51.8 C42.9,57.6 35.6,61.2 28.6,60.6 C21.6,60.0 15.6,55.0 13.2,48.4 C10.8,41.8 11.4,34.4 12.6,27.4 C13.9,19.8 16.2,11.6 21.8,6.6 C24.6,4.1 28.0,3.4 31.8,3.2 Z" fill="url(#shm1)" stroke="#D9761C" strokeWidth="1.7" strokeLinejoin="round" filter="url(#dpm1)"/><g clipPath="url(#cpm1)"><ellipse cx="24" cy="17" rx="17" ry="18" fill="#FFFFFF" opacity="0.20" filter="url(#blm1)"/></g><rect x="22.8" y="22.2" width="4.5" height="10.0" rx="2.25" fill="#3B2416"/><rect x="35.0" y="21.6" width="4.2" height="9.6" rx="2.1" fill="#3B2416"/><path d="M45.4,33.0 C46.2,41.4 42.6,49.4 35.4,52.8" fill="none" stroke="#DD8A2E" strokeWidth="1.5" strokeLinecap="round" opacity="0.55"/><path d="M22.6,40.8 C24.4,42.6 27.2,43.0 29.4,41.8" fill="none" stroke="#DD8A2E" strokeWidth="1.6" strokeLinecap="round" opacity="0.8"/><path d="M22.6,16.0 C24.2,14.6 26.4,14.5 28.0,15.6" fill="none" stroke="#DD8A2E" strokeWidth="1.5" strokeLinecap="round" opacity="0.7"/><ellipse cx="41.8" cy="16.8" rx="1.0" ry="1.3" fill="#DD8A2E" opacity="0.5"/><ellipse cx="43.0" cy="43.2" rx="1.1" ry="1.4" fill="#DD8A2E" opacity="0.45"/></g></svg>
            {/* One line, deliberately. JSX collapses the whitespace around a
                newline or a comment into a real space — this was written across
                several lines for readability and rendered "PotatoFarm .io".
                The extension is #FF6600 at 20px semibold — 2.65:1 on the
                ground, which is a brand decision rather than a passing
                measurement. Large and bold is the least-bad place for it. */}
            <span className="font-sans font-semibold text-[20px] text-ink -tracking-[0.024em]">PotatoFarm<span className="text-accent-type font-medium">.io</span></span>
          </Link>

          {/* `lg`, not `md`, and that one letter was a real bug.
              At 375px this scrolled sideways with 356px of itself
              hidden and no affordance saying so — fixed by handing
              phones the bottom bar. But `md` is 768px, so an iPad at
              834px was still getting the *desktop* nav: seven links at
              32px tall on a touch screen, with "Settings" clipped
              mid-word at the right edge and no way to reach it. The
              same failure, one breakpoint up, on the device an agent
              presents to an owner with.

              The bar now appears only where there is room to lay it
              out and a pointer to use it. Everything below 1024px gets
              the touch bar. The links are 44px because a finger is
              not a mouse, and the header is 56px so they still
              centre. */}
          <nav className="hidden lg:flex gap-5 ml-2 overflow-x-auto">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                aria-current={pathname.startsWith(n.href) ? "page" : undefined}
                className={cn(
                  "inline-flex min-h-11 items-center text-[15px] no-underline border-b whitespace-nowrap",
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
            {/* Search sits here rather than in the bar, because the bar
                has a ceiling of seven and this is not a destination in
                the same sense — it is the thing you reach for when you
                cannot remember which destination holds the answer.
                Mobile reaches it through More. */}
            <Link
              href="/search"
              aria-current={pathname.startsWith("/search") ? "page" : undefined}
              className={cn(
                "hidden lg:flex min-h-11 items-center gap-1.5 text-[15px] no-underline",
                pathname.startsWith("/search") ? "text-ink" : "text-ink-3 hover:text-ink"
              )}
            >
              <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4"
                   fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
              </svg>
              Find
            </Link>

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
        className="flex-1 min-h-0 pb-[calc(3.5rem+env(safe-area-inset-bottom))] lg:pb-0"
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
        <div className="lg:hidden fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="More">
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
        className="lg:hidden fixed bottom-0 inset-x-0 z-50 grid grid-cols-5 border-t border-rule bg-ground pb-[env(safe-area-inset-bottom)]"
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
