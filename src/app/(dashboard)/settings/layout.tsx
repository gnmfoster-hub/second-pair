import { TabLink } from "@/components/NavLink";
import { Page, PageHeader } from "@/components/PageHeader";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { verticalPack } from "@/lib/verticals";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { studio, userId } = await requireStudio();
  const pack = verticalPack(studio.vertical);
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };
  const title = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

  /*
   * The owner sets up the business; everybody else sets up themselves.
   *
   * These tabs were the same for everybody, so a Saturday junior was shown the
   * prices, the assistant's instructions and the widget on the website. The
   * actions behind them refuse now, but a screen you are invited to fill in
   * and then told you may not is a worse experience than one that was never
   * offered — and it also reads as though the business is theirs to change.
   */
  const supabase = await createClient();
  const { data: membership } = await supabase
    .from("studio_members")
    .select("role")
    .eq("studio_id", studio.id)
    .eq("user_id", userId)
    .maybeSingle();

  // Anything other than a clear yes is treated as staff, which shows less
  // rather than more.
  const owns = membership?.role === "owner";

  /*
   * The tab carries their name rather than saying "You".
   *
   * "Who is 'You'?" was a fair question, and it came from the owner — who is
   * exactly the person it is worst for. They are the only one who sees this
   * tab and the whole business sitting beside it, so "You" and "Willow & Co"
   * appear together with nothing to say that the first means Sarah the
   * stylist and not Sarah the owner. Everybody else sees one tab and never has
   * cause to wonder.
   *
   * Their own name settles it in a word, and says the same thing about the
   * page underneath: this is one person's, and every person here has their own.
   */
  const { data: me } = await supabase
    .from("artists")
    .select("name")
    .eq("studio_id", studio.id)
    .eq("user_id", userId)
    .maybeSingle();

  // Somebody with a login and no place in the diary — a receptionist, an
  // office manager — has no name to use here, and "You" is right for them.
  const mine = (me?.name as string | undefined)?.trim().split(/\s+/)[0] || "You";

  return (
    <Page>
      <PageHeader title="Settings">
        {owns ? (
          <>
            How your {words.business} works, and what the assistant knows. Change
            something and the next conversation uses it. The first tab is yours alone
            &mdash; your own hours, rates and days off &mdash; and everybody on the team
            has the same one of their own. Theirs is on{" "}
            <span className="text-foreground">{title(words.practitioners)}</span>, where
            you can fill it in for them.
          </>
        ) : (
          <>
            Your own hours, rates and days off. The rest of the {words.business} is set
            by whoever owns it.
          </>
        )}
      </PageHeader>

      {/*
        * Grouped, and in the order somebody actually sets a business up.
        *
        * Ten tabs in one row is a list you have to read all of to find
        * anything, and the order was the order they were built in — pricing
        * after the assistant, the money buried inside the business page, the
        * team between two things about words. Somebody opening this for the
        * first time could not tell what belonged to what.
        *
        * Four groups, each answering one question, and inside each the thing
        * you do first comes first: who you are, then how people reach you,
        * then what happens around a booking, then what is yours alone.
        */}
      <nav className="mt-6 border-b border-border pb-1">
        <div className="flex flex-wrap items-start gap-x-8 gap-y-3">
          {owns && (
            <Group title="Your business">
              <TabLink href="/settings">{title(words.business)}</TabLink>
              <TabLink href="/settings/pricing">Prices</TabLink>
              <TabLink href="/settings/artists">{title(words.practitioners)}</TabLink>
              <TabLink href="/settings/money">Getting paid</TabLink>
            </Group>
          )}

          {owns && (
            <Group title="How people reach you">
              <TabLink href="/settings/install">Channels</TabLink>
              <TabLink href="/settings/assistant">Assistant</TabLink>
              <TabLink href="/settings/faqs">Questions</TabLink>
            </Group>
          )}

          {owns && (
            <Group title="Around a booking">
              <TabLink href="/settings/reminders">Reminders</TabLink>
              <TabLink href="/settings/forms">Forms</TabLink>
            </Group>
          )}

          {/*
            * Last, and the only group somebody who is not the owner sees —
            * which is why it is a group of its own rather than a tab at the
            * front of somebody else's list.
            */}
          <Group title={owns ? "Yours" : "Yours alone"}>
            <TabLink href="/settings/you">{mine}</TabLink>
            <TabLink href="/settings/data">Your data</TabLink>
          </Group>
        </div>
      </nav>

      <div className="mt-8">{children}</div>
    </Page>
  );
}

/**
 * A handful of tabs under a word saying what they are for.
 *
 * The heading is the whole point: a tab called "Forms" means nothing on its
 * own and everything under "Around a booking".
 */
function Group({ title: heading, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[0.68rem] font-semibold uppercase tracking-[0.1em] text-muted">
        {heading}
      </span>
      <div className="flex flex-wrap items-baseline gap-x-5">{children}</div>
    </div>
  );
}
