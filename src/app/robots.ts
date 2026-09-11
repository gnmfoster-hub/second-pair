import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/origin";

/**
 * What a crawler may look at.
 *
 * There was no robots.txt, which is not the same as allowing everything: it
 * means nothing was ever pointed at a sitemap, and the parts of this site that
 * are somebody's private diary were left to whatever a crawler decided on its
 * own. Every one of those needs a session, so nothing was ever exposed — but
 * an indexed URL that answers "sign in" is still a business's dashboard listed
 * on Google under its own name.
 *
 * The widget is deliberately allowed. It is a business's own assistant on
 * their own page, and there is no harm in it being findable — the shareable
 * link is meant to be shared.
 */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const origin = await siteOrigin();

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          // Everything behind a session. Somebody's diary, inbox, clients and
          // settings, and the back office.
          "/diary",
          "/clients",
          "/conversations",
          "/settings",
          "/report",
          "/admin",
          "/help",
          // Doors rather than pages: a sign-in, a reset, an invitation.
          "/login",
          "/reset-password",
          "/onboarding",
          "/join",
          "/auth",
          // Payment outcomes, which are one person's and mean nothing to
          // anybody else.
          "/pay",
          // Machinery.
          "/api",
        ],
      },
    ],
    sitemap: `${origin}/sitemap.xml`,
    host: origin,
  };
}
