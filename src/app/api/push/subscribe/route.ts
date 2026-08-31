import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireStudio } from "@/lib/studio";

export const runtime = "nodejs";

/**
 * Registering a device for notifications.
 *
 * Behind the session, so a subscription can only ever be attached to a studio
 * the caller actually belongs to. The endpoint is unique, so the same browser
 * subscribing twice updates its row rather than earning a second copy of every
 * alert.
 */
export async function POST(request: NextRequest) {
  const { studio, userId } = await requireStudio();
  const supabase = await createClient();

  let body: { subscription?: PushSubscriptionJSON; label?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return NextResponse.json({ error: "Incomplete subscription" }, { status: 400 });
  }

  const { error } = await supabase.from("push_subscriptions").upsert(
    {
      studio_id: studio.id,
      user_id: userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      label: (body.label ?? "").slice(0, 60) || null,
    },
    { onConflict: "endpoint" },
  );

  if (error) {
    console.error("[push/subscribe]", error.message);
    return NextResponse.json({ error: "Could not save that." }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

/** Turning notifications off on this device. */
export async function DELETE(request: NextRequest) {
  await requireStudio();
  const supabase = await createClient();

  const endpoint = request.nextUrl.searchParams.get("endpoint");
  if (!endpoint) return NextResponse.json({ error: "No endpoint" }, { status: 400 });

  // RLS keeps this to the caller's own studio.
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint);
  return NextResponse.json({ ok: true });
}
