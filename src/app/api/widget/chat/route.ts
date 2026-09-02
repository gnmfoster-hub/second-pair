import { NextResponse, type NextRequest } from "next/server";
import { runTurn } from "@/lib/engine/run";
import { hasAnthropicEnv } from "@/lib/env";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const MAX_MESSAGE_LENGTH = 2000;

/**
 * Crude per-session throttle. In-memory, so it resets on deploy and does not
 * span instances — enough to stop a stuck client hammering the model, not a
 * substitute for a real rate limiter before this is public.
 */
const lastSeen = new Map<string, number>();
const MIN_GAP_MS = 1500;

function throttled(key: string): boolean {
  const now = Date.now();
  const previous = lastSeen.get(key);
  lastSeen.set(key, now);
  if (lastSeen.size > 5000) lastSeen.clear();
  return previous != null && now - previous < MIN_GAP_MS;
}

export async function POST(request: NextRequest) {
  let body: {
    studio?: string;
    session?: string;
    message?: string;
    media?: string[];
    with?: string | null;
    test?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const studio = String(body.studio ?? "").trim();
  const session = String(body.session ?? "").trim();
  const message = String(body.message ?? "").trim();

  if (!studio || !session) {
    return NextResponse.json({ error: "Missing studio or session" }, { status: 400 });
  }
  const media = Array.isArray(body.media)
    ? body.media.filter((m): m is string => typeof m === "string").slice(0, 6)
    : [];

  if (!message && media.length === 0) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "Message too long" }, { status: 413 });
  }
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(session)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }
  /*
   * Is this the owner rehearsing, or a real customer?
   *
   * This can only ever be believed from somebody signed in as a member of the
   * business being messaged. Taking the browser's word for it would let a
   * stranger mark their own enquiry as a test and hide it from the owner —
   * which is a way to make a complaint disappear.
   */
  const isTest = body.test === true ? await isOwnerOf(studio) : false;

  const forArtist =
    typeof body.with === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.with)
      ? body.with
      : null;

  if (throttled(`${studio}:${session}`)) {
    return NextResponse.json({ error: "Slow down" }, { status: 429 });
  }

  if (!hasAnthropicEnv()) {
    return NextResponse.json(
      {
        error:
          "The assistant is not connected yet. Add ANTHROPIC_API_KEY to .env.local and restart.",
      },
      { status: 503 },
    );
  }

  try {
    const result = await runTurn({
      studioSlug: studio,
      sessionKey: session,
      channel: "web",
      origin: request.nextUrl.origin,
      message: message || "(sent an image)",
      mediaUrls: media,
      // Which person this link belongs to. Validated as a uuid rather than
      // trusted: it arrives from the browser, and it decides whose diary gets
      // booked.
      forArtistId: forArtist,
      isTest,
    });

    return NextResponse.json({
      reply: result.reply,
      paused: result.paused,
      /*
       * What it did, so the widget can draw it instead of asking the customer
       * to type the answer back. Nothing here grants the browser anything: it
       * describes decisions already written to the database, and a tapped time
       * comes back as an ordinary message and is booked the ordinary way.
       */
      moments: result.moments,
    });
  } catch (error) {
    // The studio slug and any database detail stay server-side.
    console.error("[widget/chat]", error);
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 },
    );
  }
}

/**
 * Whether the caller is signed in as a member of this business.
 *
 * Uses the session client rather than the admin one, so row-level security
 * does the checking: a non-member simply sees no membership row.
 */
async function isOwnerOf(slug: string): Promise<boolean> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;

    const { data } = await supabase
      .from("studios")
      .select("id")
      .eq("slug", slug)
      .maybeSingle();

    return Boolean(data);
  } catch {
    return false;
  }
}
