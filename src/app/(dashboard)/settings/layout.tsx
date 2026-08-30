import { TabLink } from "@/components/NavLink";
import { requireStudio } from "@/lib/studio";
import { verticalPack } from "@/lib/verticals";

export default async function SettingsLayout({ children }: { children: React.ReactNode }) {
  const { studio } = await requireStudio();
  const pack = verticalPack(studio.vertical);
  const words = { ...pack.vocabulary, ...(studio.vocabulary ?? {}) };
  const title = (s: string) => s.replace(/^./, (c) => c.toUpperCase());

  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <p className="hint mt-1">
        Everything here is fed into the assistant&rsquo;s system prompt. Change it and the
        next conversation uses it.
      </p>

      <nav className="mt-6 flex gap-6 border-b border-border">
        <TabLink href="/settings">{title(words.business)}</TabLink>
        <TabLink href="/settings/artists">{title(words.practitioners)}</TabLink>
        <TabLink href="/settings/pricing">Pricing</TabLink>
        <TabLink href="/settings/faqs">FAQs</TabLink>
      </nav>

      <div className="mt-8">{children}</div>
    </div>
  );
}
