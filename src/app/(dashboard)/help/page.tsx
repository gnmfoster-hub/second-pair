import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { Tickets } from "./Tickets";

export const metadata = { title: "Help — Second Pair" };

/**
 * Asking a person for help, and reading what they said back.
 *
 * The assistant in the corner answers most things instantly and knows how the
 * product works. This is for the rest: something is wrong, or something needs
 * setting up, and it wants a human who can actually change things.
 *
 * Everything said here stays in this business's own account. Nobody supporting
 * them goes looking through their inbox — they read what was written here,
 * which is the whole reason it exists.
 */
export default async function HelpPage() {
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const { data: tickets } = await supabase
    .from("support_tickets")
    .select("id, subject, status, created_at, updated_at, answered_at")
    .eq("studio_id", studio.id)
    .order("updated_at", { ascending: false });

  const ids = (tickets ?? []).map((t) => t.id);
  const { data: messages } = ids.length
    ? await supabase
        .from("support_messages")
        .select("id, ticket_id, author, body, created_at")
        .in("ticket_id", ids)
        .order("created_at")
    : { data: [] };

  return (
    <Tickets
      tickets={(tickets ?? []).map((t) => ({
        id: t.id,
        subject: t.subject,
        status: t.status as "open" | "answered" | "closed",
        createdAt: t.created_at,
        messages: (messages ?? [])
          .filter((m) => m.ticket_id === t.id)
          .map((m) => ({
            id: m.id,
            author: m.author as "owner" | "support",
            body: m.body,
            at: m.created_at,
          })),
      }))}
    />
  );
}
