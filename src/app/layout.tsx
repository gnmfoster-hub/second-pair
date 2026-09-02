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
  icons: {
    icon: [
      { url: "/brand/svg/favicon.svg", type: "image/svg+xml" },
      { url: "/brand/png/favicon-32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: [{ url: "/brand/png/app-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Second Pair",
    description: "You work, we answer.",
    images: ["/brand/png/og-image.png"],
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
