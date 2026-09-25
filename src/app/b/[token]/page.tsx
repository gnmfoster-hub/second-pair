import { createAdminClient } from "@/lib/supabase/admin";
import { avatarUrl } from "@/components/Avatar";
import { formatExactPence } from "@/lib/money";
import { KeepInTouch } from "./KeepInTouch";

export const dynamic = "force-dynamic";

/**
 * What a phone shows when this link arrives in a text.
 *
 * Giles, after a real call: "when the text comes through, because it
 * references the website it shows a logo, and the logo is the old hands and
 * wrong colour background."
 *
 * Two faults in that, and the second is the one that matters. The card was the
 * old two-hands mark on navy, from before the re-brand — but a customer of a
 * cleaning company opening a text about their own appointment should never
 * have seen a Second Pair advert at all. It is not our link. It is theirs.
 *
 * So the preview is the business: their name, their appointment, and their
 * picture where they have uploaded one. Where they have not, no image —
 * deliberately, because no picture reads as a plain link from a business, and
 * the wrong picture reads as somebody else's brand on their message.
 *
 * Built per request rather than as a constant, because none of it is known
 * until the token is looked up.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  /* A page about one person's appointment has no business in a search index. */
  const base = { robots: { index: false, follow: false } };

  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ...base, title: "Your appointment" };

  const db = createAdminClient();
  const { data } = await db
    .from("bookings")
    .select("starts_at, artists(studio_id)")
    .eq("public_token", token)
    .maybeSingle();

  const studioId = (data as { artists?: { studio_id?: string } | null } | null)?.artists?.studio_id;
  if (!studioId) return { ...base, title: "Your appointment" };

  const { data: studio } = await db
    .from("studios")
    .select("*")
    .eq("id", studioId)
    .maybeSingle();

  const name = (studio?.name as string | undefined) ?? null;
  const picture = avatarUrl((studio as { photo_path?: string | null } | null)?.photo_path);

  return {
    ...base,
    title: name ? `Your appointment with ${name}` : "Your appointment",
    openGraph: {
      title: name ? `Your appointment with ${name}` : "Your appointment",
      description: "Everything about your booking, and how to change it.",
      /*
       * Their picture or nothing. An empty array overrides the site-wide card
       * rather than falling through to it, which is the whole point.
       */
      images: picture ? [picture] : [],
    },
  };
}

/**
 * A customer's own appointment, opened from a text or an email.
 *
 * Giles asked for this after looking at how the better confirmations work: a
 * short message with a link to a proper page, rather than everything crammed
 * into a hundred and sixty characters. A text can carry a sentence; what was
 * booked, when, with whom, what it comes to, the business's cancellation
 * policy and a way to put it in a calendar need somewhere to live.
 *
 * Three decisions worth writing down, all taken from reading Fresha's and
 * deciding which parts were good rather than which parts were there.
 *
 * The business is the brand. Their name is the heading, their picture is at
 * the top, and Second Pair appears once at the bottom in small type. Theirs is
 * the relationship; ours is with them.
 *
 * Money is explicit. What it comes to, what a deposit has already covered, and
 * the cancellation terms in the business's own words — not "fees may apply".
 * Nobody has ever been pleased to discover a charge they were not told about,
 * and a page that is vague about it is worse than no page.
 *
 * And it is readable by anybody holding the link, which is exactly what it is
 * for and exactly why the link is an unguessable token rather than the
 * booking's id. No session, no account, no sign-in wall in front of somebody
 * who only wants to check what time they said.
 */
