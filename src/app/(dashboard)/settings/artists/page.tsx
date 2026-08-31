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

  return (
    <div className="space-y-3">
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

      <ArtistEditor styles={styles} studioHours={studio.hours} noun={words.practitioner} />
    </div>
  );
}
