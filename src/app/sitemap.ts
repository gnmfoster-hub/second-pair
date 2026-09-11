import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/origin";

/**
 * The map a search engine reads.
 *
 * There was not one, so everything except the homepage was findable only by
 * crawling a link to it — which for the second product's page meant a single
 * line in a footer. That, rather than where it sits on the page, was the
 * ceiling on how visible Family APP! could be, and fixing it costs the page
 * that sells Second Pair nothing at all.
 *
 * Public pages only. Everything behind a session is somebody's diary and has
 * no business in an index; robots.ts refuses those separately, because a
 * sitemap that merely omits a page is not an instruction.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const origin = await siteOrigin();
  const now = new Date();

  return [
    {
      url: `${origin}/`,
      lastModified: now,
      changeFrequency: "weekly",
      // The product this domain is named after. Nothing else on the site
      // should outrank it.
      priority: 1,
    },
    {
      url: `${origin}/family-app`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.8,
    },
    {
      url: `${origin}/company`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.5,
    },
    {
      url: `${origin}/privacy`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
    {
      url: `${origin}/terms`,
      lastModified: now,
      changeFrequency: "monthly",
      priority: 0.3,
    },
  ];
}