export default async function BookingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();

  /* Shaped like a token before it is looked up, so a scan costs one regex. */
  const valid = /^[A-Za-z0-9_-]{20,64}$/.test(token);

  /*
   * select("*") on the booking rather than naming public_token, because
   * PostgREST refuses the whole query for a column it does not know and this
   * page ships before the migration runs. Until then nothing matches and the
   * page says so, which is the same thing it says for a wrong link.
   */
  const { data: booking } = valid
    ? await db
        .from("bookings")
        .select(
          "*, artists(name, avatar_path, colour, studio_id), contacts(name, email, phone, marketing_email, marketing_sms)",
        )
        .eq("public_token", token)
        .maybeSingle()
    : { data: null };

  const artist = booking?.artists as unknown as
    | { name: string; avatar_path: string | null; colour: string | null; studio_id: string }
    | null;

  const { data: studio } = artist
    ? await db.from("studios").select("*").eq("id", artist.studio_id).maybeSingle()
    : { data: null };

  if (!booking || !studio) {
    return (
      <main className="mx-auto max-w-lg px-5 py-16">
        <h1 className="text-xl font-medium">We cannot find that appointment</h1>
        <p className="hint mt-2">
          The link may be out of date, or it may have been typed rather than tapped. Whoever
          you booked with will be able to tell you where you are.
        </p>
      </main>
    );
  }

  const cancelled = Boolean(booking.cancelled_at);
  const when = new Date(booking.starts_at as string);
  const ends = new Date(booking.ends_at as string);
  const timezone = (studio.timezone as string) ?? "Europe/London";

  const day = new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: timezone,
  }).format(when);

  const time = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: timezone,
  }).format(when);

  const minutes = Math.round((ends.getTime() - when.getTime()) / 60000);
  const length =
    minutes >= 60
      ? `${Math.floor(minutes / 60)}h${minutes % 60 ? ` ${minutes % 60}min` : ""}`
      : `${minutes}min`;

  const picture = avatarUrl((studio as { photo_path?: string | null }).photo_path);
  const price = booking.price_pence as number | null;
  const deposit = booking.deposit_amount_pence as number | null;
  const paid = booking.deposit_status === "paid";
  const contact = booking.contacts as unknown as
    | { name: string | null; email?: string | null; phone?: string | null;
        marketing_email?: boolean | null; marketing_sms?: boolean | null }
    | null;
  const customer = contact?.name ?? null;

  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      {/* Theirs, not ours. */}
      <header className="flex items-start gap-4">
        {picture && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={picture}
            alt=""
            className="size-16 shrink-0 rounded-xl border border-border object-cover"
          />
        )}
        {/*
          * The name, and no address — because there is no address column on a
          * business, and inventing one to fill a space Fresha happened to fill
          * would put a field on the settings screen that nothing else wants.
          * Worth adding when somebody asks for it rather than because a
          * competitor's email has one.
          */}
        <div className="min-w-0">
          <h1 className="text-lg font-medium">{studio.name as string}</h1>
        </div>
      </header>

      {cancelled ? (
        <p className="mt-6 rounded-xl border border-warn/40 bg-warn/10 px-4 py-3 text-sm">
          This appointment has been cancelled. If that is not right, reply to the message
          this link came from and they will sort it out.
        </p>
      ) : (
        <p className="mt-6 text-2xl font-medium">
          {customer ? `${customer.split(" ")[0]}, you are booked in` : "You are booked in"}
        </p>
      )}

      <dl className="mt-5 divide-y divide-border border-y border-border">
        <Row label="When">
          {day} at {time}
          <span className="hint block">{length}</span>
        </Row>

        {booking.title ? <Row label="What">{booking.title as string}</Row> : null}

        {artist ? <Row label="With">{artist.name}</Row> : null}

        {price ? (
          <Row label="Price">
            {/* To the penny: see formatExactPence. This is a page somebody
                checks against what they were told, and a rounded number on it
                reads as an estimate. */}
            {formatExactPence(price)}
            {deposit && paid ? (
              <span className="hint block">
                {formatExactPence(deposit)} deposit paid, {formatExactPence(price - deposit)}{" "}
                on the day
              </span>
            ) : deposit ? (
              <span className="hint block">{formatExactPence(deposit)} deposit to pay</span>
            ) : null}
          </Row>
        ) : null}
      </dl>

      {!cancelled && (
        <a href={`/b/${token}/calendar`} className="btn-primary mt-5 inline-flex">
          Add to my calendar
        </a>
      )}

      {/*
        * Their words, not ours.
        *
        * Fresha reproduces the salon's own policy exactly as it was typed,
        * star decorations included, and that is the right call: a customer is
        * agreeing to the business's terms rather than to a platform's summary
        * of them, and tidying somebody's voice up for them is how a policy
        * stops sounding like the person who will be enforcing it.
        */}
      {studio.cancellation_policy ? (
        <section className="mt-8">
          <h2 className="text-sm font-medium">If you need to cancel</h2>
          <p className="hint mt-1.5 whitespace-pre-line">
            {studio.cancellation_policy as string}
          </p>
        </section>
      ) : null}

      <section className="mt-8">
        <h2 className="text-sm font-medium">Need to change something?</h2>
        <p className="hint mt-1.5">
          Reply to the message this link came from and it will reach{" "}
          {studio.name as string} directly.
        </p>
      </section>

      {/*
        * The one ask, at the bottom, under everything they came for.
        *
        * Nobody on the platform had opted in to anything, because there was
        * nowhere to opt in from — so the campaign side had a send button with
        * nobody behind it. This is the moment somebody is most willing: they
        * are on a page about their own appointment, having tapped a link in a
        * message from a business they chose.
        *
        * Only where there is a record to attach it to. A booking typed into
        * the diary with no client attached has nobody to ask.
        */}
      {contact && !cancelled && (
        <KeepInTouch
          token={token}
          business={studio.name as string}
          hasEmail={Boolean(contact.email)}
          hasPhone={Boolean(contact.phone)}
          already={{
            email: contact.marketing_email === true,
            sms: contact.marketing_sms === true,
          }}
        />
      )}

      <p className="hint mt-10 border-t border-border pt-4 text-center text-[11px]">
        Booked with {studio.name as string}, who use Second Pair to answer and keep the diary.
      </p>
    </main>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-3">
      <dt className="w-20 shrink-0 text-sm text-muted">{label}</dt>
      <dd className="min-w-0 flex-1 text-sm">{children}</dd>
    </div>
  );
}
