import { requireStudio, getArtists, getServiceOptions } from "@/lib/studio";
import { verticalPack } from "@/lib/verticals";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/origin";
import { Notifications } from "@/components/Notifications";
import { OnYourPhone } from "@/components/OnYourPhone";
import { ArtistEditor } from "../artists/ArtistEditor";
import { CalendarLinks } from "../data/CalendarLinks";

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
export default async function YouPage() {
  const { studio, userId } = await requireStudio();

  const [artists, options, origin] = await Promise.all([
    getArtists(studio.id),
    getServiceOptions(studio.id),
    siteOrigin(),
  ]);

  const me = artists.find((a) => a.user_id === userId) ?? null;

  const supabase = await createClient();
  const { data: ownerRow } = await supabase
    .from("studio_members")
    .select("user_id")
    .eq("studio_id", studio.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  const owns = ownerRow?.user_id != null && ownerRow.user_id === userId;

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
            ownLink={me.handle ? `${origin}/widget/${studio.slug}?with=${me.handle}` : null}
          />
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
