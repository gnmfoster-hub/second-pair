import { headers } from "next/headers";
import Link from "next/link";
import { requireStudio, getArtists } from "@/lib/studio";
import { verticalPack } from "@/lib/verticals";
import { Avatar } from "@/components/Avatar";
import { Snippet } from "./Snippet";
import { TextNumber } from "./TextNumber";
import { smsNumberFor } from "@/lib/messaging/connections";
import { smsConfigured } from "@/lib/messaging/sms";
import { createClient } from "@/lib/supabase/server";

/**
 * Channels — every way the outside world can reach this business.
 *
 * Grouped by *who owns it*, because that is the decision a business actually
 * makes. A one-person trade sees one section and never thinks about it. A
 * salon sees the shop's accounts and then a section per stylist, and can run
 * both at once: the shop Instagram asks who you want, Sarah's own does not.
 *
 * Nothing here pretends. A channel that needs the Meta review says so, and
 * says whose job it is, rather than offering a button that does nothing.
 */

type ChannelKey = "web" | "whatsapp" | "instagram" | "messenger" | "sms";

const CHANNELS: {
  key: ChannelKey;
  label: string;
  note: string;
}[] = [
  { key: "whatsapp", label: "WhatsApp", note: "Needs a number that isn't on the WhatsApp app" },
  { key: "instagram", label: "Instagram DMs", note: "Needs a Professional account linked to a Facebook Page" },
  { key: "messenger", label: "Messenger", note: "Comes with the Facebook Page" },
  { key: "sms", label: "Text messages", note: "Needs a number of its own" },
];


export default async function ChannelsPage() {
  const { studio } = await requireStudio();
  const artists = (await getArtists(studio.id)).filter((a) => a.active);
  const words = {
    ...verticalPack(studio.vertical).vocabulary,
    ...(studio.vocabulary ?? {}),
  };

  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  const origin = `${proto}://${host}`;

  const shopLink = `${origin}/widget/${studio.slug}`;
  const embed = `<script src="${origin}/widget.js" data-studio="${studio.slug}"></script>`;

  const solo = artists.length <= 1;

  const smsNumber = await smsNumberFor(await createClient(), studio.id);

  return (
    <div className="space-y-9">
      <section>
        <p className="hint max-w-prose">
          Every channel belongs either to{" "}
          <strong className="text-foreground">the whole {words.business}</strong> or to{" "}
          <strong className="text-foreground">one person</strong>. That one choice decides
          how the assistant behaves: on a shared account it asks who they&rsquo;d like, and
          on somebody&rsquo;s own account it already knows and never asks.
          {!solo && " You can run both at once."}
        </p>
      </section>

      {/* --------------------------------------------------- text messages */}
      <section>
        <TextNumber
          number={smsNumber}
          sendingReady={smsConfigured()}
          webhookUrl={`${origin}/api/sms/webhook`}
        />
      </section>

      {/* ------------------------------------------------------ the business */}
      <section>
        <div className="flex items-center gap-2.5">
          <span className="grid size-8 shrink-0 place-items-center rounded-full bg-surface-2 text-xs font-semibold text-muted">
            {studio.name.slice(0, 2).toUpperCase()}
          </span>
          <div>
            <div className="section-title">{studio.name}</div>
            <div className="hint">
              {solo
                ? "Everything comes to you"
                : `Shared — the assistant asks which ${words.practitioner} they want`}
            </div>
          </div>
        </div>

        <div className="card mt-4 divide-y divide-border">
          <div className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="text-sm font-medium">Website and link</div>
              <span className="pill bg-ok/10 text-ok">Live</span>
            </div>
            <p className="hint mt-1">
              On your site, or shared on its own. No setup, no approval.
            </p>
            <div className="mt-3 space-y-2.5">
              <Snippet value={shopLink} label="Your link" />
              <Snippet value={embed} label="For your website" />
            </div>
          </div>

          {CHANNELS.map((channel) => (
            <ChannelRow key={channel.key} label={channel.label} note={channel.note} />
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------- each person */}
      {!solo &&
        artists.map((person) => (
          <section key={person.id}>
            <div className="flex items-center gap-2.5">
              <Avatar person={person} size="sm" />
              <div>
                <div className="section-title">{person.name}</div>
                <div className="hint">
                  Their own — the assistant knows it&rsquo;s for {person.name.split(" ")[0]}{" "}
                  and never asks
                </div>
              </div>
            </div>

            <div className="card mt-4 divide-y divide-border">
              <div className="p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-sm font-medium">Their own link</div>
                  <span className="pill bg-ok/10 text-ok">Live</span>
                </div>
                <p className="hint mt-1">
                  For {person.name.split(" ")[0]}&rsquo;s own Instagram bio or Facebook page.
                </p>
                <div className="mt-3">
                  <Snippet value={`${shopLink}?with=${person.handle ?? ""}`} />
                </div>
              </div>

              {CHANNELS.map((channel) => (
                <ChannelRow
                  key={channel.key}
                  label={channel.label}
                  note={`${person.name.split(" ")[0]}'s own`}
                />
              ))}
            </div>
          </section>
        ))}

      {solo && artists.length === 1 && (
        <p className="hint">
          Add another {words.practitioner} in{" "}
          <Link href="/settings/artists" className="underline underline-offset-2">
            settings
          </Link>{" "}
          and they get their own link and their own accounts here, separate from yours.
        </p>
      )}

      <section>
        <div className="section-title">Where the website code goes</div>
        <div className="card mt-3 overflow-hidden">
          <table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {[
                ["Squarespace", "Settings → Advanced → Code Injection → Footer"],
                ["Wix", "Settings → Custom Code → Add Code → Body end"],
                ["WordPress", "Appearance → Theme File Editor → footer.php, before </body>"],
                ["Shopify", "Online Store → Themes → Edit code → theme.liquid, before </body>"],
                ["Anything else", "Paste it just before the closing </body> tag"],
              ].map(([what, how]) => (
                <tr key={what}>
                  <th scope="row" className="w-36 px-4 py-2.5 text-left align-top font-medium">
                    {what}
                  </th>
                  <td className="px-4 py-2.5 text-muted">{how}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="hint mt-3 max-w-prose">
          The button uses your accent colour. Add{" "}
          <code className="font-mono">data-accent=&quot;#1d4ed8&quot;</code> with any hex code
          to change it.
        </p>
      </section>
    </div>
  );
}

/**
 * A messaging channel that is not connectable yet.
 *
 * Deliberately not a button. The Meta app review is a job for Second Pair, not for
 * the business, and offering a dead "Connect" would be a lie that generates a
 * support message.
 */
function ChannelRow({ label, note }: { label: string; note: string }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 p-4">
      <div className="min-w-0">
        <div className="text-sm font-medium">{label}</div>
        <p className="hint mt-0.5">{note}</p>
      </div>
      <span className="pill shrink-0 bg-surface-2 text-muted">Coming shortly</span>
    </div>
  );
}
