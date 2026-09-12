import { NextResponse, type NextRequest } from "next/server";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { signState, newNonce, authoriseUrl } from "@/lib/payments/connect";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sends a business off to Stripe to connect its own account.
 *
 * The owner, not just anybody signed in: this decides where the business's
 * money lands, which is not a decision for whoever is on the front desk.
 */
export async function GET(request: NextRequest) {
  const clientId = process.env.STRIPE_CONNECT_CLIENT_ID;
  const secret = process.env.STRIPE_SECRET_KEY;

  if (!clientId || !secret) return back(request, "not-configured");

  let studio;
  try {
    ({ studio } = await requireStudio());
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (!(await isOwner())) return back(request, "owner-only");

  const state = signState({ studio: studio.id, nonce: newNonce(), at: Date.now() }, secret);

  return NextResponse.redirect(
    authoriseUrl({
      clientId,
      redirectUri: new URL("/api/stripe/connect/callback", request.url).toString(),
      state,
      email: studio.email,
      businessName: studio.name,
    }),
  );
}

function back(request: NextRequest, why: string) {
  const url = new URL("/settings", request.url);
  url.searchParams.set("stripe", why);
  return NextResponse.redirect(url);
}

/*
 * The same check the Meta connect flow makes, and for the same reason: this
 * decides where a business's money goes.
 */
async function isOwner(): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return false;

  const { data } = await supabase
    .from("studio_members")
    .select("role")
    .eq("user_id", user.id)
    .maybeSingle();

  return data?.role === "owner";
}
