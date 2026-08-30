import { requireStudio, getArtists, getServiceOptions } from "@/lib/studio";
import { verticalPack } from "@/lib/verticals";
import { ArtistEditor } from "./ArtistEditor";

export default async function ArtistsPage() {
  const { studio } = await requireStudio();
  const [artists, options] = await Promise.all([
    getArtists(studio.id),
    getServiceOptions(studio.id),
  ]);
  const styles = options.filter((o) => o.kind === "style");
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
        <ArtistEditor key={artist.id} artist={artist} styles={styles} noun={words.practitioner} />
      ))}

      <ArtistEditor styles={styles} noun={words.practitioner} />
    </div>
  );
}
