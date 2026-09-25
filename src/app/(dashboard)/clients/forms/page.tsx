import Link from "next/link";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { wordsFor, capital } from "@/lib/words";
import { SendToSeveral } from "./SendToSeveral";
import { wentNowhere } from "@/lib/forms/howItWent";

export const dynamic = "force-dynamic";

/**
 * Forms across the whole business: send one to several people, and see what
 * is still waiting to be signed.
 *
 * "Waiting" first on a phone would push the sending below the fold, so it is
 * the other way round — but the waiting list is the one people come back to,
 * because it is the list of who to chase before Saturday.
 */
export default async function FormsOverviewPage() {
  const { studio } = await requireStudio();
  const supabase = await createClient();
  const words = wordsFor(studio);

  const now = new Date();
  const fortnight = new Date(now.getTime() + 14 * 86_400_000);

  const [templates, contacts, waiting, upcoming] = await Promise.all([
    supabase.from("form_templates").select("id, name").eq("studio_id", studio.id).eq("active", true).order("sort_order").order("created_at"),
    supabase
      .from("contacts")
      .select("id, name, phone, email")
      .eq("studio_id", studio.id)
      .eq("is_test", false)
      .order("name")
      .limit(1000),
    supabase
      .from("client_forms")
      .select("id, title, status, sent_at, opened_at, contact_id, sent_via, contacts(name)")
      .eq("studio_id", studio.id)
      .in("status", ["sent", "opened"])
      .order("sent_at", { ascending: true })
      .limit(100),
    supabase
      .from("bookings")
      .select("contact_id, starts_at, artists!inner(studio_id)")
      .eq("artists.studio_id", studio.id)
      .is("cancelled_at", null)
      .not("contact_id", "is", null)
      .gte("starts_at", now.toISOString())
      .lt("starts_at", fortnight.toISOString())
      .order("starts_at"),
  ]);

  if (templates.error) {
    return (
      <div className="card p-5">
        <h1 className="page-title">Forms</h1>
        <p className="hint mt-2">Forms need a database update before they can be used, and it is on your list.</p>
      </div>
    );
  }

  // Who is in on each of the next fourteen days, for "everyone booked on…".
  const byDay = new Map<string, Set<string>>();
  for (const b of upcoming.data ?? []) {
    const day = new Intl.DateTimeFormat("en-CA", { timeZone: studio.timezone ?? "Europe/London" }).format(new Date(b.starts_at as string));
    if (!byDay.has(day)) byDay.set(day, new Set());
    byDay.get(day)!.add(b.contact_id as string);
  }

  const days = [...byDay.entries()].map(([day, ids]) => ({
    day,
    label: new Date(`${day}T12:00:00`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" }),
    ids: [...ids],
  }));

  const age = (iso: string | null) => {
    if (!iso) return "";
    const d = Math.floor((now.getTime() - Date.parse(iso)) / 86_400_000);
    return d <= 0 ? "today" : d === 1 ? "yesterday" : `${d} days ago`;
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <Link href="/clients" className="text-sm text-accent hover:underline">
            ← {capital(words.customers)}
          </Link>
          <h1 className="page-title mt-2">Forms</h1>
        </div>
        <Link href="/settings/forms" className="text-sm text-accent hover:underline">
          Write or edit forms
        </Link>
      </div>

      <SendToSeveral
        templates={(templates.data ?? []).map((t) => ({ id: t.id as string, name: t.name as string }))}
        people={(contacts.data ?? []).map((c) => ({
          id: c.id as string,
          name: (c.name as string | null) ?? (c.phone as string | null) ?? (c.email as string | null) ?? "Unnamed",
          reachable: Boolean(c.phone || c.email),
        }))}
        days={days}
        customers={words.customers}
      />

      <section className="card p-5">
        <h2 className="section-title">Waiting to be signed</h2>
        {waiting.data && waiting.data.length > 0 ? (
          <ul className="mt-3 divide-y divide-border">
            {waiting.data.map((f) => {
              /*
               * Waiting on them, or waiting on you.
               *
               * This list put both in one pile and labelled the whole pile
               * "Not opened", which reads as a customer ignoring you. It is
               * not always that: a form made for somebody with no number and
               * no email address never goes anywhere at all — a link is put on
               * their record for a person to hand over, and until somebody
               * does, the customer has nothing to ignore.
               *
               * Those are opposite jobs. One is a nudge, the other is you
               * owing somebody a link, and a work list that cannot tell them
               * apart is a work list nobody trusts. See lib/forms/howItWent.
               */
              const unsent = f.status !== "opened" && wentNowhere((f as { sent_via?: string | null }).sent_via ?? null);
              return (
                <li key={f.id}>
                  <Link href={`/clients/${f.contact_id}/forms/${f.id}`} className="flex items-center justify-between gap-3 py-2.5 text-sm hover:text-accent">
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{(f.contacts as unknown as { name: string | null } | null)?.name ?? "Unnamed"}</span>
                      <span className="hint block text-xs">
                        {f.title} · {unsent ? "link made" : "sent"} {age(f.sent_at as string)}
                        {unsent ? " · nobody has been given it" : ""}
                      </span>
                    </span>
                    <span
                      className={`pill shrink-0 text-[0.65rem] ${
                        f.status === "opened"
                          ? "bg-accent/10 text-accent"
                          : unsent
                            ? "bg-warn/10 text-warn"
                            : "bg-surface-2 text-muted"
                      }`}
                    >
                      {f.status === "opened" ? "Opened" : unsent ? "Not sent" : "Not opened"}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="hint mt-2 text-sm">Nothing waiting. Every form sent has been signed.</p>
        )}

        {/*
          * Said once, under the list, rather than on every row that has it.
          *
          * A business seeing "Not sent" for the first time will ask what it
          * means, and the answer is short: there was no way to reach that
          * person when the form was made, so a link was put on their record
          * for somebody to hand over. It is on the row because it is a job,
          * and explained here because it only needs explaining once.
          */}
        {waiting.data?.some((f) => f.status !== "opened" && wentNowhere((f as { sent_via?: string | null }).sent_via ?? null)) && (
          <p className="hint mt-3 max-w-prose text-xs">
            &ldquo;Not sent&rdquo; means a link was made but nothing went out — usually because
            there was no mobile number or email address on that person. Open it to get the
            link and send it however suits.
          </p>
        )}
      </section>
    </div>
  );
}
