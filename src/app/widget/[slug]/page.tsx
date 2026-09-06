import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { verticalPack } from "@/lib/verticals";
import { avatarUrl } from "@/components/Avatar";
import { ChatWindow } from "./ChatWindow";

/**
 * Nudges a hex colour to something text will read on.
 *
 * A business is going to pick a pale yellow eventually, and white text on it is
 * unreadable. Rather than refuse their colour, the header darkens it enough to
 * carry white — their brand, still legible.
 */
function readable(hex: string): { fill: string; onFill: string } {
  const n = parseInt(hex, 16);
  let r = (n >> 16) & 255;
  let g = (n >> 8) & 255;
  let b = n & 255;

  // Rec. 709 luminance: green carries most of the perceived brightness, so a
  // plain average would call a bright green "dark" and put white on it.
  const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;

  if (light > 0.62) {
    const scale = 0.62 / light;
    r = Math.round(r * scale);
    g = Math.round(g * scale);
    b = Math.round(b * scale);
  }

  return { fill: `rgb(${r} ${g} ${b})`, onFill: "#ffffff" };
}

// The widget is embedded in an iframe on the business's own site.
export default async function WidgetPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ with?: string; a?: string }>;
}) {
  const { slug } = await params;
  const { with: handle, a } = await searchParams;

  const db = createAdminClient();
  const { data: studio } = await db
    .from("studios")
    .select("id, name, slug, vertical, greeting, privacy_notice_url")
    .eq("slug", slug)
    .maybeSingle();

  if (!studio) notFound();

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
   * The accent arrives from the script tag on the business's own page, so it
   * is a string a stranger controls. Six hex digits or it is ignored — it ends
   * up inside a style attribute, and anything looser is an injection.
   */
  const accent = a && /^[0-9a-f]{6}$/i.test(a) ? readable(a) : null;

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

  return (
    <ChatWindow
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
        person?.greeting?.trim() ||
        studio.greeting?.trim() ||
        verticalPack(studio.vertical).greeting
      }
      openers={openers}
      forArtistId={person?.id ?? null}
      forArtistName={person?.name ?? null}
      photoUrl={avatarUrl(person?.avatar_path) ?? null}
      privacyUrl={studio.privacy_notice_url ?? null}
      accent={accent?.fill ?? null}
      onAccent={accent?.onFill ?? null}
    />
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
