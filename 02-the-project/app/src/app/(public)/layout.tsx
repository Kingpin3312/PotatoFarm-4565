import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/**
 * The frame for the five screens outside the application.
 *
 * Sign in, check your email, the sign-in error, sign up and accepting
 * an invite. All five sit outside `Shell`, which is where the lockup
 * lived — so all five carried **no logo at all**. They are the first
 * five screens a brokerage owner ever sees, and until now they looked
 * like an unbranded form asking for a work email, which is what a
 * phishing page also looks like.
 *
 * A layout rather than five edits: a sixth public screen gets the brand
 * by existing.
 */
export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh flex flex-col">
      {/* Same measure as the pages under it.
          Left-aligned in the viewport, the lockup sat at the far edge
          while the form was centred, and the two read as unrelated
          things on one page. Every public screen lays out at 42–46ch
          centred, so the header takes the widest of those and lines up
          with the heading below it. */}
      <header className="mx-auto w-full max-w-[46ch] px-6 pt-8">
        {/* Home, not `/today` — somebody who is not signed in cannot go
            there, and a logo that bounces you through a redirect back to
            the page you are already on is worse than one that does
            nothing. */}
        <Link href="/" className="no-underline inline-flex" aria-label="PotatoFarm.io home">
          <Logo />
        </Link>
      </header>
      {children}
    </div>
  );
}
