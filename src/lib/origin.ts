import { headers } from "next/headers";

/**
 * Where this application is being served from.
 *
 * Taken from the request rather than an environment variable, so a link built
 * on a preview deployment points at that preview and a link built on the live
 * site points at the live site. Getting this wrong sends somebody an
 * invitation to a URL that no longer exists.
 */
export async function siteOrigin(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}
