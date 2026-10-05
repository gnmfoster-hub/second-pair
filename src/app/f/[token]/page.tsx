import { createAdminClient } from "@/lib/supabase/admin";
import { cleanBlocks } from "@/lib/forms/blocks";
import { prefillFor, type Known } from "@/lib/forms/fieldRoles";
import { hasColumn } from "@/lib/db/hasColumn";
import { paint } from "@/lib/widget/colour";
import { avatarUrl } from "@/components/Avatar";
import { FillForm } from "./FillForm";

export const dynamic = "force-dynamic";

/**
 * What the link looks like when it lands in a text.
 *
 * Giles, 5 October: "its sending the second pair logo in the text form link and
 * its the old logo." Both true, and the first is the one that matters. This page
 * had a robots tag and nothing else, so every preview fell through to the
 * site-wide card: the Second Pair wordmark, the words "You work, we answer", and
 * a picture of our logo.
 *
 * So a business sends their customer a consent form and what arrives in their
 * messages is an advert for their supplier. The booking page has done it
 * properly since it was built; this one never did.
 *
 * Their picture or nothing, and an empty array rather than a missing key,
 * because leaving it out falls through to the site card again, which is the
 * whole fault.
 */
export async function generateMetadata({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  /* A page about one person's dog has no business in a search index. */
  const base = { robots: { index: false, follow: false } };

  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { ...base, title: "A form to fill in" };

  const db = createAdminClient();
  const { data } = await db
    .from("client_forms")
    .select("title, studios(name, photo_path)")
    .eq("token", token)
    .maybeSingle();

  const studio = (data?.studios ?? null) as unknown as {
    name?: string | null;
    photo_path?: string | null;
  } | null;

  const business = studio?.name ?? null;
  const picture = avatarUrl(studio?.photo_path);
  const title = business
    ? `${(data?.title as string) ?? "A form"} for ${business}`
    : ((data?.title as string) ?? "A form to fill in");

  return {
    ...base,
    title,
    openGraph: {
      title,
      description: business ? `${business} would like you to fill this in.` : "A form to fill in.",
      images: picture ? [picture] : [],
    },
  };
}

/**
 * A form, opened by the customer from a text or an email.
 *
 * Nothing about it needs an account, and nothing on it says Second Pair more
 * than it has to: this is the business asking its own customer to fill
 * something in, so the business's name is the heading.
 */
export default async function FormPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const db = createAdminClient();

  const valid = /^[A-Za-z0-9_-]{20,64}$/.test(token);
  const { data: form } = valid
    ? await db
        .from("client_forms")
        .select(
          "id, title, blocks, status, expires_at, signed_at, studios(name, photo_path, widget_accent, widget_text), contacts(name)",
        )
        .eq("token", token)
        .maybeSingle()
    : { data: null };

  const studio = (form?.studios ?? null) as unknown as {
    name: string;
    photo_path?: string | null;
    widget_accent?: string | null;
    widget_text?: string | null;
  } | null;

  const business = studio?.name ?? null;

  /*
   * Their colour, not ours.
   *
   * Giles asked for the form to look like the business's own site rather than
   * like Second Pair. The page already renders entirely through CSS custom
   * properties, so the whole of it follows from overriding two of them: every
   * button, focus ring and ticked box on the page reads --accent.
   *
   * Reusing the widget's colour rather than inventing a second one, because a
   * business that has set the colour of the chat bubble on their own website
   * has already answered this question, and asking it twice is how two things
   * that should match end up not matching.
   *
   * paint() checks the hex is a hex and works out readable text for it, which
   * matters here more than on the widget: this page has a submit button
   * somebody has to find after four pages of questions.
   */
  const colour = paint(studio?.widget_accent ?? null, studio?.widget_text ?? null);
  const theirs = {
    "--accent": `#${colour.fill}`,
    "--accent-strong": `#${colour.fill}`,
    "--on-accent": `#${colour.text}`,
  } as React.CSSProperties;

  const picture = avatarUrl(studio?.photo_path);

  /*
   * What we already hold about them, for filling the boxes in.
   *
   * A second query rather than more columns on the first, and only when there
   * is actually a form to show: the one above runs for every link preview any
   * messaging app fetches, and a customer's name, address and notes are not
   * something to read out of the database on a crawler's behalf.
   *
   * Read tolerantly, because address and postcode arrive with a migration and
   * a deploy can land before it is run. Naming a column PostgREST has not heard
   * of refuses the whole query, and the thing that would stop working is every
   * form.
   */
  const needsFilling =
    form && form.status !== "void" && form.status !== "signed" && Boolean(form.contacts);

  const known = needsFilling ? await whatWeHold(db, form.id) : {};

  const gone = !form || form.status === "void";
  const expired = Boolean(form?.expires_at && hasPassed(form.expires_at as string) && form.status !== "signed");

  /*
   * Marking it opened happens in the browser (see FillForm), because every
   * messaging app fetches the link to draw a preview and each of those looked
   * like the customer opening it.
   */

  return (
    <main className="guest min-h-screen bg-background px-4 py-8" style={theirs}>
      <div className="mx-auto max-w-xl">
        {/*
          * Their picture, where they have one.
          *
          * It is the one thing that makes a page opened from a text feel like
          * it came from the business rather than from a system they have never
          * heard of. Round and small: this is a letterhead, not a hero, and the
          * questions are what somebody came here to do.
          */}
        {picture ? (
          <div className="flex items-center gap-3">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={picture}
              alt=""
              className="size-12 shrink-0 rounded-full object-cover ring-1 ring-border"
            />
            {business && <p className="label">{business}</p>}
          </div>
        ) : (
          business && <p className="label">{business}</p>
        )}

        {gone ? (
          <Notice heading="This form is not available">
            It may have been withdrawn, or the link was copied wrongly. Ask for a new link.
          </Notice>
        ) : form.status === "signed" ? (
          <Notice heading="Already done, thank you">
            This form was filled in and signed. There is nothing more to do.
          </Notice>
        ) : expired ? (
          <Notice heading="This link has run out">
            Ask {business ?? "the business"} to send it again.
          </Notice>
        ) : (
          <>
            {/* In their colour, which is the cheapest thing that stops this
                reading as somebody else's software. */}
            <h1 className="page-title mt-1" style={{ color: `#${colour.fill}` }}>
              {form.title}
            </h1>
            <p className="hint mt-1">
              {(form.contacts as unknown as { name: string | null } | null)?.name
                ? `For ${(form.contacts as unknown as { name: string }).name}. `
                : ""}
              {(form.blocks as { type?: string }[] | null)?.some((b) => b?.type === "lines")
                ? `Read it through, then accept and sign below.`
                : `Takes a couple of minutes. Your answers go privately to ${business ?? "the business"}.`}
            </p>
            <FillForm
              token={token}
              blocks={cleanBlocks(form.blocks)}
              business={business ?? "the business"}
              filled={prefillFor(cleanBlocks(form.blocks), known)}
            />
          </>
        )}
      </div>
    </main>
  );
}

