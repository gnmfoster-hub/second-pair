import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";
import { subjectAccessDocument, type SubjectRecord } from "@/lib/subjectAccess";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A copy of everything held about one person, as a file.
 *
 * Somebody can ask a business for this and the business has a month to
 * provide it. There was no way to produce one, so a salon receiving that
 * request had to go through a database by hand or refuse.
 *
 * Scoped to the studio of whoever is signed in, and read through their own
 * session rather than the service key: this hands over a complete record of a
 * person, and it must be impossible to fetch one belonging to another
 * business by guessing an id.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const { studio } = await requireStudio();
  const supabase = await createClient();

  const { data: contact, error } = await supabase
    .from("contacts")
    .select("name, phone, email, instagram_handle, marketing_consent, notes, alert, created_at")
    .eq("id", id)
    .eq("studio_id", studio.id)
    .maybeSingle();

  if (error || !contact) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, channel, created_at")
    .eq("studio_id", studio.id)
    .eq("contact_id", id)
    .order("created_at");

  const convIds = (conversations ?? []).map((c) => c.id);
  const { data: messages } = convIds.length
    ? await supabase
        .from("messages")
        .select("conversation_id, role, content, created_at")
        .in("conversation_id", convIds)
        .order("created_at")
    : { data: [] };

  /*
   * Their appointments, reached both ways.
   *
   * An appointment typed into the diary carries the client on the row. One the
   * assistant booked does not — it is joined up through the enquiry — so
   * asking by contact alone found none of them, and somebody who had booked
   * through the assistant a dozen times received a letter saying "APPOINTMENTS:
   * there are none recorded" while the salon had every one of them in the
   * diary. An answer to a legal request that is confidently untrue is worse
   * than a slow one.
   */
  const columns = "id, starts_at, ends_at, type, cancelled_at, notes, artists(name)";

  const { data: enquiries } = convIds.length
    ? await supabase.from("enquiries").select("id").in("conversation_id", convIds)
    : { data: [] };

  const enquiryIds = (enquiries ?? []).map((e) => e.id);

  const [{ data: typedIn }, { data: throughTheAssistant }] = await Promise.all([
    supabase.from("bookings").select(columns).eq("contact_id", id),
    enquiryIds.length
      ? supabase.from("bookings").select(columns).in("enquiry_id", enquiryIds)
      : Promise.resolve({ data: [] as never[] }),
  ]);

  // The same appointment can arrive down both routes.
  const bookings = [...(typedIn ?? []), ...(throughTheAssistant ?? [])]
    .filter((b, i, all) => all.findIndex((other) => other.id === b.id) === i)
    .sort((a, b) => String(a.starts_at).localeCompare(String(b.starts_at)));

  const record: SubjectRecord = {
    business: studio.name,
    askedOn: new Date(),
    contact,
    conversations: (conversations ?? []).map((c) => ({
      channel: c.channel,
      created_at: c.created_at,
      messages: (messages ?? [])
        .filter((m) => m.conversation_id === c.id)
        .map((m) => ({ role: m.role, content: m.content, created_at: m.created_at })),
    })),
    bookings: bookings.map((b) => ({
      starts_at: b.starts_at,
      ends_at: b.ends_at,
      type: b.type,
      with: (b.artists as unknown as { name: string } | null)?.name ?? null,
      cancelled_at: b.cancelled_at,
      notes: b.notes,
    })),
  };

  const document = subjectAccessDocument(record, studio.timezone);
  const named = (contact.name ?? "this-person").replace(/\W+/g, "-").toLowerCase();

  return new NextResponse(document, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      // Downloaded rather than displayed: it is a document to send on, and it
      // should not sit in a browser tab behind somebody's back.
      "Content-Disposition": `attachment; filename="what-we-hold-about-${named}.txt"`,
      "Cache-Control": "no-store",
    },
  });
}
