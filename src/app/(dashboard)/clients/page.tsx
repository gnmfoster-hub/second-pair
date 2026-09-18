import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { formatPence } from "@/lib/money";
import { colourForName, initialsOf } from "@/lib/diaryColour";
import { CHANNEL_LABELS, type Channel } from "@/lib/types";
import { ChannelIcon } from "@/components/ChannelIcon";
import { Waiting } from "@/components/Waiting";
import { whoseClient } from "@/lib/whoseClient";
import { wordsFor, capital } from "@/lib/words";

type Row = {
  bookings:
    | {
        artist_id: string;
        starts_at: string;
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
        starts_at: string;
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
        "bookings(artist_id, starts_at, deposit_amount_pence, deposit_status, cancelled_at), " +
        "conversations(id, last_message_at, artist_id, enquiries(artist_id, description, quote_low_pence, bookings(artist_id, starts_at, deposit_amount_pence, deposit_status, cancelled_at)))",
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

  /*
   * Who each client is down to.
   *
   * The rule lives in one place and is tested there, because three screens ask
   * this question — this list, the client's own page, and the filter above —
   * and a label that disagrees with the filter beside it is worse than no
   * label at all.
   */
  const nameOf = new Map(team.map((a) => [a.id, a.name.split(" ")[0]]));

  const belongsTo = (c: (typeof clients)[number]): string | null => {
    const id = whoseClient(
      [...c.conversations.flatMap((v) => v.enquiries?.bookings ?? []), ...(c.bookings ?? [])],
      c.conversations,
    );
    return id ? (nameOf.get(id) ?? null) : null;
  };

  const link = (artistId: string | null) => {
    const params = new URLSearchParams();
    if (term) params.set("q", term);
    if (artistId) params.set("who", artistId);
    const query = params.toString();
    return query ? `/clients?${query}` : "/clients";
  };

  // What this trade calls them: clients, customers, pupils, owners.
  const words = wordsFor(studio);

  return (
    <div className="mx-auto max-w-4xl px-8 py-9">
      {/*
        * The title on one line and the things you can do on another.
        *
        * All four sat in one wrapping row, which is fine on a laptop and falls
        * apart everywhere else: a third control was added and "Add a client" —
        * the one somebody actually came here to press — dropped onto a line of
        * its own, orphaned and left-aligned under the heading while the other
        * two stayed up on the right. Wrapping is not a layout, it is what a
        * layout does when it runs out of room.
        *
        * Two rows that are each allowed to be a row, and the actions keep
        * their own order and their own alignment at every width.
        */}
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <h1 className="page-title">{capital(words.customers)}</h1>
          <span className="hint">
            {clients.length}
            {clients.length === 200 ? "+" : ""} {term ? "matching" : "in total"}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Somebody who has never messaged you still needs a record — the
              walk-in regular, and anybody you want to reach out to first. */}
          <Link href="/clients/forms" className="px-1 text-xs text-accent hover:underline">
            Forms
          </Link>
          {/*
            * Next to adding one, because the two are the same job at different
            * sizes: a business arriving from another system has four hundred
            * to add, and typing them in is not an answer anybody accepts.
            */}
          <Link href="/clients/import" className="btn-ghost px-3.5 py-2 text-xs">
            Bring in a list
          </Link>
          <Link href="/clients/new" className="btn-highlight px-3.5 py-2 text-xs">
            Add a {words.customer}
          </Link>
        </div>
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
          aria-label={`Search ${words.customers}`}
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
          /*
           * The same shape as the empty inbox, which had it right.
           *
           * This was one sentence centred in a large white box. Two screens in
           * the same app answering the same question — "there is nothing here
           * yet" — in two different registers reads as two different products,
           * and the poorer of the two was the one that had an "Add a client"
           * button sitting above it that it never mentioned.
           *
           * A search that found nothing is a different thing entirely: they
           * know the list is not empty, they just cannot see what they wanted.
           */
          <div className="empty">
            {term ? (
              <>
                <div className="empty-title">Nobody matches that</div>
                <p className="empty-body">
                  Try part of a name, a number, or an email address.
                </p>
              </>
            ) : (
              <>
                <Waiting className="mx-auto mb-4 size-14" />
                <div className="empty-title">No {words.customers} yet</div>
                <p className="empty-body">
                  They arrive on their own with the first enquiry — the assistant keeps
                  their details as it books them in. You can add somebody yourself if you
                  already know who they are.
                </p>
              </>
            )}
          </div>
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
                        {/*
                          * Whose client this is.
                          *
                          * Everybody can see everybody's, which is right —
                          * somebody has to be able to look a customer up when
                          * the person who usually sees them is off. What was
                          * missing is whose they are: a list of two hundred
                          * names with no idea which of them are yours reads as
                          * the shop's admin rather than anybody's clients.
                          *
                          * It is only ever a label. It does not decide who
                          * sees what — the inbox does that, and this list is
                          * deliberately shared.
                          */}
                        {belongsTo(c) && (
                          <>
                            {" · "}
                            <span className="text-muted">{belongsTo(c)}</span>
                          </>
                        )}
                      </div>
                    </div>

                    {/* Spend first: it is the number that says whether this is
                        a regular or somebody who enquired once. */}
                    {paid > 0 && (
                      <div className="num hidden shrink-0 text-sm font-medium sm:block">
                        {formatPence(paid)}
                      </div>
                    )}

                    {/*
                      * Sized by its words, not by a guess at them.
                      *
                      * This was a fixed w-20, and "enquiry only" wrapped onto
                      * two lines on every row of the list — twenty-three rows
                      * each two lines deep to say one short phrase. A fixed
                      * width holding text is a bet that nothing about the text
                      * will ever change, and two things had: the spacing scale
                      * came down, taking every w-* with it, and secondary text
                      * went up a pixel.
                      */}
                    <div className="hint shrink-0 whitespace-nowrap text-right">
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
