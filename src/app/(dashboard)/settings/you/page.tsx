import { requireStudio, getArtists, getServiceOptions } from "@/lib/studio";
import { canConnectStripe } from "@/lib/env";
import { verticalPack } from "@/lib/verticals";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/origin";
import { smsNumberFor } from "@/lib/messaging/connections";
import { smsConfigured } from "@/lib/messaging/sms";
import { readableNumber } from "@/lib/channels/phoneNumbers";
import { Notifications } from "@/components/Notifications";
import { OnYourPhone } from "@/components/OnYourPhone";
import { ArtistEditor } from "../artists/ArtistEditor";
import { CalendarLinks } from "../data/CalendarLinks";
import { PersonalCalendar } from "./PersonalCalendar";
import { YourPrices } from "./YourPrices";
import { MyBookings } from "./MyBookings";
import { MyStripe } from "./MyStripe";
import { MyServices } from "./MyServices";
import { MyTravel } from "./MyTravel";
import { MyReminders } from "./MyReminders";
import { Managed } from "./Managed";
import type { ReminderTemplateRow } from "../reminders/ReminderEditor";
import { byPerson } from "@/lib/servicePrices";
import type { Service, ServicePerson } from "@/lib/types";

export const metadata = { title: "You — Second Pair" };

/**
 * The things that belong to whoever is signed in.
 *
 * Settings had eight tabs and six of them were the owner's. What was left was
 * a list of everybody in the business and a page about exporting data — so a
 * stylist signing in for the first time had nowhere that was hers, and the few
 * things that genuinely were hers were scattered across pages named after
 * other subjects.
 *
 * Two of them were not reachable at all. The notifications button and the
 * add-to-your-phone panel live on the assistant page, which calls
 * requireOwner — so every member of staff who was told to "press the
 * notifications button on your own phone" could not have done it if they
 * tried. That is why the readiness check has never found a single subscribed
 * device: only one person in each business could ever have subscribed one.
 *
 * Nothing here is new. It is the same components, on a page the person they
 * belong to can open.
 */
