import { notFound } from "next/navigation";
import { hasColumn } from "@/lib/db/hasColumn";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verticalPack } from "@/lib/verticals";
import { paint } from "@/lib/widget/colour";
import { avatarUrl, initialsFor } from "@/components/Avatar";
import { Mark } from "@/components/Logo";
import { ChatWindow } from "./ChatWindow";


// The widget is embedded in an iframe on the business's own site.
export default async function WidgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ with?: string; a?: string; t?: string; embed?: string }>;
}) {
  const { slug } = await params;
  const { with: handle, a, t, embed } = await searchParams;

  /*
   * Embedded, or a page in its own right.
   *
   * The script on a business's website adds embed=1 when it opens the panel,
   * so the absence of it means somebody has followed the shareable link —
   * from an Instagram bio, a card, a van. Those are different situations and
   * were getting the same bare chat column, which on a desktop meant seven
   * hundred pixels of nothing and no clue whose business it was.
   *
   * Decided on the server rather than by asking the browser whether it is in a
   * frame, so the right shape is in the first paint instead of appearing a
   * moment later.
   */
  const embedded = embed === "1";

  const db = createAdminClient();
  const { data: studio } = await db
    .from("studios")
    .select("id, name, slug, vertical, greeting, privacy_notice_url, widget_accent, widget_text, archived_at, email")
    .eq("slug", slug)
    .maybeSingle();

  if (!studio) notFound();

  /*
   * A business that has stopped says so before anybody types.
   *
   * The page rendered in full for an archived business — greeting, opening
   * buttons, "answering now", a composer — and only refused once the customer
   * had written their message, as a small amber pill floating in the thread.
   * They had no idea how to reach the business instead, which is the whole
   * reason they opened a chat.
   *
   * Whatever contact details the business left behind are shown, because the
   * script is usually still on a website somebody is still looking at.
   */
  if (studio.archived_at) {
    return (
      <div className="grid min-h-dvh place-items-center px-6 text-center">
        <div className="max-w-sm">
          <h1 className="text-lg font-semibold tracking-tight">
            {studio.name} is not taking messages here
          </h1>
          <p className="hint mt-2">
            This chat has been switched off. Nothing you write here would reach anybody, so it is
            better to say so now.
          </p>
          {studio.email && (
            <p className="hint mt-3">
              You can still reach them at{" "}
              <a href={`mailto:${studio.email}`}>{studio.email}</a>.
            </p>
          )}
        </div>
      </div>
    );
  }

  /*
   * A link with somebody's handle in it means the enquiry is theirs.
   *
   * This is how a salon gives every stylist their own link for their own
   * Instagram bio, while the plain link still reaches the whole shop. Inactive
   * people are ignored, so a stale link in an old bio falls back to the shop
   * rather than booking somebody who has left.
   */
  // Whose link it is, and whether there is anybody to book. Two questions about
  // the same business that do not depend on each other, asked together — this
  // is the page every customer loads, so a round trip saved is saved on all of
  // them.
  const [{ data: person }, { data: bookable }] = await Promise.all([
    handle
      ? db
          .from("artists")
          .select("id, name, avatar_path, colour, greeting")
          .eq("studio_id", studio.id)
          .eq("active", true)
          .ilike("handle", handle)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    db
      .from("artists")
      .select("id")
      .eq("studio_id", studio.id)
      .eq("active", true)
      .limit(1),
  ]);

  /*
   * And whether that person is meant to have a way in of their own.
   *
   * A personal link deliberately ignores the business's own rules about who is
   * offered — right for a chair renter, wrong for somebody employed: the owner
   * switches the assistant off for them and a link still quietly books them.
   * Off, the link falls back to the business's own assistant, exactly as a
   * stale link from somebody who has left already does.
   *
   * Asked as a separate question rather than added to the query above, because
   * a column PostgREST does not recognise makes it refuse the whole query —
   * which would take every personal link on the product down until the
   * migration ran, to enforce a rule nobody has set yet. hasColumn remembers
   * the answer, so this costs one query per deployment rather than one per
   * customer.
   */
  const theirOwn =
    person && (await hasColumn(db, "artists", "own_link"))
      ? await db
          .from("artists")
          .select("own_link")
          .eq("id", person.id)
          .maybeSingle()
          .then(({ data }) => data?.own_link !== false)
      : true;

  const whose = theirOwn ? person : null;

  /*
   * Both colours arrive on the query string, from a script on the business's
   * own page, so they are strings a stranger controls. `paint` reads them
   * strictly and falls back — they end up inside a style attribute, and
   * anything looser is an injection.
   *
   * Same function the launcher's colours came from, so the button somebody
   * taps and the panel it opens cannot disagree.
   */
  /*
   * Their colour, whichever way the page was reached.
   *
   * Embedded, it arrives on the query string from the script on their site.
   * Followed as a link it did not arrive at all, so the shareable page — the
   * one a business with no website puts in an Instagram bio — was the one
   * place their brand colour was quietly ignored and everybody got our navy.
   */
  const look =
    a || t
      ? paint(a ?? null, t ?? null)
      : paint(studio.widget_accent ?? null, studio.widget_text ?? null);

  /*
   * An assistant with nobody to book is answering questions, not taking work.
   *
   * That is exactly the help assistant, and offering it "How much would it be?"
   * and "What have you got free?" is offering a support desk a price list. When
   * there is no diary behind it, the business's own questions are what somebody
   * is actually there to ask.
   */
  /*
   * Only the help assistant gets this far.
   *
   * A business with somebody to book shows the three standard openers, so
   * neither the questions nor — more to the point — who is asking them is
   * needed. Working out whether somebody is signed in means asking Supabase to
   * verify a cookie, which is a round trip on the one page every customer
   * loads, and it was being paid on every single view to answer a question
   * only the support desk ever asks.
   */
  const helpDesk = !bookable?.length;

  const [{ data: asked }, signedIn] = await Promise.all([
    helpDesk
      ? db
          .from("faqs")
          .select("question, audience")
          .eq("studio_id", studio.id)
          .order("sort_order")
      : Promise.resolve({ data: null }),
    helpDesk ? whoIsAsking() : Promise.resolve(false),
  ]);

  /*
   * Different first questions for a customer and a stranger.
   *
   * "What does it cost?" is the right opener for somebody deciding whether to
   * buy and a wasted tap for somebody who already pays — they want to know how
   * to do the thing they opened the help for.
   *
   * Which is which is marked on the row. It was inferred from the wording at
   * first, and inferring put "How do I sign up?" in front of somebody who had
   * already signed up — the sort of answer that makes a product feel like it
   * does not know you.
   */
  const wanted = signedIn ? "owner" : "visitor";
  const openers = (asked ?? [])
    // An untagged answer suits anybody, so it is a fallback rather than a miss.
    .filter((f) => f.audience === wanted || f.audience == null)
    .map((f) => f.question)
    .filter(Boolean)
    .slice(0, 3);

  const chat = (
    <ChatWindow
      standalone={!embedded}
      slug={studio.slug}
      studioName={studio.name}
      /*
       * Their wording, then the shop's, then the trade pack.
       *
       * On somebody's own link it is them the customer thinks they are
       * messaging, so a greeting in their words beats the shop's — and the
       * pack is the last fallback so a new signup is never greeted by a
       * blank line.
       */
      greeting={
        whose?.greeting?.trim() ||
        studio.greeting?.trim() ||
        verticalPack(studio.vertical).greeting
      }
      openers={openers}
      forArtistId={whose?.id ?? null}
      forArtistName={whose?.name ?? null}
      photoUrl={avatarUrl(whose?.avatar_path) ?? null}
      privacyUrl={studio.privacy_notice_url ?? null}
      accent={look ? `#${look.fill}` : null}
      onAccent={look ? `#${look.text}` : null}
    />
  );

  if (embedded) return chat;

  /*
   * The shareable link, as a page.
   *
   * Whose it is, above. What it is, below. The business's own colour on the
   * ground so it is theirs rather than ours, and our mark small at the foot —
   * a customer messaging a tattooist should be in no doubt they are messaging
   * the tattooist.
   */
  const who = whose?.name ?? studio.name;
  const photo = avatarUrl(whose?.avatar_path) ?? null;

  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-surface-2 px-4 py-6 sm:h-auto sm:min-h-dvh sm:gap-5 sm:py-10">
      <header className="flex w-full max-w-[34rem] flex-col items-center gap-2.5 text-center">
        <span
          className="grid size-14 shrink-0 place-items-center overflow-hidden rounded-2xl text-base font-semibold shadow-[var(--shadow-card)]"
          style={{
            background: look ? `#${look.fill}` : "var(--accent)",
            color: look ? `#${look.text}` : "var(--on-accent)",
          }}
        >
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="size-full object-cover" />
          ) : (
            initialsFor(who)
          )}
        </span>
        <div>
          <h1 className="text-lg font-semibold leading-tight sm:text-xl">{who}</h1>
          <p className="hint mt-1">
            {whose
              ? `Message ${whose.name.split(" ")[0]} — it answers straight away, day or night.`
              : "Message us. It answers straight away, day or night."}
          </p>
        </div>
      </header>

      <div className="w-full max-w-[34rem] flex-1 sm:flex-none">{chat}</div>

      {/*
        * Ours, small and at the bottom.
        *
        * The customer is here for the business, so the business is at the top
        * at full size and we are a footnote. It is still worth being here: it
        * is the only thing on the page that says what is answering.
        */}
      <a
        href="https://www.second-pair.com/home"
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1.5 text-[0.7rem] text-muted transition-colors hover:text-foreground"
      >
        <Mark sizePx={14} className="opacity-70" />
        Answered with Second Pair
      </a>
    </div>
  );
}


/**
 * Whether whoever opened this is signed in to Second Pair.
 *
 * Only asked on the help assistant, where it decides whether the openers are
 * an owner's questions or a stranger's. Embedded on somebody else's site the
 * cookies never arrive, which throws — and a visitor is the safer of the two
 * answers to get wrong.
 */
async function whoIsAsking(): Promise<boolean> {
  try {
    const supabase = await createClient();
    return Boolean((await supabase.auth.getUser()).data.user);
  } catch {
    return false;
  }
}
