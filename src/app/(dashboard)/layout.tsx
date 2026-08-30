import { requireStudio } from "@/lib/studio";
import { NavLink } from "@/components/NavLink";
import { signOut } from "./actions";

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const { studio, userEmail } = await requireStudio();

  return (
    <div className="flex min-h-screen">
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface">
        <div className="border-b border-border px-5 py-5">
          <div className="text-sm font-semibold tracking-tight">Handled</div>
          <div className="mt-0.5 truncate text-xs text-muted">{studio.name}</div>
        </div>

        <nav className="flex-1 space-y-1 p-3">
          <NavLink href="/" exact>
            Inbox
          </NavLink>
          <NavLink href="/settings">Settings</NavLink>
        </nav>

        <div className="border-t border-border p-3">
          <div className="truncate px-3 pb-2 text-xs text-muted">{userEmail}</div>
          <form action={signOut}>
            <button type="submit" className="btn-ghost w-full">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