function Notice({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <div className="card mt-4 p-6">
      <h1 className="text-lg font-semibold">{heading}</h1>
      <p className="hint mt-2">{children}</p>
    </div>
  );
}

/** Out of the render, where reading the clock belongs. */
function hasPassed(iso: string): boolean {
  return Date.parse(iso) < Date.now();
}

/**
 * The details already on file, for the person this form was sent to.
 *
 * Guarded column by column rather than asked for in one go, because address and
 * postcode arrive with a migration: a deploy that lands first would otherwise
 * take every form down with it, since PostgREST refuses an entire query over
 * one column it does not know.
 */
async function whatWeHold(
  db: ReturnType<typeof createAdminClient>,
  formId: string,
): Promise<Known> {
  const { data: row } = await db
    .from("client_forms")
    .select("contacts(name, phone, email, trade_facts)")
    .eq("id", formId)
    .maybeSingle();

  const person = (row?.contacts ?? null) as {
    name?: string | null;
    phone?: string | null;
    email?: string | null;
    trade_facts?: Record<string, string> | null;
  } | null;

  if (!person) return {};

  const known: Known = {
    name: person.name,
    phone: person.phone,
    email: person.email,
    facts: person.trade_facts ?? null,
  };

  if (await hasColumn(db, "contacts", "address")) {
    const { data: more } = await db
      .from("client_forms")
      .select("contacts(address, postcode)")
      .eq("id", formId)
      .maybeSingle();
    const extra = (more?.contacts ?? null) as {
      address?: string | null;
      postcode?: string | null;
    } | null;
    known.address = extra?.address ?? null;
    known.postcode = extra?.postcode ?? null;
  }

  return known;
}
