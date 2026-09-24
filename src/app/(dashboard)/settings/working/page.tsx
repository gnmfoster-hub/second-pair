import { createClient } from "@/lib/supabase/server";
import { requireStudio, getArtists } from "@/lib/studio";
import { canConnectStripe } from "@/lib/env";
import { staffSteps, progressOf } from "@/lib/setupSteps";
import { workingFacts } from "@/lib/workingFacts";
import { Working } from "@/components/Working";
import { SetupSteps } from "@/components/SetupSteps";

export const metadata = { title: "Is it working?" };

/**
 * Is it working? — one page about whether this business is set up.
 *
 * Giles asked for the owner's copy of the back-office check, and then: "fold
 * the walk-through into the working page."
 *
 * He was right to. There were two screens about being set up — /setup walked
 * somebody through it a step at a time, this listed everything at once — and
 * two lists nobody can tell apart is one of the things he meant when he said
 * the whole thing felt muddled. Having flagged the overlap myself, leaving it
 * there would have been worse than never mentioning it.
 *
 * So one page, and which half you get depends on what you can actually do:
 *
 *   The owner   Every capability on their plan, whether each part is set up,
 *               connected and has ever carried anything, which screen each
 *               part is set on, and their people.
 *
 *   Everybody   The short walk-through that was already theirs: their phone,
 *   else        their own calendar, their own link, their own Stripe. A
 *               stylist has no business being shown whether the shop's
 *               marketing is switched on, and could not change it anyway.
 *
 * The walk-through's own route is gone and redirects here, so every link ever
 * sent to anybody still lands somewhere.
 */
export default async function IsItWorkingPage() {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  const { data: membership } = await supabase
    .from("studio_members")
    .select("role")
    .eq("studio_id", studio.id)
    .eq("user_id", userId)
    .maybeSingle();

  const owns = membership?.role === "owner";

  /* ─────────────────────────────────────────────────────── the owner's */
  if (owns) {
    const { facts, people } = await workingFacts(supabase, studio);

    return (
      <div className="space-y-5">
        <p className="hint max-w-prose">
          Everything you have, and whether each part is set up, connected, and has actually
          carried something. Used means a real message reached a real person — not that a
          box is ticked, because a number can be bought, saved, and still answer nothing.
        </p>

        <Working facts={facts} people={people} audience="owner" open />
      </div>
    );
  }

  /* ───────────────────────────────────────────────── everybody else's */
  /*
   * Their own few things, unchanged from the walk-through they had before.
   *
   * Only they can do any of it — their phone, their calendar, their own bank
   * account — which is exactly why it survived the fold rather than being
   * replaced by the owner's list.
   */
  const everyone = await getArtists(studio.id);
  const me = everyone.find((a) => a.user_id === userId) ?? null;

  const { count: phones } = await supabase
    .from("push_subscriptions")
    .select("id", { count: "exact", head: true })
    .eq("studio_id", studio.id)
    .eq("user_id", userId);

  const steps = staffSteps({
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

  const { done, of, next } = progressOf(steps);

  return (
    <div className="space-y-5">
      <p className="hint max-w-prose">
        {done === of
          ? "Everything that matters is done. Anything still open below is worth doing, not needed."
          : `${done} of ${of} done. A few things only you can do, because they are on your own phone and your own accounts.`}
      </p>

      <div className="h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div
          className="h-full rounded-full bg-accent transition-[width]"
          style={{ width: `${(done / Math.max(1, of)) * 100}%` }}
        />
      </div>

      <SetupSteps steps={steps} next={next} />
    </div>
  );
}
