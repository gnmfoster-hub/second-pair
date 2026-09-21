import type { Metadata, Viewport } from "next";
import { Anton, Instrument_Sans } from "next/font/google";
import "./globals.css";
import { themeScript } from "@/components/ThemeToggle";
import { RegisterWorker } from "@/components/RegisterWorker";

/*
 * Three faces, each with a job.
 *
 * Archivo is a grotesque with tight, confident display weights — headings, and
 * the numbers that are the point of the page. Public Sans was drawn for interfaces
 * and carries the dense stuff at 13px without shouting. Plex Mono is kept for
 * genuinely machine text: keys, snippets, somebody else's column headings.
 *
 * Deliberately not the framework default: this is sold to tattooists, stylists
 * and sparkies, and it wants to look like a tool made for them rather than
 * another piece of startup software.
 */
/*
 * Archivo, put back after a day of something else.
 *
 * Bricolage Grotesque went in on the argument that one neutral face doing
 * every job was the largest reason the product read as machine-made. Giles
 * looked at it and preferred this one, which settles it: the face somebody
 * stares at for eight hours is theirs to choose, and an argument that loses
 * to "I don't like it" was never much of an argument.
 *
 * The finding is worth keeping even though the change is not. The sameness he
 * is pointing at is real and it is not the typeface — it is that every row,
 * every card and every badge share one rhythm, so a screen of fifteen
 * enquiries reads as one repeated shape rather than fifteen different jobs.
 */
/*
 * Two faces, from DESIGN.md §3.
 *
 * Anton is the display face: headlines, page titles, day labels, buttons. It
 * only comes in one weight, which is the point — it is a poster face and it is
 * used like one, uppercase and stacked.
 *
 * Instrument Sans carries everything else, down to the 13px rows the product
 * is mostly made of.
 *
 * The mono face is gone. It existed so money, times and phone numbers lined up
 * in a column; Instrument Sans has tabular figures and `.num` now asks for them
 * with font-variant-numeric, which lines up the same and is one fewer font to
 * fetch. Checked with Giles before dropping it.
 *
 * The fourth face, Inter, was only ever the wordmark, which is now Anton.
 */
const display = Anton({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["400"],
  display: "swap",
});

const body = Instrument_Sans({
  variable: "--font-body",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Second Pair",
  description: "You work, we answer. An assistant that handles enquiries while your hands are full.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Second Pair", statusBarStyle: "black-translucent" },
  /*
   * No icons declared here, deliberately.
   *
   * They are files instead — app/icon.png for the tab, app/apple-icon.png for
   * a home screen — which Next finds on its own and serves with its own cache
   * key. Naming any of them in this block turns the whole convention off
   * rather than adding to it: an earlier version listed only the Apple one
   * here, and the tab icon silently stopped being declared at all despite the
   * file being served perfectly well.
   *
   * That override is also what hid the original fault. The page carried two
   * <link rel="icon"> tags pointing at the same path, Next's own file quietly
   * won, and that file was still the starter icon a new Next project ships
   * with — a black circle and a white triangle. The site went through an
   * entire rebrand with somebody else's logo in the tab.
   *
   * The mark sits on brand cream rather than transparent: a transparent
   * favicon loses the navy bubble against the dark chrome most browsers wear.
   */
  openGraph: {
    title: "Second Pair",
    description: "You work, we answer.",
    images: ["/brand/png/social-card-default.png"],
  },
};

/*
 * Installable, and behaving like an app once installed.
 *
 * Most of these owners will keep this on a home screen and open it between
 * jobs, so it wants no browser chrome. viewportFit: "cover" lets the layout
 * reach under the notch, which is why the nav uses safe-area insets.
 *
 * userScalable stays on: pinch-zoom is an accessibility feature, and turning
 * it off to look more app-like is not worth locking someone out of their own
 * diary.
 */
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  /*
   * The keyboard takes room away from the page instead of sitting on top of it.
   *
   * Without this a phone keyboard overlays the viewport and changes nothing
   * about it: dvh still reports the whole screen, so a sheet sized to 82dvh
   * puts its bottom third — the part with the times and the Save button in
   * it — underneath the keyboard, and there is no way to scroll to it, because
   * as far as the layout is concerned nothing is out of view.
   *
   * That is most of "the box is cut off and won't scroll", and it is worst on
   * exactly the form that needs typing: adding something to the diary.
   * Resizing the content shrinks the sheet to the room actually left, and its
   * own scroll does the rest.
   */
  interactiveWidget: "resizes-content",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#efeee9" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0f1a" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The theme script below stamps data-theme before hydration, on purpose.
      // Without this React reports the attribute it did not render as a
      // mismatch on every single page load.
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} h-full antialiased`}
    >
      <head>
        {/* Applies a stored theme before paint, so the page never flashes the
            wrong one on load. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        <RegisterWorker />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
