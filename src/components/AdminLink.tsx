import Link from "next/link";
import { isPlatformAdmin } from "@/lib/platform";

/**
 * The way into the back office, for the one person who has one.
 *
 * Renders nothing at all for everybody else — not a disabled link, not a
 * greyed-out row. A business owner should have no idea this exists, in the same
 * way the route itself is a 404 rather than a locked door.
 */
export async function AdminLink() {
  if (!(await isPlatformAdmin())) return null;

  return (
    <Link
      href="/admin"
      className="row flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted hover:text-foreground"
    >
      <span aria-hidden>◆</span>
      Every business
    </Link>
  );
}
