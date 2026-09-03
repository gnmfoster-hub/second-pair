import { NextResponse, type NextRequest } from "next/server";
import { emailConfigured } from "@/lib/messaging/email";
import { hasAnthropicEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Which pieces are actually plugged in on the live site.
 *
 * Setting this up means putting keys into three or four different dashboards,
 * and until now the only way to find out whether one of them had taken was to
 * do the thing it enables and see if it worked — send a real password reset,
 * take a real deposit. That is a bad way to learn that a key was pasted with a
 * trailing space.
 *
 * Booleans only, and never a value: this says that a key is present, never
 * what it is. Behind the same secret as the scheduled job, because even the
 * shape of what is and is not configured is nobody's business but ours.
 */
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "CRON_SECRET is not set" }, { status: 503 });
  }

  const provided =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("key");

  if (provided !== secret) {
    return NextResponse.json({ error: "Not authorised" }, { status: 401 });
  }

  return NextResponse.json({
    /*
     * Both halves, because either one missing means no email leaves the
     * building — and the checklist only ever mentioned the API key, so the
     * sender address is exactly the one somebody would not have set.
     */
    email: {
      apiKey: Boolean(process.env.RESEND_API_KEY),
      from: Boolean(process.env.EMAIL_FROM),
      sendsMail: emailConfigured(),
    },
    assistant: hasAnthropicEnv(),
    payments: Boolean(process.env.STRIPE_SECRET_KEY),
    texts: Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN),
    push: Boolean(process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    supportStudio: Boolean(process.env.NEXT_PUBLIC_SUPPORT_SLUG),
  });
}
