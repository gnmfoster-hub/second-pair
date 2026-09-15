import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { readinessOf } from "@/lib/readiness";
import { ownerSteps, staffSteps, progressOf, type SetupStep } from "@/lib/setupSteps";
import { canConnectStripe } from "@/lib/env";
import { wordsFor } from "@/lib/words";
import { Page, PageHeader } from "@/components/PageHeader";
import { StepLink } from "./StepLink";

export const metadata = { title: "Set-up — Second Pair" };

/**
 * The walk-through.
 *
 * The owner of a new business opens the app to an inbox with nothing in it
 * and eight settings tabs. This is the route through them: one step at a
 * time, each saying why it matters, with a button straight to the place it
 * is done and a way back here from there. Everybody else on the team gets
 * their own, shorter one, because their jobs are different and most of the
 * owner's are not theirs to do.
 *
 * Nothing here is saved. Every tick is read off what is already filled in,
 * so it cannot say something is done that has since been undone.
 */
export default async function SetupPage() {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();
  const words = wordsFor(studio);

  const [artists, { data: membership }] = await Promise.all([
    getArtists(studio.id),
    supabase
      .from("studio_members")
      .select("role")
      .eq("studio_id", studio.id)
      .eq("user_id", userId)
      .maybeSingle(),
  ]);

  const owns = membership?.role === "owner";
  const team = artists.filter((a) => a.active);
  const me = artists.find((a) => a.user_id === userId) ?? null;

  let steps: SetupStep[];

  if (owns) {
    const [capabilities, { count: conversations }, { count: fromWebsite }] = await Promise.all([
      readinessOf(supabase, studio),
      supabase.from("conversations").select("id", { count: "exact", head: true }).eq("studio_id", studio.id),
      supabase
        .from("conversations")
        .select("id", { count: "exact", head: true })
        .eq("studio_id", studio.id)
        .eq("channel", "web"),
    ]);

    steps = ownerSteps({
      capabilities,
      slug: studio.slug,
      team: team.length,
      canSignIn: team.filter((a) => a.user_id).length,
      conversations: conversations ?? 0,
      fromWebsite: fromWebsite ?? 0,
      words: { practitioners: words.practitioners, customers: words.customers },
    });
  } else {
    const { count: phones } = await supabase
      .from("push_subscriptions")
      .select("id", { count: "exact", head: true })
      .eq("studio_id", studio.id)
      .eq("user_id", userId);

    steps = staffSteps({
      firstName: me?.name.split(" ")[0] ?? "",
      ownAccount: studio.payment_model === "people" && me != null,
      stripeConnected: Boolean(me?.stripe_account_id),
      canConnect: canConnectStripe(studio),
      phoneSignedUp: (phones ?? 0) > 0,
      managed: me?.owner_managed === true,
      personalCalendar: Boolean(me?.personal_ical_url),
      slug: studio.slug,
      handle: me?.handle ?? null,
    });
  }

  const { done, of, next } = progressOf(steps);
  const finished = done === of;

  return (
    <Page>
      <PageHeader title={owns ? "Set up your assistant" : "Getting set up"}>
        {finished
          ? "Everything that matters is done. Anything still open below is worth doing, not needed."
          : owns
            ? `${done} of ${of} done. Do them in order — each one makes the next easier — and come back whenever you like; it remembers by looking.`
            : `${done} of ${of} done. A few things only you can do, because they are on your own phone and your own accounts.`}
      </PageHeader>

      <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full rounded-full bg-accent transition-[width]" style={{ width: `${(done / Math.max(1, of)) * 100}%` }} />
      </div>

      <ol className="mt-6 space-y-2.5">
        {steps.map((step, i) => {
          const isNext = next?.key === step.key;
          return (
            <li
              key={step.key}
              className={`card flex gap-4 p-4 sm:p-5 ${isNext ? "border-accent/50 ring-1 ring-accent/20" : ""}`}
            >
              <span
                className={`grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold ${
                  step.done ? "bg-ok/15 text-ok" : isNext ? "bg-accent text-on-accent" : "bg-surface-2 text-muted"
                }`}
                aria-hidden
              >
                {step.done ? "✓" : i + 1}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <h2 className={`font-medium ${step.done ? "text-muted" : ""}`}>{step.title}</h2>
                  {step.optional && <span className="pill bg-surface-2 text-[11px] text-muted">Optional</span>}
                  {step.done && <span className="sr-only">Done</span>}
                  {isNext && <span className="pill bg-accent/10 text-[11px] text-accent">Next</span>}
                </div>

                {/* The explanation only where it is still to do; a done step is a line. */}
                {!step.done && (
                  <>
                    <p className="hint mt-1 max-w-prose">{step.why}</p>
                    {step.todo && <p className="mt-1.5 max-w-prose text-sm text-warn">{step.todo}</p>}
                  </>
                )}

                <div className="mt-3">
                  <StepLink
                    href={step.href}
                    external={step.external}
                    className={
                      step.done
                        ? "text-sm text-muted underline-offset-2 hover:text-foreground hover:underline"
                        : isNext
                          ? "btn inline-flex bg-accent text-on-accent"
                          : "btn inline-flex border border-border"
                    }
                  >
                    {step.done ? "Look again" : step.action}
                  </StepLink>
                </div>
              </div>
            </li>
          );
        })}
      </ol>

      {!owns && me && me.owner_managed !== true && (
        <p className="hint mt-5 max-w-prose">
          Your own hours and rates are on <strong>Settings → You</strong>. They are what the assistant books and
          quotes for you, and nobody else can change them.
        </p>
      )}
    </Page>
  );
}
