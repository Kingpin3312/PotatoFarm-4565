"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/trpc";
import { cn } from "@/lib/cn";
import { NAV, SETTINGS_NAV } from "@/components/layout/nav";

/**
 * ⌘K.
 *
 * The app had **no keyboard shortcuts at all** — no `metaKey` handler
 * anywhere — so a desk agent working forty leads reached for the mouse
 * for every single action. This is the one shortcut worth having,
 * because it collapses two things an agent does constantly into one
 * gesture: going somewhere, and finding somebody.
 *
 * It is a thin surface over work that already exists: the same
 * `search.ask` that powers the Find screen, and the same nav lists the
 * shell renders. Nothing here has its own idea of where things are, so
 * a new screen appears in the palette by being added to the nav.
 *
 * **Native `<dialog>` with `showModal()`**, as everywhere else in this
 * codebase. It gives a real focus trap, Escape, and inertness of the
 * page behind for free — three things a hand-rolled overlay gets wrong
 * in a way that only a keyboard user notices.
 */

/**
 * How anything else asks for the palette.
 *
 * A window event rather than a context provider or a lifted `open`
 * state. The palette is mounted once, at the bottom of the shell, and
 * the only other thing that needs to reach it is a button in the header
 * — threading a setter from the shell down to the palette and back up
 * to the button would put the shell in charge of a state it never reads.
 *
 * It also means a keyboard shortcut and a click are the *same* code
 * path, which is the only reason the two cannot drift apart.
 */
export const PALETTE_OPEN = "potato:palette-open";

type Item = {
  id: string;
  label: string;
  hint?: string | null;
  href: string;
  group: "Go to" | "People" | "Properties";
};

/** Everywhere the shell can reach, flattened once. */
const DESTINATIONS: Item[] = [
  ...NAV.map((n): Item => ({ id: `nav:${n.href}`, label: n.label, href: n.href, group: "Go to" })),
  ...SETTINGS_NAV.map((n): Item => ({ id: `set:${n.href}`, label: n.label, href: n.href, group: "Go to" })),
  { id: "nav:/search", label: "Find anyone", href: "/search", group: "Go to" },
  { id: "nav:/ask", label: "Ask", href: "/ask", group: "Go to" },
];

/**
 * The visible way in.
 *
 * A shortcut nobody can see is a shortcut nobody uses. This was the
 * whole risk of building ⌘K: the app had no keyboard shortcuts at all,
 * so there is no existing habit to lean on and no reason for an agent to
 * try the keys. The button is what teaches the shortcut — it carries the
 * badge, so somebody who reaches for the mouse the first ten times still
 * reads "⌘K" ten times.
 *
 * Shaped like a search field rather than an icon, because that is what
 * it does, and because the icon-only version tested as invisible next to
 * a nav bar of seven text links.
 */
export function PaletteButton({ className }: { className?: string }) {
  /**
   * Rendered after mount, not during.
   *
   * The server has no idea what keyboard the reader has, so deciding ⌘
   * against Ctrl while rendering produces markup that disagrees with the
   * client and React replaces the node. Empty until mounted, then
   * correct — the button is the same width either way, so nothing moves.
   */
  const [keys, setKeys] = useState("");
  useEffect(() => {
    setKeys(/Mac|iPhone|iPad/.test(navigator.platform ?? "") ? "⌘K" : "Ctrl K");
  }, []);

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(PALETTE_OPEN))}
      aria-label="Search and go to"
      aria-keyshortcuts="Meta+K Control+K"
      className={cn(
        "min-h-11 flex items-center gap-2 pl-3 pr-2 rounded-lg cursor-pointer",
        "bg-sunk border border-rule text-ink-3 hover:text-ink text-note",
        className,
      )}
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" className="w-4 h-4 shrink-0"
           fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" />
      </svg>
      <span>Search</span>
      <kbd className="font-mono text-label px-1.5 py-0.5 rounded border border-rule min-w-11 text-center">
        {keys}
      </kbd>
    </button>
  );
}

