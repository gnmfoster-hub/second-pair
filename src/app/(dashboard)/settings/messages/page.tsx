import { requireOwner } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { QuickMessages } from "./QuickMessages";

/**
 * Saved messages — the wordings that appear on a client's page.
 *
 * Giles: "would be good to be able to send emails/messages to the clients in
 * the client page record a copy and have templates etc."
 *
 * The copy was already kept: every message sent from a client's page is
 * written into their conversation with the delivery recorded beside it, which
 * is why it shows under Conversations. This page is the other half.
 *
 * Under "Messages you send" with the reminders, the review request and
 * marketing, because that group is the answer to "where do I change what we
 * say to people" — and this is the only one of the four a person sends by
 * hand.
 */
export default async function SavedMessagesPage() {
  const { studio } = await requireOwner();
  const supabase = await createClient();

  /*
   * Read tolerantly: the table arrives in a migration and a deploy can land
   * before it is run. No table reads as nothing saved, which shows the page
   * offering the starters — and the save then says so in words rather than
   * failing with a relation name.
   */
  const { data } = await supabase
    .from("message_templates")
    .select("id, label, body")
    .eq("studio_id", studio.id)
    .order("sort_order")
    .order("created_at");

  const templates = (data ?? []) as { id: string; label: string; body: string }[];

  return (
    <div className="space-y-5">
      <p className="hint max-w-prose">
        Wordings you pick from when you message somebody from their own page. Every
        business types the same five or six messages over and over — running late, a
        cancellation has come up, sorry we missed you — and the third version is never as
        good as the first.
      </p>
      <p className="hint max-w-prose">
        These are never sent on their own. Picking one fills the box on the client&rsquo;s
        page, already addressed to them, and you change whatever you like before it goes.
        A copy of what actually went is kept on their record either way.
      </p>

      <QuickMessages templates={templates} />
    </div>
  );
}
