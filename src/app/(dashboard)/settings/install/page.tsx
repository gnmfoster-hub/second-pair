import { headers } from "next/headers";
import Link from "next/link";
import { getArtists , requireOwner } from "@/lib/studio";
import { verticalPack } from "@/lib/verticals";
import { Avatar } from "@/components/Avatar";
import { Snippet } from "./Snippet";
import { TextNumber } from "./TextNumber";
import { smsNumberFor } from "@/lib/messaging/connections";
import { smsConfigured } from "@/lib/messaging/sms";
import { createClient } from "@/lib/supabase/server";
import { Appearance } from "./Appearance";
import { WhoItOffers } from "./WhoItOffers";

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
  // How customers reach the business — the owner's, and the page says so
  // rather than only the tab: hiding a link is not a permission.
  const { studio } = await requireOwner();
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

  const supabaseForNumbers = await createClient();
  const smsNumber = await smsNumberFor(supabaseForNumbers, studio.id);

  // Where a call to that number rings before it becomes a text.
  const { data: line } = await supabaseForNumbers
    .from("channel_connections")
    .select("forward_to")
    .eq("studio_id", studio.id)
    .eq("channel", "sms")
    .maybeSingle();

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
          forwardTo={line?.forward_to ?? null}
          sendingReady={smsConfigured()}
          webhookUrl={`${origin}/api/sms/webhook`}
          voiceWebhookUrl={`${origin}/api/voice/webhook`}
        />
      </section>

      {/* ---------------------------------------------------------- email */}
      <section>
        <div className="card p-5">
          <div className="section-title">Email</div>
          <p className="hint mt-1 max-w-prose">
            Forward your enquiry address to the one below and the assistant answers what
            comes in. Nothing else changes: your mailbox stays yours, we never hold a key
            to it, and we only ever see what is sent here.
          </p>

          {/*
            * Not shown as though it works, because it does not yet.
            *
            * This was printed as a live address before the domain behind it
            * existed. Somebody set up forwarding to it, their mail provider
            * sent a verification code to prove they owned it, and the code
            * went to a domain with no mail server at all — so it bounced, and
            * there was nothing to go and fetch. An address on a screen is a
            * promise that something is listening at the other end.
            */}
          <p className="mt-4 rounded-lg bg-warn/10 px-3 py-2 text-xs leading-relaxed text-warn">
            <strong>Not switched on yet.</strong> Do not set up forwarding to this
            address until it says otherwise here — the domain has no mail server behind
            it, so anything sent to it bounces, including the code your provider sends
            to verify the forward.
          </p>

          <code className="mt-3 block overflow-x-auto rounded-lg border border-border bg-surface-2/60 px-3 py-2 font-mono text-[11px] opacity-60">
            {studio.slug}@in.second-pair.com
          </code>

          {/*
            * Said plainly, because it is the fear behind the question.
            *
            * Forwarding an enquiry address forwards the wholesaler and the
            * newsletters with it, and an owner is right to want to know what
            * happens to those before they turn any of this on.
            */}
          <div className="hint mt-4 space-y-1 border-t border-border pt-3">
            <p>
              <strong>It answers</strong> what reads as somebody getting in touch.
            </p>
            <p>
              <strong>It puts in your inbox, unanswered,</strong> anything from a real
              person it should not write to on its own &mdash; you, your own staff, or a
              message with nothing in it.
            </p>
            <p>
              <strong>It leaves alone entirely</strong> mailing lists, newsletters,
              automatic replies, bounces, out-of-office notices and anything from an
              address that does not take replies. Those never reach your inbox here and
              are never replied to.
            </p>
          </div>
        </div>
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
      </section>

      {/* Was a paragraph explaining which attribute to hand-edit into their own
          HTML. It is a setting now, because it always should have been. */}
      {/* Who it books comes before how it looks — one decides whether the
          answer is right, the other decides whether it matches their sign. */}
      <WhoItOffers
        people={artists}
        chosen={studio.offers_artists ?? null}
        noun={words.practitioner}
      />

      <Appearance
        accent={studio.widget_accent ?? null}
        text={studio.widget_text ?? null}
        enabled={studio.widget_enabled !== false}
        lineOpen={studio.widget_line_open ?? null}
        lineClosed={studio.widget_line_closed ?? null}
        shape={studio.widget_shape ?? "round"}
        size={studio.widget_size ?? "medium"}
        bubble={studio.widget_bubble ?? "light"}
        pulse={studio.widget_pulse ?? "once"}
        font={studio.widget_font ?? "system"}
        weight={studio.widget_weight ?? "medium"}
        surface={studio.widget_surface ?? "raised"}
        bubbleFill={studio.widget_bubble_fill ?? null}
        bubbleText={studio.widget_bubble_text ?? null}
        position={studio.widget_position ?? "right"}
        teaser={studio.widget_teaser ?? null}
      />
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
