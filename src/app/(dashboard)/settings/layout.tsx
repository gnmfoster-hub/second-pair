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

  return (
    <Page>
      <PageHeader title="Settings">
        {owns ? (
          <>
            How your {words.business} works, and what the assistant knows. Change
            something and the next conversation uses it.
          </>
        ) : (
          <>
            Your own hours, rates and days off. The rest of the {words.business} is set
            by whoever owns it.
          </>
        )}
      </PageHeader>

      <nav className="mt-6 flex flex-wrap gap-6 border-b border-border">
        {/*
          * First, and for everybody.
          *
          * Six of the eight tabs are the owner's. Somebody who is not the owner
          * arrived at a list of their colleagues and a page about exporting
          * data, with nothing on the row that was theirs — and the two things
          * they most needed, notifications and the app on their phone, were
          * behind one of the six they could not open.
          */}
        <TabLink href="/settings/you">You</TabLink>
        {owns && <TabLink href="/settings">{title(words.business)}</TabLink>}
        {owns && <TabLink href="/settings/assistant">Assistant</TabLink>}
        {/* The team, which is the owner's view of everybody. A worker sees
            themselves on You instead, where it is not sat under a heading
            naming the whole salon. */}
        {owns && <TabLink href="/settings/artists">{title(words.practitioners)}</TabLink>}
        {owns && <TabLink href="/settings/pricing">Pricing</TabLink>}
        {owns && <TabLink href="/settings/reminders">Reminders</TabLink>}
        {owns && <TabLink href="/settings/faqs">FAQs</TabLink>}
        {owns && <TabLink href="/settings/install">Channels</TabLink>}
        <TabLink href="/settings/data">Your data</TabLink>
      </nav>

      <div className="mt-8">{children}</div>
    </Page>
  );
}
