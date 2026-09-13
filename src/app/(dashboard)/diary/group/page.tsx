import Link from "next/link";
import { requireStudio, getArtists } from "@/lib/studio";
import { localParts } from "@/lib/booking/tz";
import { GroupForm } from "./GroupForm";

export const metadata = { title: "Book a group — Second Pair" };

/**
 * Several appointments, made as one arrangement.
 *
 * Its own page rather than another mode inside the diary dialog. This is the
 * most tedious typing in the product — five names, five times, five lengths —
 * and it is usually done on a phone with somebody waiting on the other end of
 * it. A dialog with five rows on a phone is a scroll trap with a form inside.
 */
export default async function GroupPage() {
  const { studio } = await requireStudio();
  const artists = (await getArtists(studio.id)).filter((a) => a.active);

  /*
   * Today in the business's own zone, not the server's.
   *
   * A group booked at eleven at night from a server an hour ahead would open
   * on tomorrow, which is exactly the sort of thing nobody notices until a
   * wedding party is in the diary on the wrong day.
   */
  const { year, month, day } = localParts(new Date(), studio.timezone);
  const today = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

  if (artists.length === 0) {
    return (
      <div className="card p-6">
        <h1 className="page-title">Book a group</h1>
        <p className="hint mt-2">
          There is nobody in the diary to book anybody in with. Add somebody first.
        </p>
        <Link href="/settings/artists" className="btn-ghost mt-4 inline-flex">
          Add somebody
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="page-title">Book a group</h1>
        <p className="hint mt-1 max-w-prose">
          A wedding party, a family in together, a house with four rooms to do. Each
          person gets their own appointment in their own diary &mdash; this ties them
          together so they can be found, moved and called off as one thing.
        </p>
      </div>

      <GroupForm artists={artists} today={today} />
    </div>
  );
}
