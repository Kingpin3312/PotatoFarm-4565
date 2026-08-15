"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/cn";
import { NAV, SETTINGS_NAV, MORE } from "./nav";
import { CommandPalette, PaletteButton } from "@/components/ui/command-palette";
import { api } from "@/lib/trpc";
import { Logo } from "@/components/brand/logo";

/**
 * The frame every screen sits in.
 *
 * Two things it carries that are not decoration: the brokerage switcher,
 * because an agent working across two agencies needs to know which one
 * they are looking at before they message somebody — and the assistant's
 * state, because silence with no explanation reads as a fault.
 *
 * The nav lists it renders live in `./nav`, not here. See that file for
 * why — in short, the palette needs them too and a component is the
 * wrong home for a constant another component reads.
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
            {/* One lockup, in `components/brand/logo.tsx`. The mark used to
                be inlined right here, which made the shell the only React
                surface that had one — every screen outside it, sign-in
                included, had no logo at all. */}
            <Logo />
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
                Mobile reaches it through More.

                It opens the palette rather than navigating, and that is
                not a link quietly turned into a button: the palette
                answers the same question in one keystroke instead of a
                page load, and the full Find screen is still the first
                entry inside it. What was lost — middle-click, open in a
                new tab — nobody does to a search box. */}
            <PaletteButton className="hidden lg:flex" />

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
      <CommandPalette />
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
