/**
 * The frame for a property a brokerage sends a buyer.
 *
 * Deliberately not `(public)/layout.tsx`, which puts the PotatoFarm.io
 * lockup at the top of sign-in and sign-up — right for our own screens
 * and wrong here. This page is the brokerage's advertisement, opened by
 * its client from its agent's message; the name at the top is theirs,
 * and ours signs the foot of the page, as "Powered by", beneath it.
 */
export default function PropertyLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-ground">{children}</div>;
}
