import { requireStudio, getArtists, getServiceOptions } from "@/lib/studio";
import { verticalPack } from "@/lib/verticals";
import { ArtistEditor } from "./ArtistEditor";
import { InviteButton } from "./InviteButton";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/origin";

export default async function ArtistsPage() {
  const { studio } = await requireStudio();
  const [artists, options] = await Promise.all([
    getArtists(studio.id),
    getServiceOptions(studio.id),
  ]);
  const styles = options.filter((o) => o.kind === "style");

  // Any invites already sent and not yet used, so a link is shown rather than
  // offered again.
  const supabase = await createClient();
  const { data: invites } = await supabase
    .from("team_invites")
    .select("artist_id, token")
    .eq("studio_id", studio.id)
    .is("accepted_at", null);

  const pending = new Map((invites ?? []).map((i) => [i.artist_id, i.token]));

  const origin = await siteOrigin();
  const pack = verticalPack(studio.vertical);
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };

  /*
   * Who owns this business.
   *
   * Every person here can be invited to sign in, and one of them set the place
   * up — that person can change the business itself, the prices and the
   * channels, and everybody else cannot. Nothing said so, which matters most
   * to the person deciding who to invite: without it, adding somebody looks
   * like handing over the keys.
   */
  const { data: ownerRow } = await supabase
    .from("studio_members")
    .select("user_id")
    .eq("studio_id", studio.id)
    .eq("role", "owner")
    .limit(1)
    .maybeSingle();

  const ownerUserId = ownerRow?.user_id ?? null;

  return (
    <div className="space-y-3">
      <div className="card p-5">
        <div className="section-title">Who is who</div>
        <p className="hint mt-1.5 max-w-prose">
          {(() => {
            const owner = artists.find((a) => a.user_id && a.user_id === ownerUserId);
            const name = owner?.name ?? "Whoever set this business up";
            return (
              <>
                <strong className="text-foreground">{name}</strong> owns this business.
                Only they can change the business itself, the prices, and how customers
                reach you.
              </>
            );
          })()}
        </p>
        <p className="hint mt-2 max-w-prose">
          Anybody you send a link to sets their own password, then fills in their own
          hours, rates and days off. You do not have to do it for them, and they cannot
          change anybody else&rsquo;s.
        </p>
      </div>

      {artists.length === 0 && (
        <p className="hint">
          No {words.practitioners} yet. The assistant cannot quote anything until at least
          one has an hourly rate and a minimum charge.
        </p>
      )}

      {artists.map((artist) => (
        <div key={artist.id} className="space-y-2">
          <ArtistEditor
            artist={artist}
            styles={styles}
            studioHours={studio.hours}
            noun={words.practitioner}
            roles={pack.roles}
            isOwner={Boolean(artist.user_id) && artist.user_id === ownerUserId}
          />
          {/* Offered once somebody exists, never as a step in creating them —
              plenty of people here will never sign in at all. */}
          <div className="flex justify-end px-1">
            <InviteButton
              artistId={artist.id}
              name={artist.name}
              hasLogin={Boolean(artist.user_id)}
              pendingToken={pending.get(artist.id) ?? null}
              origin={origin}
            />
          </div>
        </div>
      ))}

      <ArtistEditor
        styles={styles}
        studioHours={studio.hours}
        noun={words.practitioner}
        roles={pack.roles}
      />
    </div>
  );
}
