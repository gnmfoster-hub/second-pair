import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists, getPriceBands } from "@/lib/studio";
import { CHANNEL_LABELS, CONV_STATUS_LABELS, type Channel, type ConvStatus } from "@/lib/types";
import { verticalPack } from "@/lib/verticals";

const STATUS_STYLES: Record<ConvStatus, string> = {
  new: "bg-surface-2 text-muted",
  qualified: "bg-surface-2 text-foreground",
  deposit_paid: "bg-ok/10 text-ok",
  booked: "bg-ok/10 text-ok",
  needs_human: "bg-accent/15 text-accent",
  lost: "bg-surface-2 text-muted/60",
};

type Row = {
  id: string;
  channel: Channel;
  status: ConvStatus;
  last_message_at: string;
  contacts: {
    name: string | null;
    instagram_handle: string | null;
    phone: string | null;
    email: string | null;
  } | null;
  enquiries: { description: string | null }[] | null;
};

export default async function InboxPage() {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const [{ data }, artists, bands] = await Promise.all([
    supabase
      .from("conversations")
      .select(
        "id, channel, status, last_message_at, " +
          "contacts(name, instagram_handle, phone, email), enquiries(description)",
      )
      .eq("studio_id", studio.id)
      .order("last_message_at", { ascending: false })
      .limit(50),
    getArtists(studio.id),
    getPriceBands(studio.id),
  ]);

  const conversations = (data ?? []) as unknown as Row[];

  const pack = verticalPack(studio.vertical);
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };

  const checklist = [
    { done: artists.length > 0, label: `Add at least one ${words.practitioner} with rates`, href: "/settings/artists" },
    { done: bands.length > 0, label: "Set up size bands", href: "/settings/pricing" },
    {
      done: studio.cancellation_policy.trim().length > 0,
      label: "Write the cancellation policy",
      href: "/settings",
    },
    { done: Boolean(studio.privacy_notice_url), label: "Add a privacy notice URL", href: "/settings" },
    { done: Boolean(studio.stripe_account_id), label: "Connect Stripe for deposits", href: "/settings" },
  ];
  const outstanding = checklist.filter((c) => !c.done);

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Inbox</h1>
      <p className="hint mt-1">Every enquiry across every channel.</p>

      {outstanding.length > 0 && (
        <div className="card mt-6 p-5">
          <div className="text-sm font-medium">
            Setup: {checklist.length - outstanding.length} of {checklist.length} done
          </div>
          <ul className="mt-3 space-y-2">
            {checklist.map((item) => (
              <li key={item.label} className="flex items-center gap-2.5 text-sm">
                <span
                  className={`grid size-4 shrink-0 place-items-center rounded-full text-[10px] ${
                    item.done ? "bg-ok/15 text-ok" : "border border-border text-transparent"
                  }`}
                >
                  ✓
                </span>
                {item.done ? (
                  <span className="text-muted line-through">{item.label}</span>
                ) : (
                  <Link href={item.href} className="text-foreground hover:text-accent">
                    {item.label}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card mt-6 overflow-hidden">
        {conversations.length === 0 ? (
          <div className="px-5 py-14 text-center">
            <div className="text-sm">No enquiries yet.</div>
            <p className="hint mx-auto mt-2 max-w-sm">
              Once the web widget is installed on your site, enquiries land here within a
              minute of arriving.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {conversations.map((c) => {
              const contact = c.contacts;
              const reach = contact?.phone ?? contact?.email;
              return (
                <li key={c.id}>
                  <Link
                    href={`/conversations/${c.id}`}
                    className="flex items-center gap-4 px-5 py-3.5 hover:bg-surface-2/50"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm">
                        {contact?.name ??
                          contact?.instagram_handle ??
                          contact?.phone ??
                          "Unnamed enquiry"}
                      </div>
                      <div className="hint mt-0.5 truncate">
                        {c.enquiries?.[0]?.description ?? CHANNEL_LABELS[c.channel]}
                      </div>
                    </div>
                    {!reach && (
                      <span
                        className="text-xs text-warn"
                        title="No phone or email captured yet"
                      >
                        no contact
                      </span>
                    )}
                    <span
                      className={`rounded-full px-2.5 py-1 text-xs ${STATUS_STYLES[c.status]}`}
                    >
                      {CONV_STATUS_LABELS[c.status]}
                    </span>
                    <time className="hint w-24 shrink-0 text-right">
                      {new Date(c.last_message_at).toLocaleDateString("en-GB", {
                        day: "numeric",
                        month: "short",
                      })}
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
