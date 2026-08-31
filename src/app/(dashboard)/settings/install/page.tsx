import { headers } from "next/headers";
import Link from "next/link";
import { requireStudio } from "@/lib/studio";
import { Snippet } from "./Snippet";

/**
 * Getting the assistant in front of people.
 *
 * Two routes, because half of this market has a website and half has an
 * Instagram page and a van. The link matters as much as the embed code.
 */
export default async function InstallPage() {
  const { studio } = await requireStudio();

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const embed = `<script src="${origin}/widget.js" data-studio="${studio.slug}"></script>`;
  const link = `${origin}/widget/${studio.slug}`;

  const wheres = [
    {
      what: "Squarespace",
      how: "Settings → Advanced → Code Injection → Footer",
    },
    { what: "Wix", how: "Settings → Custom Code → Add Code → Body end" },
    { what: "WordPress", how: "Appearance → Theme File Editor → footer.php, before </body>" },
    { what: "Shopify", how: "Online Store → Themes → Edit code → theme.liquid, before </body>" },
    { what: "Anything else", how: "Paste it just before the closing </body> tag" },
  ];

  return (
    <div className="space-y-8">
      <section>
        <div className="section-title">On your website</div>
        <p className="hint mt-1 max-w-prose">
          One line, pasted once. A chat button appears in the bottom corner of every page.
          It sits in its own frame, so it cannot break your site&rsquo;s design and your
          design cannot break it.
        </p>

        <div className="mt-4">
          <Snippet value={embed} label="Paste this into your site" />
        </div>

        <div className="card mt-4 overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {wheres.map((w) => (
                <tr key={w.what}>
                  <th
                    scope="row"
                    className="w-36 px-4 py-2.5 text-left font-medium align-top"
                  >
                    {w.what}
                  </th>
                  <td className="px-4 py-2.5 text-muted">{w.how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section>
        <div className="section-title">Or just share the link</div>
        <p className="hint mt-1 max-w-prose">
          No website needed. Put this in your Instagram bio, your Facebook page button, or
          the auto-reply on your business WhatsApp. It opens the same assistant, and the
          enquiries land in the same inbox.
        </p>

        <div className="mt-4">
          <Snippet value={link} label="Your chat link" />
        </div>

        <Link href={link} target="_blank" className="btn-ghost mt-4">
          Open it and try it
        </Link>
      </section>

      <section>
        <div className="section-title">Matching your colours</div>
        <p className="hint mt-1 max-w-prose">
          The button uses your accent colour. Add <code className="font-mono">data-accent</code>{" "}
          with any hex code to change it.
        </p>
        <div className="mt-4">
          <Snippet
            value={`<script src="${origin}/widget.js" data-studio="${studio.slug}" data-accent="#1d4ed8"></script>`}
          />
        </div>
      </section>
    </div>
  );
}
