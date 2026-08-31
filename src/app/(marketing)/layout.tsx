import Link from "next/link";
import { Logo, Mark } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";

/**
 * The public face. Everything else in the app is behind a session.
 *
 * Deliberately its own layout rather than sharing the dashboard's: nobody who
 * has not signed up should ever load the sidebar, the nav, or a database query
 * about a business they do not have.
 */
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-3.5 sm:px-8">
          <Link href="/" aria-label="Second Pair">
            <Logo markClass="size-7" />
          </Link>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <ThemeToggle compact />
            </div>
            <Link href="/login" className="btn-ghost">
              Sign in
            </Link>
            {/* The pack allows amber for one call to action per screen. This
                is that one, and it is the only amber on the page. */}
            <Link
              href="/login"
              className="btn inline-flex bg-highlight font-semibold text-[#17150f] hover:brightness-95"
            >
              Get started
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-xs text-muted sm:px-8">
          <span className="wordmark flex items-center gap-2 text-foreground">
            <Mark className="size-4" />
            second <span className="font-medium">pair</span>
          </span>
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <span className="ml-auto">Made in the UK</span>
        </div>
      </footer>
    </div>
  );
}
