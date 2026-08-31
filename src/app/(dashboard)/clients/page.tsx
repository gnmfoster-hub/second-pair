import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { formatPence } from "@/lib/money";
import { colourForName, initialsOf } from "@/lib/diaryColour";
import { CHANNEL_LABELS, type Channel } from "@/lib/types";

type Row = {
  bookings: { deposit_amount_pence: number; deposit_status: string; cancelled_at: string | null }[] | null;
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
    enquiries: {
      quote_low_pence: number | null;
      bookings: { deposit_amount_pence: number; deposit_status: string; cancelled_at: string | null }[];
    } | null;
  }[];
};

export default async function ClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { q } = await searchParams;
  const term = (q ?? "").trim();

  const { studio } = await requireStudio();
  const supabase = await createClient();

  let query = supabase
    .from("contacts")
    .select(
      "id, name, phone, email, instagram_handle, channel, alert, created_at, " +
        "bookings(deposit_amount_pence, deposit_status, cancelled_at), " +
        "conversations(id, last_message_at, enquiries(quote_low_pence, bookings(deposit_amount_pence, deposit_status, cancelled_at)))",
    )
    .eq("studio_id", studio.id)
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
  const clients = (data ?? []) as unknown as Row[];

  return (
    <div className="mx-auto max-w-4xl px-8 py-9">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="page-title">Clients</h1>
        <span className="hint">
          {clients.length}
          {clients.length === 200 ? "+" : ""} {term ? "matching" : "in total"}
        </span>
      </div>

      <form className="mt-5">
        <input
          name="q"
          defaultValue={term}
          placeholder="Search by name, number or email…"
          className="input max-w-md"
          aria-label="Search clients"
        />
      </form>

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
              const who = c.name ?? c.phone ?? c.instagram_handle ?? "Unnamed";

              return (
                <li key={c.id}>
                  <Link
                    href={`/clients/${c.id}`}
                    className="flex items-center gap-3.5 px-4 py-3.5 transition-colors hover:bg-surface-2/60 sm:px-5"
                  >
                    {/* The same faces as the inbox, so the two lists read as
                        the same people rather than two databases. */}
                    <span
                      className="grid size-9 shrink-0 place-items-center rounded-full text-xs font-semibold text-white"
                      style={{ background: colourForName(who) }}
                      aria-hidden
                    >
                      {initialsOf(who)}
                    </span>

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
                        {[c.phone, c.email].filter(Boolean).join(" · ") ||
                          CHANNEL_LABELS[c.channel]}
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
