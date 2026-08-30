import { requireStudio, getArtists, getServiceOptions } from "@/lib/studio";
import { ArtistEditor } from "./ArtistEditor";

export default async function ArtistsPage() {
  const { studio } = await requireStudio();
  const [artists, options] = await Promise.all([
    getArtists(studio.id),
    getServiceOptions(studio.id),
  ]);
  const styles = options.filter((o) => o.kind === "style");

  return (
    <div className="space-y-3">
      {artists.length === 0 && (
        <p className="hint">
          No artists yet. The assistant cannot quote anything until at least one artist has
          an hourly rate and a minimum charge.
        </p>
      )}

      {artists.map((artist) => (
        <ArtistEditor key={artist.id} artist={artist} styles={styles} />
      ))}

      <ArtistEditor styles={styles} />
    </div>
  );
}
