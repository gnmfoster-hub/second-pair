import { NextResponse, type NextRequest } from "next/server";
import { requireStudio } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { signState, newNonce, authoriseUrl, CONNECT_NONCE_COOKIE } from "@/lib/payments/connect";
import { modeFor, secretFor, connectClientIdFor } from "@/lib/payments/stripe";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Sends a business off to Stripe to connect its own account.
 *
 * The owner, not just anybody signed in: this decides where the business's
 * money lands, which is not a decision for whoever is on the front desk.
 */
export async function GET(request: NextRequest) {
  let studio;
  let userId;
  try {
    ({ studio, userId } = await requireStudio());
  } catch {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  /*
   * Which Stripe this business belongs to.
   *
   * Read from the business rather than the deployment, so a demo can connect a
   * sandbox account and take Stripe's own test cards while every real business
   * on the same deployment stays live. Both halves have to match — a test
   * client id with a live secret connects nothing — so they are taken together
   * from one decision.
   */
  const mode = modeFor(studio);
  const clientId = connectClientIdFor(mode);
  const secret = secretFor(mode);

  if (!clientId || !secret) return back(request, "not-configured");

  /*
   * Whose account this is going to be.
   *
   * `?mine` is one of the team connecting their own, which is the only way a
   * salon that pays each person directly works at all: their money has to land
   * somewhere that is theirs. Anything else is the business's, which is the
   * owner's decision and unchanged.
   *
   * Deliberately no way to name somebody else. Stripe's onboarding asks for a
   * passport and a bank account, and neither of those is the owner's to hand
   * over — an owner who could start this "for" a stylist would be inviting her
   * to put her ID into a flow somebody else began, and the account would
   * answer to whoever finished it. Each person starts their own, or it does
   * not happen.
   */
  const mine = request.nextUrl.searchParams.has("mine");

  if (!mine && !(await isOwner())) return back(request, "owner-only");

  let artistId: string | undefined;
  let email = studio.email;
  let name = studio.name;

  if (mine) {
    const supabase = await createClient();
    const { data: me } = await supabase
      .from("artists")
      .select("id, name, email")
      .eq("studio_id", studio.id)
      .eq("user_id", userId)
      .maybeSingle();

    // Somebody with a login and no place in the diary has no takings of their
    // own, so there is nothing for an account of theirs to receive.
    if (!me) return back(request, "not-in-the-diary", "/settings/you");

    artistId = me.id as string;
    email = (me.email as string | null) ?? studio.email;
    name = me.name as string;
  }

  const nonce = newNonce();
  const state = signState(
    {
      studio: studio.id,
      ...(artistId ? { artist: artistId } : {}),
      nonce,
      at: Date.now(),
    },
    secret,
  );

  const away = NextResponse.redirect(
    authoriseUrl({
      clientId,
      redirectUri: new URL("/api/stripe/connect/callback", request.url).toString(),
      state,
      email,
      businessName: name,
    }),
  );

  // Ties the connection to this browser; the callback refuses anything else.
  away.cookies.set(CONNECT_NONCE_COOKIE, nonce, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 15 * 60,
  });

  return away;
}

function back(request: NextRequest, why: string, to = "/settings") {
  const url = new URL(to, request.url);
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
