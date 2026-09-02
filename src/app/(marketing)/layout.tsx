import Link from "next/link";
import { Logo } from "@/components/Logo";
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
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-5 py-4 sm:px-8">
          {/* Thirty pixels disappeared into the header, and this is the only
              place most people will ever see the name. */}
          <Link href="/" aria-label="Second Pair" className="shrink-0">
            <Logo height={42} lockup="inline" />
          </Link>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden sm:block">
              <ThemeToggle compact />
            </div>
            <Link href="/login" className="btn-ghost">
              Sign in
            </Link>
            {/* The pack allows amber for one call to action per screen. This
                is that one, and it is the only amber on the page.

                It pointed at /login, which is a password box — a door for
                people who already have an account, offered to people who do
                not. Nobody self-serves onto this yet: every business is set up
                with them. So it asks, and our own assistant does the asking. */}
            <Link
              href="/home#see-it"
              className="btn inline-flex bg-highlight font-semibold text-on-highlight hover:brightness-95"
            >
              Get set up
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-8 text-xs text-muted sm:px-8">
          <Logo height={22} lockup="inline" />
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