export function CommandPalette() {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [active, setActive] = useState(0);

  /**
   * Only asks the server once the query looks like a question.
   *
   * Two characters would run a trigram scan of the whole book on every
   * keystroke. Three is where a search stops matching everything.
   */
  const { data, isFetching } = api.search.ask.useQuery(
    { q, limit: 8 },
    { enabled: open && q.trim().length >= 3, staleTime: 15_000 },
  );

  const matches = q.trim()
    ? DESTINATIONS.filter((d) => d.label.toLowerCase().includes(q.trim().toLowerCase()))
    : DESTINATIONS;

  const hits: Item[] = (data?.hits ?? [])
    // A row with no href is an answer, not a destination — a colleague's
    // client, or an owner with no screen to open. It stays visible on the
    // Find screen; it has no business in a list you navigate with Enter.
    .filter((h) => !!h.href)
    .map((h) => ({
      id: `hit:${h.kind}:${h.id}`,
      label: h.title,
      hint: h.why?.[0] ?? h.subtitle ?? null,
      href: h.href,
      group: h.kind === "property" ? ("Properties" as const) : ("People" as const),
    }));

  const items = [...matches.slice(0, q.trim() ? 5 : 8), ...hits];

  const close = useCallback(() => {
    dialog.current?.close();
    setOpen(false);
    setQ("");
    setActive(0);
  }, []);

  const go = useCallback((item: Item) => {
    close();
    router.push(item.href);
  }, [close, router]);

  const show = useCallback(() => {
    if (dialog.current?.open) return;
    setOpen(true);
    dialog.current?.showModal();
    // After the dialog paints, or focus lands on nothing.
    requestAnimationFrame(() => input.current?.focus());
  }, []);

  /**
   * The global shortcut, and the header button, on one path.
   *
   * ⌘K on a Mac, Ctrl+K elsewhere. Deliberately fires even while a text
   * field has focus — the whole point is to reach it without thinking
   * about where the cursor is — which is why it is a modified key and
   * not a bare `/`. A bare slash would swallow a character every time an
   * agent typed a date into a form.
   *
   * The shortcut toggles; the button only opens. Clicking a control that
   * is already showing its own panel and having the panel vanish is a
   * different gesture from pressing the same keys twice.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (dialog.current?.open) return close();
        show();
      }
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(PALETTE_OPEN, show);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(PALETTE_OPEN, show);
    };
  }, [close, show]);

  /** Escape and the backdrop both close it; keep React in step. */
  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    const onClose = () => { setOpen(false); setQ(""); setActive(0); };
    el.addEventListener("close", onClose);
    return () => el.removeEventListener("close", onClose);
  }, []);

  useEffect(() => { setActive(0); }, [q]);

  const onInputKey = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((i) => Math.min(i + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (item) go(item);
    }
  };

  let lastGroup: string | null = null;

  return (
    <dialog
      ref={dialog}
      aria-label="Search and go to"
      onClick={(e) => { if (e.target === dialog.current) close(); }}
      className={cn(
        "backdrop:bg-ink/25 bg-transparent p-0 m-0 max-w-none max-h-none w-full h-full",
      )}
    >
      {/* Placed high rather than centred: the list grows downwards and a
          centred box jumps as results arrive. */}
      <div className="flex justify-center pt-[12vh] px-4" onClick={(e) => e.stopPropagation()}>
        <div className="w-full max-w-[560px] bg-raised border border-rule rounded-xl shadow-lift overflow-hidden">
          <input
            ref={input}
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onInputKey}
            placeholder="Go to a screen, or find anyone…"
            aria-label="Go to a screen, or find anyone"
            aria-controls="palette-list"
            aria-activedescendant={items[active] ? `palette-${items[active].id}` : undefined}
            role="combobox"
            aria-expanded
            autoComplete="off"
            className="w-full min-h-14 px-4 text-sub bg-transparent border-0 border-b border-rule outline-none text-ink placeholder:text-ink-3"
          />

          {/* The count, announced. Results change with no navigation, so
              without this a screen reader user types and hears nothing. */}
          <p role="status" aria-live="polite" className="sr-only">
            {isFetching ? "Searching" : `${items.length} result${items.length === 1 ? "" : "s"}`}
          </p>

          <ul id="palette-list" role="listbox" aria-label="Results" className="max-h-[52vh] overflow-y-auto overscroll-contain py-1 m-0 list-none">
            {items.length === 0 && (
              <li className="px-4 py-4 text-ui text-ink-3">
                {q.trim().length < 3 ? "Keep typing to search." : "Nothing matched."}
              </li>
            )}
            {items.map((item, i) => {
              const head = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <li key={item.id}>
                  {head && (
                    <p className="t-label text-ink-3 px-4 pt-3 pb-1">
                      {head}
                    </p>
                  )}
                  <button
                    id={`palette-${item.id}`}
                    role="option"
                    aria-selected={i === active}
                    // Hover moves the selection so mouse and keyboard
                    // never disagree about what Enter will do.
                    onMouseEnter={() => setActive(i)}
                    onClick={() => go(item)}
                    className={cn(
                      "w-full text-left px-4 min-h-11 py-2 flex flex-col gap-0.5 border-0 cursor-pointer",
                      i === active ? "bg-sunk" : "bg-transparent",
                    )}
                  >
                    <span className="text-ui text-ink leading-snug">{item.label}</span>
                    {item.hint && (
                      <span className="text-note text-ink-3 leading-snug">{item.hint}</span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>

          <p className="px-4 py-2.5 border-t border-rule text-label font-mono uppercase tracking-[0.1em] text-ink-3">
            ↑↓ move · ⏎ open · esc close
          </p>
        </div>
      </div>
    </dialog>
  );
}
