import { TabLink } from "@/components/NavLink";
import { Page, PageHeader } from "@/components/PageHeader";
import { requireStudio } from "@/lib/studio";
import { verticalPack } from "@/lib/verticals";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { studio } = await requireStudio();
  const pack = verticalPack(studio.vertical);
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };
  const title = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

  return (
    <Page>
      <PageHeader title="Settings">
        Everything here is fed into the assistant&rsquo;s system prompt. Change it and the
        next conversation uses it.
      </PageHeader>

      <nav className="mt-6 flex flex-wrap gap-6 border-b border-border">
        <TabLink href="/settings">{title(words.business)}</TabLink>
        <TabLink href="/settings/artists">{title(words.practitioners)}</TabLink>
        <TabLink href="/settings/pricing">Pricing</TabLink>
        <TabLink href="/settings/reminders">Reminders</TabLink>
        <TabLink href="/settings/faqs">FAQs</TabLink>
        <TabLink href="/settings/install">Channels</TabLink>
      </nav>

      <div className="mt-8">{children}</div>
    </Page>
  );
}
