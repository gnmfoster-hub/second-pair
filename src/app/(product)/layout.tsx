import Link from "next/link";

/**
 * A product page with nothing of Second Pair's on it.
 *
 * The first version of the Family APP! page sat in the marketing group and so
 * inherited its header: a navy and orange logo and an orange "Get set up"
 * button, sitting on cream paper above a different product entirely. It read
 * as a Second Pair page about a family app, which is precisely the impression
 * a separate product must not give.
 *
 * So this group has its own shell and almost nothing in it. The company line
 * belongs at the bottom, where it is a signature rather than a frame.
 */
export default function ProductLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">{children}</main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-6 gap-y-2 px-5 py-7 text-xs text-muted sm:px-8">
          <Link href="/" className="font-medium hover:text-foreground">
            Second Pair Ltd
          </Link>
          <Link href="/company" className="hover:text-foreground">
            The company
          </Link>
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
