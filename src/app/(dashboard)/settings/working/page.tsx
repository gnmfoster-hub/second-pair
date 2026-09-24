import { requireOwner } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { workingFacts } from "@/lib/workingFacts";
import { Working } from "@/components/Working";

/**
 * Is it working? — the owner's own copy.
 *
 * The same page we use to check a business from the back office, read from
 * their side. Giles asked for it after using ours: everything they have been
 * sold, whether each part is set up, connected and has actually carried
 * something, and which screen each part is set on.
 *
 * Two differences from ours, both about what the reader can do. The things we
 * control say "ask us" rather than offering a link to a screen they cannot
 * open. And it is "your people" rather than "their people", which is not
 * politeness — it is the difference between a page about them and a page for
 * them.
 *
 * The inbox keeps its own panel for what is blocking the assistant today, and
 * links here. That one nags and disappears when it is done; this one is the
 * reference and stays.
 */
export default async function IsItWorkingPage() {
  const { studio } = await requireOwner();
  const supabase = await createClient();
  const { facts, people } = await workingFacts(supabase, studio);

  return (
    <div className="space-y-5">
      <p className="hint max-w-prose">
        Everything you have, and whether each part is set up, connected, and has actually
        carried something. Proven means a real
        message reached a real person — not that a box is ticked, because a number can be
        bought, saved, and still answer nothing.
      </p>

      {/*
        * Said out loud, because there is now more than one page about being
        * set up and pretending otherwise is how a product gets muddled.
        *
        * /setup is the walk-through: one step at a time, in order, for
        * somebody who has just arrived. This is the reference: everything at
        * once, including the things a walk-through cannot ask — whether a
        * number has ever actually carried a text, and which screen each part
        * is set on. They answer different questions and both are worth having;
        * what would not be worth having is two lists nobody can tell apart.
        */}
      <p className="hint max-w-prose">
        Setting up for the first time? <a href="/setup" className="text-accent hover:underline">The walk-through</a>{" "}
        takes it a step at a time. This page is the whole picture, for when something is
        already running and you want to know whether it is.
      </p>

      <Working facts={facts} people={people} audience="owner" open />
    </div>
  );
}
