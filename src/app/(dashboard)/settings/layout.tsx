import { TabLink } from "@/components/NavLink";

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-4xl px-8 py-10">
      <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
      <p className="hint mt-1">
        Everything here is fed into the assistant&rsquo;s system prompt. Change it and the
        next conversation uses it.
      </p>

      <nav className="mt-6 flex gap-6 border-b border-border">
        <TabLink href="/settings">Studio</TabLink>
        <TabLink href="/settings/artists">Artists</TabLink>
        <TabLink href="/settings/pricing">Pricing</TabLink>
        <TabLink href="/settings/faqs">FAQs</TabLink>
      </nav>

      <div className="mt-8">{children}</div>
    </div>
  );
}