export default async function YouPage({
  searchParams,
}: {
  /** How it went, when they have just come back from Stripe. */
  searchParams: Promise<{ stripe?: string }>;
}) {
  const { studio, userId } = await requireStudio();
  const { stripe } = await searchParams;

  const [artists, options, origin] = await Promise.all([
    getArtists(studio.id),
    getServiceOptions(studio.id),
    siteOrigin(),
  ]);

  const me = artists.find((a) => a.user_id === userId) ?? null;

  const supabase = await createClient();

  /*
   * Who a reminder arrives from. The same answer as the business's own page,
   * because it is the same number — one line of the business, not one per
   * person, and saying so here is what stops somebody assuming otherwise.
   */
  const smsNumber = await smsNumberFor(supabase, studio.id);
  const sender = {
    number: smsNumber ? readableNumber(smsNumber) : null,
    business: studio.name,
    ready: smsConfigured(),
  };

  const { data: ownerRow } = await supabase
    .from("studio_members")
    .select("user_id")
    .eq("studio_id", studio.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  const owns = ownerRow?.user_id != null && ownerRow.user_id === userId;

  /*
   * The price list, and what this person charges against it.
   *
   * Only for a business that prices by a named thing. A tattooist prices by
   * the size of the piece and the hours it sits, and their rate is already on
   * the editor below — showing them an empty salon price list would be one
   * more screen to work out they can ignore.
   *
   * Read after `me`, because with nobody signed in as a person there is
   * nothing to price and no reason to ask.
   */
  const pricesByList = studio.pricing_model === "services" && me != null;

  const [{ data: serviceRows }, { data: mineRows }] = pricesByList
    ? await Promise.all([
        supabase
          .from("services")
          .select("*")
          .eq("studio_id", studio.id)
          .eq("active", true)
          .order("sort_order"),
        supabase.from("service_people").select("*").eq("artist_id", me.id),
      ])
    : [{ data: null }, { data: null }];

  const all = (serviceRows ?? []) as Service[];

  /*
   * Two different lists off one read.
   *
   * The shop's is what they price against — a row each, with the shop's number
   * beside their own. Their own is a list they add to and take from, and it
   * has no shop price to sit next to because there is no shop version of it.
   */
  const services = all.filter((s) => s.artist_id == null);
  const mineOnly = all.filter((s) => s.artist_id === me?.id);
  const myPrices = byPerson((mineRows ?? []) as ServicePerson[]);

  /*
   * Reminder templates, read whole and split here.
   *
   * select("*") rather than naming artist_id, so the page keeps working before
   * the migration that adds the column as well as after — PostgREST rejects an
   * entire query for one column it does not know.
   */
  const { data: templateRows } = await supabase
    .from("reminder_templates")
    .select("*")
    .eq("studio_id", studio.id)
    .order("sort_order");

  const templates = (templateRows ?? []) as (ReminderTemplateRow & {
    artist_id?: string | null;
  })[];
  const shopReminders = templates.filter((t) => t.artist_id == null);
  const myReminders = me ? templates.filter((t) => t.artist_id === me.id) : [];

  /*
   * Whether this person sets their own settings, or the business does.
   *
   * An employee has a diary and a wage, and everything a customer sees is the
   * shop's. A chair renter is a business inside a business. Read once here so
   * the page cannot half-apply it and leave one panel editable.
   */
  const managed = me?.owner_managed === true;

  const pack = verticalPack(studio.vertical);
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };
  const styles = options.filter((o) => o.kind === "style");

  return (
    <div className="space-y-3">
      {/*
       * The phone first, because it is the only thing here that is broken
       * rather than merely misfiled, and because everything it unlocks —
       * notifications, the badge, the shortcuts — is invisible until it is
       * done.
       */}
      <OnYourPhone />
      <Notifications />

      {/*
       * What this person is told about, which is theirs and nobody else's.
       *
       * Only for somebody who is actually in the diary: a receptionist has no
       * appointments of their own to be told about.
       */}
      {me && <MyBookings artist={me} />}

      {/*
        * Where their own money lands, on a business that pays people directly.
        *
        * Only that person can connect it — Stripe asks for a passport and a
        * bank account — so it has to live on their own page, and there was
        * nowhere for it before: every connection the product could make was
        * the business's, which on the per-person model meant nobody's payments
        * could be taken at all.
        */}
      {me && (
        <MyStripe
          connected={Boolean(me.stripe_account_id)}
          perPerson={studio.payment_model === "people"}
          firstName={me.name.split(" ")[0]}
          outcome={stripe}
          /* Whether connecting is switched on at our end at all. */
          possible={canConnectStripe()}
        />
      )}

      {/*
       * Their own diary elsewhere.
       *
       * The same control as on the data page, with the business's whole-diary
       * feed left out: that one is everybody's work and belongs to whoever
       * owns the place.
       */}
      <CalendarLinks
        origin={origin}
        business={null}
        mine={me ? { id: me.id, name: me.name, token: me.calendar_token } : null}
        owns={owns}
      />

      {me ? (
        <>
          {/*
           * How long they need to get between jobs, where the business travels
           * at all. On a salon's settings this would be a box about driving
           * nobody does.
           */}
          {!managed && studio.travel_mode !== "at_premises" && (
            <MyTravel
              mine={me.travel_buffer_minutes ?? null}
              business={studio.travel_buffer_minutes}
              firstName={me.name.split(" ")[0]}
            />
          )}

          {/* Whose reminders their clients get. The business's, when managed. */}
          {!managed && <MyReminders
            on={me.reminders_own === true}
            mine={myReminders}
            businessCount={shopReminders.length}
            firstName={me.name.split(" ")[0]}
            sender={sender}
          />}

          {/* Their life, coming in — the other direction from the feed above,
              and the one that stops the assistant booking over the school
              run. */}
          <PersonalCalendar
            artist={me}
            /*
             * Formatted here, in the studio's own zone.
             *
             * The panel is a client component, and a date turned into words in
             * the browser is a date the server rendered differently — which
             * React reports as a hydration error and the reader sees as the
             * page flickering.
             */
            lastRead={
              me.personal_calendar_read_at
                ? new Intl.DateTimeFormat("en-GB", {
                    timeZone: studio.timezone,
                    weekday: "short",
                    hour: "numeric",
                    minute: "2-digit",
                  }).format(new Date(me.personal_calendar_read_at))
                : null
            }
          />

          {managed ? (
            /*
             * What the business looks after, said rather than left blank.
             *
             * An employee opening a nearly empty page would reasonably think
             * the product was broken or that they were in the wrong account.
             */
            <Managed words={{ business: words.business }} />
          ) : (
            <>
              <div className="card p-5">
                <div className="section-title">Your hours and rates</div>
                <p className="hint mt-1.5 max-w-prose">
                  What the assistant quotes and books on your behalf. Keep it right and it
                  answers for you correctly; leave it wrong and it answers for you
                  incorrectly, which is worse than not answering at all. Nobody else can
                  change this.
                </p>
              </div>

              <ArtistEditor
                artist={me}
                styles={styles}
                studioHours={studio.hours}
                noun={words.practitioner}
                roles={pack.roles}
                isOwner={owns}
                ownLink={
                  me.handle ? `${origin}/widget/${studio.slug}?with=${me.handle}` : null
                }
              />
            </>
          )}

          {/* Work and products that are theirs rather than the shop's. */}
          {!managed && pricesByList && <MyServices services={mineOnly} firstName={me.name.split(" ")[0]} />}

          {/* Their prices against the list, where the business keeps one. */}
          {!managed && pricesByList && (
            <YourPrices
              services={services}
              mine={myPrices}
              firstName={me.name.split(" ")[0]}
            />
          )}
        </>
      ) : (
        /*
         * Signed in, but not one of the people in the diary.
         *
         * A real state rather than an error: a manager or a receptionist can
         * have a login without taking bookings. Saying so is better than an
         * empty page, which reads as something having gone wrong.
         */
        <div className="card p-5">
          <div className="section-title">You are not in the diary</div>
          <p className="hint mt-1.5 max-w-prose">
            Your sign-in is not linked to one of the {words.practitioners}, so there are no
            hours or rates to keep here. Everything above still works &mdash; this device
            can be notified and the app can go on your home screen. If you should have a
            column in the diary, whoever owns the business can add you.
          </p>
        </div>
      )}
    </div>
  );
}
