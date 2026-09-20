import { headers } from "next/headers";
import Link from "next/link";
import { getArtists , requireOwner } from "@/lib/studio";
import { verticalPack } from "@/lib/verticals";
import { Avatar } from "@/components/Avatar";
import { Snippet } from "./Snippet";
import { TextNumber } from "./TextNumber";
import { smsNumberFor } from "@/lib/messaging/connections";
import { savedWords } from "@/lib/savedAt";
import { smsConfigured } from "@/lib/messaging/sms";
import { createClient } from "@/lib/supabase/server";
import { Appearance } from "./Appearance";
import { MetaChannels } from "./MetaChannels";
import { WhoseChannel } from "./WhoseChannel";
import { YourNumbers } from "./YourNumbers";
import { NotOnYourPlan } from "./NotOnYourPlan";
import type { Channel } from "@/lib/types";
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


export default async function ChannelsPage({
  searchParams,
}: {
  /** Carries ?meta=… when Facebook has just sent somebody back. */
  searchParams: Promise<{ meta?: string }>;
}) {
  const { meta } = await searchParams;
  // How customers reach the business — the owner's, and the page says so
  // rather than only the tab: hiding a link is not a permission.
  const { studio } = await requireOwner();
  /*
   * Everybody, and separately everybody still working here.
   *
   * The page needs both and had only one. Who a line belongs to is a fact
   * about the line, and somebody who has left is still the answer to it, so a
   * list of active people cannot say who has what: the select found no option
   * matching her id, fell back to its first, and a number that was Aisha's read
   * as the business's. Pressing Save on that screen would then have made it
   * true.
   *
   * Who a line may be given to is the other question, and active is right for
   * that one. The control works it out itself from the flags, which is why it
   * wants everybody.
   */
  const everyone = await getArtists(studio.id);
  const artists = everyone.filter((a) => a.active);
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

  /*
   * What they have linked at Meta.
   *
   * Read through their own session rather than the service key: a connection
   * belongs to a business, and nothing here should be able to show one that
   * does not.
   */
  const supabaseForMeta = await createClient();
  const { data: metaLinks } = await supabaseForMeta
    .from("channel_connections")
    .select("id, channel, label")
    .eq("studio_id", studio.id)
    .in("channel", ["messenger", "instagram"])
    .eq("active", true)
    .order("channel");

  /*
   * Every live connection, with who it belongs to.
   *
   * Read in one go rather than per panel: the same control appears under each
   * channel, and it needs to know how many this business has on that channel
   * to decide whether the last one may be given away.
   */
  const { data: allLinks } = await supabaseForMeta
    .from("channel_connections")
    .select("id, channel, artist_id, label, external_id")
    .eq("studio_id", studio.id)
    .eq("active", true);

  const onChannel = (channel: string) => (allLinks ?? []).filter((l) => l.channel === channel);

  /*
   * What this business is signed up for.
   *
   * Enforced everywhere already — the engine refuses a message on a channel a
   * business has not bought, and the voice webhook ends the call politely —
   * and said nowhere. So the page offered the connect button for everything,
   * and an owner could wire up an Instagram they had not paid for, see it say
   * Connected, and watch every message arriving on it go nowhere with no error
   * and nothing on any screen to explain it.
   *
   * Web when nothing is set, which is what every business started with.
   */
  const sold = (studio.channels_allowed ?? ["web"]) as Channel[];
  const has = (channel: Channel) => sold.includes(channel);

  const supabaseForNumbers = await createClient();
  const smsNumber = await smsNumberFor(supabaseForNumbers, studio.id);

  // Where a call to that number rings before it becomes a text, and when that
  // was last decided.
  /*
   * The business's own line. See the save action beside this — the same
   * single-row assumption, which throws outright the moment a business has two
   * numbers, and giving one to a person is exactly how that happens.
   */
  const { data: line } = await supabaseForNumbers
    .from("channel_connections")
    .select("forward_to, updated_at")
    .eq("studio_id", studio.id)
    .eq("channel", "sms")
    .is("artist_id", null)
    .order("created_at")
    .limit(1)
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
        {!has("sms") ? (
          <NotOnYourPlan channel="sms" business={words.business} />
        ) : (
        <>
        <TextNumber
          number={smsNumber}
          forwardTo={line?.forward_to ?? null}
          /* Absent until the migration; absent reads as off, which it is. */
          voicemail={(studio as unknown as { voicemail?: boolean | null }).voicemail === true}
          /*
           * The telephone is bought separately from the number it arrives on,
           * and everything on that form is a call setting. Without this the
           * answerphone tick box showed for a business that had the telephone
           * switched off in the back office.
           */
          voice={has("voice")}
          /*
           * Worked out here, in the business's own zone, because a date turned
           * into words in the browser is a date the server rendered
           * differently — which React reports as a hydration error and the
           * reader sees as the page flickering.
           */
          savedAt={savedWords(line?.updated_at, studio.timezone)}
          sendingReady={smsConfigured()}
        />

        {/*
          * Every number they have, not the one the panel above discusses.
          *
          * A business is supplied as many as its subscription carries, and the
          * panel above holds one. A salon with three had a screen that talked
          * about one of them and never said the other two existed — and no
          * answer anywhere to "how do I get one for the new girl".
          */}
        <YourNumbers
          business={words.business}
          lines={onChannel("sms").map((l) => ({
            id: l.id,
            externalId: (l as { external_id?: string | null }).external_id ?? null,
            forWho: everyone.find((a) => a.id === l.artist_id)?.name ?? null,
          }))}
        />

        {/*
          * Whose line it is, under the line itself.
          *
          * The same control appears under every channel that is connected. A
          * number, an Instagram account and a Facebook page are all a way for
          * one person to be reached, and the difference it makes is the same
          * in each case: on a shared one the assistant asks who they would
          * like, on somebody's own it never asks.
          */}
        {onChannel("sms").map((link) => (
          <WhoseChannel
            key={link.id}
            connectionId={link.id}
            artistId={link.artist_id ?? null}
            people={everyone.map((a) => ({ id: a.id, name: a.name, active: a.active }))}
            howMany={onChannel("sms").length}
            noun="text"
          />
        ))}
        </>
        )}
      </section>

      {/* ---------------------------------------------------------- email */}
      <section>
        {!has("email") ? (
          <NotOnYourPlan channel="email" business={words.business} />
        ) : (
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
            address until it says otherwise here. The domain has no mail server behind
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
              person it should not write to on its own, you, your own staff, or a
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
        )}
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
                : `Shared, so the assistant asks which ${words.practitioner} they want`}
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

          {CHANNELS.filter((c) => c.key !== "instagram" && c.key !== "messenger").map(
            (channel) => (
              <ChannelRow key={channel.key} label={channel.label} note={channel.note} />
            ),
          )}
        </div>
      </section>

      {/* --------------------------------------------- facebook and instagram */}
      <section>
        {!has("instagram") && !has("messenger") ? (
          <NotOnYourPlan channel="instagram" business={words.business} />
        ) : (
        <>
        <MetaChannels connections={metaLinks ?? []} outcome={meta} isOwner />

        {(metaLinks ?? []).map((link) => (
          <WhoseChannel
            key={link.id}
            connectionId={link.id}
            artistId={
              ((allLinks ?? []).find((l) => l.id === link.id)?.artist_id as string | null) ?? null
            }
            people={everyone.map((a) => ({ id: a.id, name: a.name, active: a.active }))}
            howMany={onChannel(link.channel).length}
            noun="message"
          />
        ))}
        </>
        )}
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
                  Their own, so the assistant knows it&rsquo;s for {person.name.split(" ")[0]}{" "}
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
      {/* Who it books comes before how it looks, because one decides whether the
          answer is right, the other decides whether it matches their sign. */}
      <WhoItOffers
        /*
         * Only people the assistant may book at all.
         *
         * Somebody switched off on their own record is not a website question
         * any more — offering them here would be a tick that does nothing.
         */
        people={artists.filter((a) => a.assistant_books !== false)}
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
