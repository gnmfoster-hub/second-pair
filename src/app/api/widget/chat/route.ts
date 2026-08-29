import { NextResponse, type NextRequest } from "next/server";
import { runTurn } from "@/lib/engine/run";
import { hasAnthropicEnv } from "@/lib/env";

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
  let body: { studio?: string; session?: string; message?: string };
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
  if (!message) {
    return NextResponse.json({ error: "Empty message" }, { status: 400 });
  }
  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.json({ error: "Message too long" }, { status: 413 });
  }
  if (!/^[A-Za-z0-9_-]{16,64}$/.test(session)) {
    return NextResponse.json({ error: "Invalid session" }, { status: 400 });
  }
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
      message,
    });

    return NextResponse.json({
      reply: result.reply,
      paused: result.paused,
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
