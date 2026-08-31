import { createClient } from "@/lib/supabase/server";

/**
 * Whether the person signed in may message customers.
 *
 * Owners always can. Staff can unless the owner has said otherwise — reading a
 * thread and writing to a customer in the business's name are different
 * things, and messaging is the only thing in here that reaches the outside
 * world under the business's name.
 *
 * One copy, because two would drift and the lenient one would win.
 */
export async function canMessage(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("studio_members")
    .select("role, can_message")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!data) return false;
  return data.role === "owner" || data.can_message !== false;
}
