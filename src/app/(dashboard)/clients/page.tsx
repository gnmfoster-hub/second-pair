import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { formatPence } from "@/lib/money";
import { colourForName, initialsOf } from "@/lib/diaryColour";
import { CHANNEL_LABELS, type Channel } from "@/lib/types";
import { ChannelIcon } from "@/components/ChannelIcon";

type Row = {
  bookings:
    | {
        artist_id: string;
        deposit_amount_pence: number;
        deposit_status: string;
        cancelled_at: string | null;
      }[]
    | null;
  id: string;
  name: string | null;
  phone: string | null;
  email: string | null;
  instagram_handle: string | null;
  channel: Channel;
  alert: string | null;
  created_at: string;
  conversations: {
    id: string;
    last_message_at: string;
    /** Whose channel it arrived on, when the channel says. */
    artist_id: string | null;
    enquiries: {
      /** Who they asked for, if they did. */
      artist_id: string | null;
      /** What they asked about. Names the row when nobody gave a name. */
      description: string | null;
      quote_low_pence: number | null;
      bookings: {
        artist_id: string;
        deposit_amount_pence: number;
        deposit_status: string;
        cancelled_at: string | null;
      }[];
    } | null;
  }[];
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; who?: string }>;
}) {
  const { q, who } = await searchParams;
  const term = (q ?? "").trim();

  const { studio } = await requireStudio();
  const supabase = await createClient();

  let query = supabase
    .from("contacts")
    .select(
      "id, name, phone, email, instagram_handle, channel, alert, created_at, " +
        "bookings(artist_id, deposit_amount_pence, deposit_status, cancelled_at), " +
        "conversations(id, last_message_at, artist_id, enquiries(artist_id, description, quote_low_pence, bookings(artist_id, deposit_amount_pence, deposit_status, cancelled_at)))",
    )
    .eq("studio_id", studio.id)
    // Nameless strangers left behind by the owner testing their own
    // assistant are not clients.
    .eq("is_test", false)
    .order("created_at", { ascending: false })
    .limit(200);

  if (term) {
    // Name, number or email — whichever the owner happens to remember.
    const like = `%${term}%`;
    query = query.or(
      `name.ilike.${like},phone.ilike.${like},email.ilike.${like},instagram_handle.ilike.${like}`,
    );
  }

  const { data } = await query;
  let clients = (data ?? []) as unknown as Row[];

  /*
   * Whose clients these are.
   *
   * A client does not belong to one stylist in the schema — they belong to the
   * business — so this is derived from who has actually worked with them. That
   * is the honest answer to "are they mine?" and it needs no extra column.
   *
   * Only offered when there is more than one person. In a one-person business
   * the answer is always "yours", and a filter with one option is clutter.
   */
  const team = (await getArtists(studio.id)).filter((a) => a.active);
  const mine = team.some((a) => a.id === who) ? who : null;

  if (mine) {
    /*
     * Three ways a client is somebody's.
     *
     * Bookings alone was too narrow: most people in the list have enquired and
     * not booked yet, so filtering by any one person showed nobody. An enquiry
     * that asked for Sarah, or one that arrived on Sarah's own Instagram, is
     * Sarah's client before a single appointment exists.
     */
    clients = clients.filter((c) => {
      const booked = [
        ...c.conversations.flatMap((v) => v.enquiries?.bookings ?? []),
        ...(c.bookings ?? []),
      ].some((b) => b.artist_id === mine);
      if (booked) return true;

      return c.conversations.some(
        (v) => v.artist_id === mine || v.enquiries?.artist_id === mine,
      );
    });
  }

  const link = (artistId: string | null) => {
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    if (artistId) params.set("who", artistId);
    const query = params.toString();
    return query ? `/clients?${query}` : "/clients";
  };

  return (
    <div className="mx-auto max-w-4xl px-8 py-9">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="page-title">Clients</h1>
        <span className="hint">
          {clients.length}
          {clients.length === 200 ? "+" : ""} {term ? "matching" : "in total"}
        </span>

        {/* Somebody who has never messaged you still needs a record — the
            walk-in regular, and anybody you want to reach out to first. */}
        <Link href="/clients/new" className="btn-highlight ml-auto px-3.5 py-2 text-xs">
          Add a client
        </Link>
      </div>

      <form className="mt-5">
        {/* Carried through the search, or filtering one person and then
            searching would silently drop back to everybody. */}
        {mine && <input type="hidden" name="who" value={mine} />}
        <input
          name="q"
          defaultValue={term}
          placeholder="Search by name, number or email…"
          className="input max-w-md"
          aria-label="Search clients"
        />
      </form>

      {team.length > 1 && (
        <div className="mt-4 flex flex-wrap items-center gap-1.5">
          <Link
            href={link(null)}
            className={`rounded-full px-3 py-1 text-xs transition-colors ${
              !mine
                ? "bg-surface-2 font-medium text-foreground"
                : "border border-border text-muted hover:text-foreground"
            }`}
          >
            Everyone
          </Link>
          {team.map((a) => (
            <Link
              key={a.id}
              href={link(a.id)}
              className={`rounded-full px-3 py-1 text-xs transition-colors ${
                mine === a.id
                  ? "bg-surface-2 font-medium text-foreground"
                  : "border border-border text-muted hover:text-foreground"
              }`}
            >
              {a.name}
            </Link>
          ))}
        </div>
      )}

      <div className="card mt-5 overflow-hidden">
        {clients.length === 0 ? (
          <p className="px-5 py-14 text-center text-sm">
            {term ? "Nobody matches that." : "No clients yet — they arrive with the first enquiry."}
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {clients.map((c) => {
              /*
               * Both routes to a booking.
               *
               * One made through a conversation hangs off its enquiry; one
               * typed into the diary is attached to the contact directly.
               * Counting only the first made a client booked in over the phone
               * look like somebody who had never been.
               */
              const bookings = [
                ...c.conversations.flatMap(
                  (v) => v.enquiries?.bookings?.filter((b) => !b.cancelled_at) ?? [],
                ),
                ...(c.bookings ?? []).filter((b) => !b.cancelled_at),
              ];
              const paid = bookings
                .filter((b) => b.deposit_status === "paid")
                .reduce((t, b) => t + b.deposit_amount_pence, 0);
              const last = c.conversations
                .map((v) => v.last_message_at)
                .sort()
                .pop();
              /*
               * A row has to be worth choosing between.
               *
               * Four clients called "Unnamed" over the word "Website" tell you
               * nothing and are impossible to pick between. Plenty of people
               * chat and never give a name, so this is the common case, not the
               * edge one — and what they asked about identifies them far better
               * than the channel they used.
               */
              const named = c.name ?? c.phone ?? c.instagram_handle ?? null;
              const asked = c.conversations
                .map((v) => v.enquiries?.description)
                .find(Boolean);
              const who = named ?? asked ?? "Unnamed";

              return (
                <li key={c.id}>
                  <Link
                    href={`/clients/${c.id}`}
                    className="row flex items-center gap-3.5 px-4 py-3.5 sm:px-5"
                  >
                    {/* The same faces as the inbox, so the two lists read as
                        the same people rather than two databases. */}
                    {named ? (
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                        style={{ background: colourForName(named) }}
                        aria-hidden
                      >
                        {initialsOf(named)}
                      </span>
                    ) : (
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-surface-2 text-muted"
                        title={CHANNEL_LABELS[c.channel]}
                        aria-hidden
                      >
                        <ChannelIcon channel={c.channel} />
                      </span>
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{who}</span>
                        {c.alert && (
                          <span
                            className="pill shrink-0 bg-warn/15 text-[10px] uppercase tracking-wide text-warn"
                            title={c.alert}
                          >
                            note
                          </span>
                        )}
                      </div>
                      <div className="hint num mt-0.5 truncate">
                        {named
                          ? [c.phone, c.email].filter(Boolean).join(" · ") ||
                            CHANNEL_LABELS[c.channel]
                          : CHANNEL_LABELS[c.channel]}
                      </div>
                    </div>

                    {/* Spend first: it is the number that says whether this is
                        a regular or somebody who enquired once. */}
                    {paid > 0 && (
                      <div className="num hidden shrink-0 text-sm font-medium sm:block">
                        {formatPence(paid)}
                      </div>
                    )}

                    <div className="hint w-20 shrink-0 text-right">
                      {bookings.length
                        ? `${bookings.length} booking${bookings.length === 1 ? "" : "s"}`
                        : "enquiry only"}
                    </div>

                    <time className="hint num hidden w-14 shrink-0 text-right sm:block">
                      {last
                        ? new Date(last).toLocaleDateString("en-GB", {
                            day: "numeric",
                            month: "short",
                          })
                        : ""}
                    </time>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
