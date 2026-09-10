import type { Metadata, Viewport } from "next";
import { Archivo, Public_Sans, IBM_Plex_Mono, Inter } from "next/font/google";
import "./globals.css";
import { themeScript } from "@/components/ThemeToggle";
import { RegisterWorker } from "@/components/RegisterWorker";

/*
 * Three faces, each with a job.
 *
 * Archivo is a grotesque with tight, confident display weights — headings, and
 * the numbers that are the point of the page. Public Sans was drawn for
 * interfaces and carries the dense stuff at 13px without shouting. Plex Mono
 * keeps money and times lined up in columns.
 *
 * Deliberately not the framework default: this is sold to tattooists, stylists
 * and sparkies, and it wants to look like a tool made for them rather than
 * another piece of startup software.
 */
const display = Archivo({
  variable: "--font-display",
  subsets: ["latin"],
  weight: ["500", "600", "700"],
});

const body = Public_Sans({
  variable: "--font-body",
  subsets: ["latin"],
});

/*
 * The wordmark, and only the wordmark.
 *
 * The brand pack sets "second pair" in Inter and ships it as outlines. Live
 * text is better here — selectable, scales with its surroundings, no image
 * request — so Inter is loaded for that one string. The interface keeps
 * Archivo and Public Sans.
 */
const wordmark = Inter({
  variable: "--font-wordmark",
  subsets: ["latin"],
  weight: ["400", "500"],
});

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
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
      className={`${display.variable} ${body.variable} ${mono.variable} ${wordmark.variable} h-full antialiased`}
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
