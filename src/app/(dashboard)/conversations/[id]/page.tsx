import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireStudio, getArtists, getPriceBands, getServiceOptions } from "@/lib/studio";
import { formatRange, formatPence } from "@/lib/money";
import { depositFor } from "@/lib/quote";
import { CHANNEL_LABELS, CONV_STATUS_LABELS, labelFor, type ConvStatus } from "@/lib/types";
import { ReplyBox } from "./ReplyBox";
import { setPaused, setStatus } from "./actions";

const STATUSES: ConvStatus[] = [
  "new",
  "qualified",
  "deposit_paid",
  "booked",
  "needs_human",
  "lost",
];

export default async function ConversationPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const { data: conversation } = await supabase
    .from("conversations")
    .select("*, contacts(*)")
    .eq("id", id)
    .eq("studio_id", studio.id)
    .maybeSingle();

  if (!conversation) notFound();

  const [{ data: messages }, { data: enquiry }, artists, bands, options] = await Promise.all([
    supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", id)
      .order("created_at"),
    supabase.from("enquiries").select("*, bookings(*)").eq("conversation_id", id).maybeSingle(),
    getArtists(studio.id),
    getPriceBands(studio.id),
    getServiceOptions(studio.id),
  ]);

  const contact = conversation.contacts;
  const band = bands.find((b) => b.id === enquiry?.size_band_id);
  const artist = artists.find((a) => a.id === enquiry?.artist_id);

  // Reference images live in a private bucket, so the dashboard needs signed URLs.
  const references: string[] = enquiry?.reference_urls ?? [];
  let signed: { path: string; url: string }[] = [];
  if (references.length) {
    const admin = createAdminClient();
    const { data } = await admin.storage
      .from("references")
      .createSignedUrls(references, 60 * 10);
    signed = (data ?? []).flatMap((s) =>
      s.signedUrl ? [{ path: s.path ?? "", url: s.signedUrl }] : [],
    );
  }

  const detail = (label: string, value: React.ReactNode) => (
    <div className="flex gap-3 py-1.5 text-sm">
      <span className="w-32 shrink-0 text-muted">{label}</span>
      <span className={value ? "" : "text-muted/50"}>{value || "—"}</span>
    </div>
  );

  const quote =
    enquiry?.quote_low_pence != null && enquiry?.quote_high_pence != null
      ? formatRange(enquiry.quote_low_pence, enquiry.quote_high_pence)
      : null;

  return (
    <div className="mx-auto max-w-5xl px-8 py-10">
      <Link href="/" className="hint hover:text-foreground">
        ← Inbox
      </Link>

      <div className="mt-3 flex items-start gap-4">
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold tracking-tight">
            {contact?.name ?? "Unnamed enquiry"}
          </h1>
          <p className="hint mt-1">
            {CHANNEL_LABELS[conversation.channel as keyof typeof CHANNEL_LABELS]} ·{" "}
            {new Date(conversation.created_at).toLocaleDateString("en-GB", {
              day: "numeric",
              month: "long",
            })}
            {conversation.first_response_ms
              ? ` · replied in ${(conversation.first_response_ms / 1000).toFixed(1)}s`
              : ""}
          </p>
        </div>

        <form action={setStatus} className="flex items-center gap-2">
          <input type="hidden" name="conversation_id" value={conversation.id} />
          <select
            name="status"
            defaultValue={conversation.status}
            className="input w-40 py-1.5"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {CONV_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
          <button type="submit" className="btn-ghost">
            Set
          </button>
        </form>
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_20rem]">
        <div className="min-w-0 space-y-6">
          <section className="card p-5">
            <h2 className="mb-4 text-sm font-medium">Conversation</h2>
            <div className="space-y-3">
              {(messages ?? []).map((m) => {
                if (m.role === "system") {
                  return (
                    <p key={m.id} className="py-1 text-center text-xs text-warn">
                      {m.content}
                    </p>
                  );
                }
                const fromClient = m.role === "client";
                return (
                  <div
                    key={m.id}
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3.5 py-2.5 text-sm ${
                      fromClient
                        ? "rounded-tl-sm bg-surface-2"
                        : "ml-auto rounded-br-sm bg-accent/90 text-white"
                    }`}
                  >
                    {m.role === "owner" && (
                      <div className="mb-1 text-[10px] uppercase tracking-wide opacity-70">
                        You
                      </div>
                    )}
                    {m.content}
                    {m.media_urls?.length > 0 && (
                      <div className="mt-1 text-xs opacity-80">
                        📎 {m.media_urls.length} image
                        {m.media_urls.length > 1 ? "s" : ""}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="card p-5">
            <div className="mb-4 flex items-center gap-3">
              <h2 className="text-sm font-medium">Reply</h2>
              <form action={setPaused} className="ml-auto">
                <input type="hidden" name="conversation_id" value={conversation.id} />
                <input
                  type="hidden"
                  name="paused"
                  value={conversation.ai_paused ? "false" : "true"}
                />
                <button type="submit" className="btn-ghost">
                  {conversation.ai_paused ? "Hand back to the assistant" : "Take over"}
                </button>
              </form>
            </div>
            {conversation.ai_paused && (
              <p className="hint mb-3">
                The assistant is paused. Replies here are yours alone.
              </p>
            )}
            <ReplyBox conversationId={conversation.id} />
          </section>
        </div>

        <aside className="space-y-6">
          <section className="card p-5">
            <h2 className="mb-2 text-sm font-medium">Contact</h2>
            {detail("Name", contact?.name)}
            {detail(
              "Phone",
              contact?.phone ? <a href={`tel:${contact.phone}`}>{contact.phone}</a> : null,
            )}
            {detail(
              "Email",
              contact?.email ? <a href={`mailto:${contact.email}`}>{contact.email}</a> : null,
            )}
            {!contact?.phone && !contact?.email && (
              <p className="hint mt-3 text-warn">No way to reach this person yet.</p>
            )}
          </section>

          {(() => {
            const booking = (enquiry?.bookings ?? []).find(
              (b: { cancelled_at: string | null }) => !b.cancelled_at,
            );
            if (!booking) return null;
            const bookedWith = artists.find((a) => a.id === booking.artist_id);
            return (
              <section className="card p-5">
                <h2 className="mb-2 text-sm font-medium">Appointment</h2>
                {detail(
                  "When",
                  new Date(booking.starts_at).toLocaleString("en-GB", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                    hour: "numeric",
                    minute: "2-digit",
                    hour12: true,
                    timeZone: studio.timezone,
                  }),
                )}
                {detail("Type", booking.type === "consultation" ? "Consultation" : "Session")}
                {detail("With", bookedWith?.name)}
                {detail(
                  "Deposit",
                  `${formatPence(booking.deposit_amount_pence)} — ${
                    booking.deposit_status === "paid"
                      ? "paid"
                      : booking.deposit_status === "link_sent"
                        ? "link sent, not paid"
                        : booking.deposit_status
                  }`,
                )}
                {booking.held_until && booking.deposit_status !== "paid" && (
                  <p className="hint mt-2 text-warn">
                    Slot released if unpaid by{" "}
                    {new Date(booking.held_until).toLocaleTimeString("en-GB", {
                      hour: "numeric",
                      minute: "2-digit",
                      hour12: true,
                      timeZone: studio.timezone,
                    })}
                    .
                  </p>
                )}
              </section>
            );
          })()}

          <section className="card p-5">
            <h2 className="mb-2 text-sm font-medium">Enquiry</h2>
            {detail("Wants", enquiry?.description)}
            {detail("Placement", enquiry?.placement)}
            {detail("Size", band?.size_label)}
            {detail(
              "Style",
              labelFor(options.filter((o) => o.kind === "style"), enquiry?.style),
            )}
            {detail("With", artist?.name)}
            {detail(
              "Cover-up",
              enquiry?.cover_up == null ? null : enquiry.cover_up ? "Yes" : "No",
            )}
            {detail(
              "18 or over",
              enquiry?.age_confirmed == null
                ? null
                : enquiry.age_confirmed
                  ? "Confirmed"
                  : "Not confirmed",
            )}
            {detail("Availability", enquiry?.preferred_times)}
            {detail("Quoted", quote)}
            {quote && enquiry && (
              <div className="flex gap-3 py-1.5 text-sm">
                <span className="w-32 shrink-0 text-muted">Deposit due</span>
                <span>
                  {formatPence(
                    depositFor(studio.deposit_rule, {
                      low_pence: enquiry.quote_low_pence,
                      high_pence: enquiry.quote_high_pence,
                      hit_minimum: false,
                    }),
                  )}
                </span>
              </div>
            )}
          </section>

          {signed.length > 0 && (
            <section className="card p-5">
              <h2 className="mb-3 text-sm font-medium">References</h2>
              <div className="grid grid-cols-2 gap-2">
                {signed.map((image) => (
                  <a key={image.path} href={image.url} target="_blank" rel="noreferrer">
                    {/* Signed URLs expire, so next/image caching would break them. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={image.url}
                      alt="Client reference"
                      className="aspect-square w-full rounded-lg border border-border object-cover"
                    />
                  </a>
                ))}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>
  );
}
