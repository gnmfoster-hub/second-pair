import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { formatPence } from "@/lib/money";
import { CHANNEL_LABELS, type Channel } from "@/lib/types";

type Row = {
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
    <div className="mx-auto max-w-4xl px-8 py-10">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2">
        <h1 className="text-xl font-semibold tracking-tight">Clients</h1>
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
              const bookings = c.conversations.flatMap(
                (v) => v.enquiries?.bookings?.filter((b) => !b.cancelled_at) ?? [],
              );
              const paid = bookings
                .filter((b) => b.deposit_status === "paid")
                .reduce((t, b) => t + b.deposit_amount_pence, 0);
              const last = c.conversations
                .map((v) => v.last_message_at)
                .sort()
                .pop();

              return (
                <li key={c.id}>
                  <Link
                    href={`/clients/${c.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 truncate text-sm">
                        {c.name ?? c.phone ?? c.instagram_handle ?? "Unnamed"}
                        {c.alert && (
                          <span className="rounded-full bg-warn/15 px-2 py-0.5 text-[10px] uppercase tracking-wide text-warn">
                            note
                          </span>
                        )}
                      </div>
                      <div className="hint mt-0.5 truncate tabular-nums">
                        {[c.phone, c.email].filter(Boolean).join(" · ") ||
                          CHANNEL_LABELS[c.channel]}
                      </div>
                    </div>

                    <div className="hint w-24 shrink-0 text-right">
                      {bookings.length} booking{bookings.length === 1 ? "" : "s"}
                    </div>
                    <div className="w-20 shrink-0 text-right text-sm tabular-nums">
                      {paid ? formatPence(paid) : ""}
                    </div>
                    <time className="hint w-20 shrink-0 text-right">
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
