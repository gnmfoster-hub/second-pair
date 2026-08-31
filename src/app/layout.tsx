import type { Metadata } from "next";
import { Archivo, Public_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { themeScript } from "@/components/ThemeToggle";

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

const mono = IBM_Plex_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  title: "Handled",
  description: "The receptionist you haven't got, for the hours you can't answer.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      // The theme script below stamps data-theme before hydration, on purpose.
      // Without this React reports the attribute it did not render as a
      // mismatch on every single page load.
      suppressHydrationWarning
      className={`${display.variable} ${body.variable} ${mono.variable} h-full antialiased`}
    >
      <head>
        {/* Applies a stored theme before paint, so the page never flashes the
            wrong one on load. */}
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
