import { notFound } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platform";
import { workingFacts } from "@/lib/workingFacts";
import type { Studio } from "@/lib/types";
import { Working } from "../../Working";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * One business, and whether everything it has been sold actually works.
 *
 * Giles: "its very hard to check everything is working from a user
 * perspective" and "i need to work out a way of making it easier to understand
 * whats going on with everything and where everything is located."
 *
 * Its own page rather than a panel in the console, because answering it
 * honestly costs about twenty queries — every capability asks not only whether
 * it is configured but whether it has ever actually carried anything. Doing
 * that for nine businesses on every load of the back office would make the
 * screen everybody uses slow to serve the screen somebody opens now and then.
 *
 * What it deliberately cannot do is read a conversation. Every count here is
 * head-only: whether a thing has ever happened, never what was said. The
 * privacy notice tells every customer of every business that nobody else on
 * Second Pair can read what they wrote, and a screen here that could would
 * make that sentence false for all of them at once.
 */
export default async function WorkingPage({ params }: { params: Promise<{ id: string }> }) {
  if (!(await isPlatformAdmin())) notFound();

  const { id } = await params;
  const db = createAdminClient();

  const { data: studio } = await db.from("studios").select("*").eq("id", id).maybeSingle();
  if (!studio) notFound();

  const facts = await workingFacts(db, studio as Studio);

  return (
    <div className="mx-auto max-w-3xl space-y-5 p-6">
      <div>
        <Link href="/admin" className="hint hover:text-foreground">
          ← Every business
        </Link>
        <h1 className="mt-1 text-xl font-medium">{studio.name}</h1>
        <p className="hint mt-1 max-w-prose">
          Everything they have been sold, and whether each one is set up, connected and has
          actually carried something. Proven means a real thing reached a real person — not
          that a box is ticked, because a number can be bought, saved, and answer nothing
          because a webhook was never pasted in.
        </p>
      </div>

      {/* Open, because on this page the panel is the page. */}
      <Working facts={facts} open />
    </div>
  );
}
