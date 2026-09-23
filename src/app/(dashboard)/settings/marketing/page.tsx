import Link from "next/link";
import { requireOwner } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { wordsFor } from "@/lib/words";
import { channelsOn, reachable, type MarketingBusiness } from "@/lib/marketingPlan";

export const dynamic = "force-dynamic";

export const metadata = { title: "Marketing" };

/**
 * Marketing: offers and news, to people who have asked to hear them.
 *
 * What this page is today is the honest half — what the business is allowed to
 * send, how many people it could actually reach, and how that number grows.
 * Campaigns themselves come next, and building the sending before there was
 * anybody to send to would have been the wrong end of the problem: across
 * every business on the platform, nobody had opted in at all.
 *
 * Two separate permissions, and the page keeps them apart because conflating
 * them is how a business ends up fined:
 *
 *   We switch it on, per channel, and charge for it — texts cost per message.
 *   The person opts in, with the dated evidence PECR asks for.
 *
 * Neither implies the other, and both are needed. See marketingPlan.ts.
 */
export default async function MarketingSettingsPage() {
  const { studio } = await requireOwner();
  const supabase = await createClient();
  const words = wordsFor(studio);

  const business = studio as unknown as MarketingBusiness;
  const on = channelsOn(business);

  /*
   * select("*") rather than naming the marketing columns: PostgREST refuses
   * the whole query for one it does not know, and this page must not be the
   * thing that breaks when a migration is a deploy behind.
   */
  const { data: people } = await supabase
    .from("contacts")
    .select("*")
    .eq("studio_id", studio.id);

  const everyone = (people ?? []) as { email?: string | null; phone?: string | null }[];
  const byEmail = reachable(business, everyone, "email");
  const byText = reachable(business, everyone, "sms");
  const withEmail = everyone.filter((p) => p.email).length;

  const customers = words.customers.toLowerCase();

  return (
    <div className="space-y-3">
      <p className="hint max-w-prose">
        Offers, news and a nudge to people who have not been in for a while — sent only to
        those who have said they want to hear from you. Reminders, confirmations and review
        requests are not marketing and are not affected by anything on this page.
      </p>

      {on.length === 0 ? (
        <div className="card space-y-2 p-5">
          <div className="section-title">Not switched on</div>
          <p className="hint max-w-prose">
            Marketing is not part of your account yet. Ask us and we will switch it on —
            email and text are separate, because texts cost per message and email
            effectively does not.
          </p>
          <Link href="/help" className="btn-ghost mt-2 inline-flex">
            Ask us about it
          </Link>
        </div>
      ) : (
        <div className="card space-y-3 p-5">
          <div className="section-title">
            {on.includes("email") && on.includes("sms")
              ? "Email and text are switched on"
              : on.includes("email")
                ? "Email is switched on"
                : "Text is switched on"}
          </div>

          {/*
            * The number that matters, beside the number that flatters.
            *
            * "You have 141 clients" and "you may write to 0 of them" are very
            * different facts, and only the second one can be sent. Showing
            * the first alone is how somebody builds a campaign for an
            * audience that does not exist.
            */}
          <dl className="grid gap-3 sm:grid-cols-3">
            <div>
              <dt className="label">On your books</dt>
              <dd className="text-2xl tabular-nums">{everyone.length}</dd>
            </div>
            {on.includes("email") && (
              <div>
                <dt className="label">You may email</dt>
                <dd className="text-2xl tabular-nums">{byEmail}</dd>
              </div>
            )}
            {on.includes("sms") && (
              <div>
                <dt className="label">You may text</dt>
                <dd className="text-2xl tabular-nums">{byText}</dd>
              </div>
            )}
          </dl>

          {byEmail === 0 && byText === 0 && (
            <p className="rounded-lg bg-warn/10 px-3 py-2 text-sm text-warn">
              Nobody has agreed to hear from you yet, so nothing can be sent. That is not a
              fault — it is the law, and it is why the number is worth watching.
              {withEmail > 0 && ` ${withEmail} of your ${customers} have an email address on file.`}
            </p>
          )}

          <p className="hint max-w-prose">
            People agree by ticking the box on a form or by using the preferences link at the
            foot of anything you send them, and they can change their mind there at any time.
            The date and how they agreed is kept, which is what makes the list usable if it
            is ever questioned.
          </p>
        </div>
      )}

      <div className="card space-y-2 p-5">
        <div className="section-title">Campaigns</div>
        <p className="hint max-w-prose">
          Sending a message to everybody who had a particular service, so long after they had
          it, from a template you can edit — and one-off offers. Being built now. This page
          will do it from here.
        </p>
      </div>
    </div>
  );
}
