import Link from "next/link";
import { Logo } from "@/components/brand/logo";

/**
 * The page a wrong address lands on.
 *
 * There was none, so Next rendered its own default: a white page in a
 * system font with "404 | This page could not be found." — the one
 * screen in the product outside the palette, reached from any mistyped
 * link or an old bookmark. Same frame as the public screens, and the
 * way back goes to `/today`, which sends anybody not signed in to
 * sign-in on its own.
 */
export default function NotFound() {
  return (
    <div className="min-h-dvh flex flex-col">
      <header className="mx-auto w-full max-w-[46ch] px-6 pt-8">
        <Link href="/" className="inline-flex min-h-11 items-center no-underline" aria-label="PotatoFarm.io home">
          <Logo />
        </Link>
      </header>
      <main id="main" className="max-w-[46ch] w-full mx-auto px-6 py-16">
        <h1 className="font-sans font-semibold text-h2 text-ink leading-tight">
          There is nothing at this address.
        </h1>
        <p className="text-sub text-ink-2 mt-3">
          The link may be old, or mistyped. Everything you had is still where it was.
        </p>
        <p className="text-ui text-ink-2 mt-10">
          <Link href="/today" className="text-accent-deep underline">Go to Today</Link>
        </p>
      </main>
    </div>
  );
}
