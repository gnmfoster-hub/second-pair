import { requireStudio, getArtists, getServiceOptions } from "@/lib/studio";
import { verticalPack } from "@/lib/verticals";
import { ArtistEditor } from "./ArtistEditor";
import { InviteButton } from "./InviteButton";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/origin";

export default async function ArtistsPage() {
  const { studio, userId } = await requireStudio();
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
  const owns = ownerUserId != null && ownerUserId === userId;

  /*
   * A worker sees themselves, and nobody else.
   *
   * The page listed everybody with an editable form for each, so a stylist
   * could fill in a colleague's rates and only then be told she may not. A
   * form you are offered and then refused is worse than one you were never
   * shown — and it also suggests those details are hers to change.
   */
  const editable = owns ? artists : artists.filter((a) => a.user_id === userId);

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
        {owns ? (
          <p className="hint mt-2 max-w-prose">
            Anybody you send a link to sets their own password, then fills in their own
            hours, rates and days off. You do not have to do it for them, and they cannot
            change anybody else&rsquo;s &mdash; including yours.
          </p>
        ) : (
          <p className="hint mt-2 max-w-prose">
            Below are your own hours, rates and days off. Keep them up to date and the
            assistant quotes and books you correctly. Nobody else can change them.
          </p>
        )}
      </div>

      {editable.length === 0 && (
        <p className="hint">
          No {words.practitioners} yet. The assistant cannot quote anything until at least
          one has an hourly rate and a minimum charge.
        </p>
      )}

      {editable.map((artist) => (
        <div key={artist.id} className="space-y-2">
          <ArtistEditor
            artist={artist}
            styles={styles}
            studioHours={studio.hours}
            noun={words.practitioner}
            roles={pack.roles}
            isOwner={Boolean(artist.user_id) && artist.user_id === ownerUserId}
            ownLink={
              artist.handle ? `${origin}/widget/${studio.slug}?with=${artist.handle}` : null
            }
          />
          {/* Offered once somebody exists, never as a step in creating them —
              plenty of people here will never sign in at all. Handing out a
              login is the owner's, which the action already enforces; showing
              it to anybody else only offers something that will be refused. */}
          <div className={`flex justify-end px-1 ${owns ? "" : "hidden"}`}>
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

      {/* Adding somebody to the business is the owner's, so the blank form at
          the bottom is too. */}
      {owns && (
        <ArtistEditor
          styles={styles}
          studioHours={studio.hours}
          noun={words.practitioner}
          roles={pack.roles}
        />
      )}
    </div>
  );
}
