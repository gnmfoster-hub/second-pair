import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Second Pair",
  description: "You work, we answer.",
  manifest: "/brand/code/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/brand/png/app-icon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/brand/png/app-icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/brand/png/app-icon-180.png", sizes: "180x180", type: "image/png" }],
  },
  openGraph: {
    title: "Second Pair",
    description: "You work, we answer.",
    images: [{ url: "/brand/png/social-card-default.png", width: 1200, height: 630 }],
  },
};
