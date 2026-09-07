import { requireStudio } from "@/lib/studio";
import { verticalPack } from "@/lib/verticals";
import { Retention } from "./Retention";
import { CalendarLinks } from "./CalendarLinks";
import { createClient } from "@/lib/supabase/server";
import { siteOrigin } from "@/lib/origin";

export const metadata = { title: "Your data — Second Pair" };

/**
 * Taking their own data out.
 *
 * A business's customers are its own. It should never have to ask us for them,
 * and it should never be unable to leave with them — which is both the decent
 * thing and the answer to the question every owner asks before signing up.
 *
 * Spreadsheets rather than an export format, because the person downloading
 * this wants to open it, mail-merge from it, or hand it to whatever they use
 * next. Nobody has ever wanted a JSON file of their clients.
 */
export default async function DataPage() {
  const { studio } = await requireStudio();

  /*
   * The calendar feeds, which nothing has ever shown anybody.
   *
   * Read through the signed-in session rather than the service key, so the
   * database decides what this person may see: a member of staff gets their
   * own row and not the business's token.
   */
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const [{ data: membership }, { data: me }, { data: business }] = await Promise.all([
    supabase
      .from("studio_members")
      .select("role")
      .eq("studio_id", studio.id)
      .eq("user_id", user?.id ?? "")
      .maybeSingle(),
    supabase
      .from("artists")
      .select("id, name, calendar_token")
      .eq("studio_id", studio.id)
      .eq("user_id", user?.id ?? "")
      .maybeSingle(),
    supabase
      .from("studios")
      .select("name, calendar_token")
      .eq("id", studio.id)
      .maybeSingle(),
  ]);

  const owns = membership?.role === "owner";
  const origin = await siteOrigin();
  const pack = verticalPack(studio.vertical);
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };

  return (
    <div className="max-w-2xl">
      <h1 className="page-title">Your data</h1>
      <p className="hint mt-1.5 max-w-prose">
        Everything here is yours. Take a copy whenever you like &mdash; for your
        accountant, for a mailing list, or to keep.
      </p>

      <div className="card mt-6 divide-y divide-border p-0">
        <Row
          title={`Your ${words.customer}s`}
          detail="Names, numbers, emails and your notes, with who has agreed to marketing."
          href="/settings/data/clients"
        />
        <Row
          title="Every appointment"
          detail="What it was worth, who it was with, and whether it was cancelled. Cancelled ones are included and marked — a short month is a worse surprise than a column."
          href="/settings/data/bookings"
        />
      </div>

      {/*
        * Said plainly, because it is the question behind the page.
        *
        * An owner deciding whether to depend on us is really asking what
        * happens if they stop. Answering it here, in the product, is worth
        * more than any promise on the website.
        */}
      <p className="hint mt-6 max-w-prose">
        If you ever stop using Second Pair, this is how you leave with everything. There
        is nothing to ask us for.
      </p>

      <p className="hint mt-3 max-w-prose">
        If one of your {words.customer}s asks what you hold about <em>them</em>, open their
        page and there is a copy to send, written as something they can read.
      </p>

      <CalendarLinks
        origin={origin}
        business={business ? { name: business.name, token: business.calendar_token } : null}
        mine={me ? { id: me.id, name: me.name, token: me.calendar_token } : null}
        owns={owns}
      />

      <Retention months={studio.keep_months} />
    </div>
  );
}

function Row({ title, detail, href }: { title: string; detail: string; href: string }) {
  return (
    <div className="flex flex-wrap items-center gap-4 p-5">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium">{title}</div>
        <p className="hint mt-0.5">{detail}</p>
      </div>
      {/* A plain link, not a fetch: the browser downloads it and shows its own
          progress, which is what somebody expects from a file. */}
      <a href={href} className="btn-ghost shrink-0" download>
        Download
      </a>
    </div>
  );
}
