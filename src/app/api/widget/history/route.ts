import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

/**
 * The conversation so far, for a widget that has just been opened again.
 *
 * The chat kept nothing across a reload: the session id survives in the
 * browser, so the server happily carried on the same conversation — but the
 * customer saw an empty window with the greeting in it and re-asked what they
 * had already asked, while the assistant answered as though mid-conversation,
 * because it holds the whole transcript. Anybody who closed a tab, turned
 * their phone hard enough to reload it, or came back an hour later got that.
 *
 * The session key is the credential, exactly as it is on the chat endpoint —
 * a long random string the browser made and only that browser has. Nothing
 * here is guessable from the outside, and nothing is returned unless the
 * studio and the session match a conversation that already exists.
 */
export async function GET(request: NextRequest) {
  const studio = (request.nextUrl.searchParams.get("studio") ?? "").trim();
  const session = (request.nextUrl.searchParams.get("session") ?? "").trim();

  // The same shape the chat endpoint insists on, so a guessed key is no more
  // useful here than it is there.
  if (!studio || !/^[A-Za-z0-9_-]{16,64}$/.test(session)) {
    return NextResponse.json({ lines: [] });
  }

  const db = createAdminClient();

  const { data: business } = await db
    .from("studios")
    .select("id")
    .eq("slug", studio)
    .is("archived_at", null)
    .maybeSingle();

  if (!business) return NextResponse.json({ lines: [] });

  const { data: conversation } = await db
    .from("conversations")
    .select("id")
    .eq("studio_id", business.id)
    .eq("channel", "web")
    .eq("external_ref", session)
    .maybeSingle();

  if (!conversation) return NextResponse.json({ lines: [] });

  /*
   * Their words and the replies, newest sixty, oldest first.
   *
   * System notes are left out: "not answered automatically — the assistant has
   * already answered this sender six times today" is a line for the business's
   * inbox, not for the customer's chat window.
   */
  const { data: messages } = await db
    .from("messages")
    .select("role, content, created_at")
    .eq("conversation_id", conversation.id)
    .in("role", ["client", "assistant", "owner"])
    .order("created_at", { ascending: false })
    .limit(60);

  const lines = [...(messages ?? [])]
    .reverse()
    .filter((m) => (m.content ?? "").trim())
    .map((m) => ({
      // An owner's own reply reads as the business talking, which is what it
      // is — the customer was never told a person had taken over.
      from: m.role === "client" ? "client" : "studio",
      text: m.content as string,
      at: Date.parse(m.created_at as string) || Date.now(),
    }));

  return NextResponse.json({ lines });
}
