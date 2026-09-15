import { NextResponse, type NextRequest } from "next/server";
import { emailConfigured, probeEmail } from "@/lib/messaging/email";
import { smsConfigured, probeSms } from "@/lib/messaging/sms";
import { hasAnthropicEnv, canConnectStripe } from "@/lib/env";
import { testModeReady } from "@/lib/payments/stripe";
import { probeClientId, probeClientIdAgainstKey, keyAccountName } from "@/lib/payments/connect";

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
/**
 * Which Stripe a key belongs to, from the only part of it that is not secret.
 *
 * Stripe puts the mode in the prefix — sk_test_, sk_live_, rk_live_ for a
 * restricted one — so this can be answered without reading a single character
 * of the key itself. Worth answering because the two behave identically right
 * up to the moment money is supposed to move: a deployment on test keys takes
 * real bookings, sends real confirmations, and quietly never takes a penny.
 */
function keyMode(key: string | undefined): "test" | "live" | "none" | "unrecognised" {
  if (!key) return "none";
  if (key.startsWith("sk_test_") || key.startsWith("rk_test_")) return "test";
  if (key.startsWith("sk_live_") || key.startsWith("rk_live_")) return "live";
  return "unrecognised";
}

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

  /*
   * Asked of Resend, not of the environment.
   *
   * `sendsMail` used to be the whole answer, and it only ever meant "two
   * variables are not empty". It said yes on the evening every send was failing
   * with "API key is invalid" — the one moment the check existed for.
   */
  const email = await probeEmail();

  /*
   * Asked of Twilio, for the same reason.
   *
   * Two ways to be configured and broken that reading the variables cannot
   * show: an account still on trial, which only texts numbers verified by hand
   * and stamps a line on every message; and a from-number that does texts but
   * not calls, or the reverse, which gives exactly half a product.
   */
  const sms = await probeSms();

  /*
   * Asked of Stripe, for the reason the two above are: "set" said yes on the
   * day a business pressed Connect and got a black page saying no application
   * matched.
   */
  const [clientIdAccepted, pairing, keyAccount] = await Promise.all([
    probeClientId(process.env.STRIPE_CONNECT_CLIENT_ID),
    /*
     * And whether the id and the key are the same Stripe's — the fault that
     * only showed itself after somebody had filled in Stripe's whole form.
     */
    probeClientIdAgainstKey(process.env.STRIPE_CONNECT_CLIENT_ID, process.env.STRIPE_SECRET_KEY),
    keyAccountName(process.env.STRIPE_SECRET_KEY),
  ]);
  const clientIdMatchesKey = pairing.matches;

  return NextResponse.json({
    /*
     * Which build is answering.
     *
     * Environment variables only reach a Vercel deployment when one is built,
     * so "I added the key and it still says missing" is usually a deployment
     * that predates the key rather than a key that did not save. Without this
     * there is no way to tell those apart from the outside, and the two have
     * completely different fixes.
     *
     * Null when deployed from the command line rather than from a push: there
     * is no commit for Vercel to name, and saying so is better than implying
     * the build is old.
     */
    deployment: {
      commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7) ?? null,
      branch: process.env.VERCEL_GIT_COMMIT_REF ?? null,
      environment: process.env.VERCEL_ENV ?? "not vercel",
    },
    /*
     * Both halves, because either one missing means no email leaves the
     * building — and the checklist only ever mentioned the API key, so the
     * sender address is exactly the one somebody would not have set.
     */
    email: {
      apiKey: Boolean(process.env.RESEND_API_KEY),
      from: Boolean(process.env.EMAIL_FROM),
      /** Both variables present. Necessary, and on its own not enough. */
      configured: emailConfigured(),
      /** Resend's own answer. Null means Resend could not be reached to ask. */
      keyAccepted: email.keyAccepted,
      senderDomain: email.senderDomain,
      senderVerified: email.senderVerified,
      /** Its prefix and length, which is not the key. */
      keyShape: email.keyShape,
      /** Why not, in words, when one of the above is false. */
      detail: email.detail,
      /** The only one of these worth reading on its own. */
      sendsMail:
        emailConfigured() && email.keyAccepted === true && email.senderVerified === true,
    },
    assistant: hasAnthropicEnv(),
    /*
     * Three keys, not one, because "payments" was a single boolean off the
     * secret key — and that is the half that gates the least.
     *
     * The secret key charges a card. The Connect client id is what lets a
     * business attach its own Stripe to ours at all; without it the connect
     * button sends somebody to Stripe's door and bounces them straight back,
     * which is how every business on here ended up with no connected account
     * while this line read "payments: true". The webhook secret is how we
     * hear that a payment succeeded, and without it a paid deposit never
     * lands on the booking.
     */
    payments: {
      secretKey: Boolean(process.env.STRIPE_SECRET_KEY),
      connectClientId: Boolean(process.env.STRIPE_CONNECT_CLIENT_ID),
      webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      /** Stripe's own answer about the client id. Null means it could not be asked. */
      clientIdAccepted,
      /** Whether the client id belongs to the same Stripe as the secret key. */
      clientIdMatchesKey,
      /** The name of the Stripe the secret key belongs to — a name, not the key. */
      keyAccount,
      /*
       * The last six characters of the client id, to hold up against the one
       * in Stripe's dashboard. A client id is not a secret — it sits in the
       * address bar of every Connect link — and "did the new one actually
       * reach the build" is otherwise unanswerable from outside.
       */
      clientIdEnds: process.env.STRIPE_CONNECT_CLIENT_ID?.trim().slice(-6) ?? null,
      /** Whether the value carries stray spaces or quotes from being pasted. */
      clientIdPadded: (process.env.STRIPE_CONNECT_CLIENT_ID ?? "") !== (process.env.STRIPE_CONNECT_CLIENT_ID ?? "").trim().replace(/^["']|["']$/g, ""),
      /** What Stripe answered when asked whether the id and key go together. */
      pairingSaid: pairing.said,
      /** The only one worth reading on its own: can a business connect today. */
      canConnect:
        canConnectStripe() && clientIdAccepted !== false && clientIdMatchesKey !== false,
      /*
       * Which Stripe the live keys are, and whether there is a sandbox beside
       * them for demos.
       *
       * The prefix and nothing else — "sk_test_" or "sk_live_" is the first
       * eight characters of a key and the only part of it that is not secret.
       * Worth reporting because a deployment quietly on test keys takes real
       * bookings and never takes a real deposit, and there is no other way to
       * tell that from outside.
       */
      mode: keyMode(process.env.STRIPE_SECRET_KEY),
      sandbox: {
        secretKey: Boolean(process.env.STRIPE_SECRET_KEY_TEST),
        connectClientId: Boolean(process.env.STRIPE_CONNECT_CLIENT_ID_TEST),
        webhookSecret: Boolean(process.env.STRIPE_WEBHOOK_SECRET_TEST),
        /** Whether a demo business can connect and be charged on test cards. */
        ready: testModeReady(),
      },
    },
    texts: {
      /** All three variables present. Necessary, and on its own not enough. */
      configured: smsConfigured(),
      /** Twilio's own answer. Null means Twilio could not be reached to ask. */
      credentialsAccepted: sms.credentialsAccepted,
      /** "trial" is the one that quietly ruins everything. */
      accountStatus: sms.accountStatus,
      numbers: sms.numbers,
      fromNumberOwned: sms.fromNumberOwned,
      /** The one sentence worth reading, or null when nothing is wrong. */
      detail: sms.detail,
      /** The only field worth reading on its own. */
      sends:
        smsConfigured() &&
        sms.credentialsAccepted === true &&
        sms.accountStatus !== "trial" &&
        sms.fromNumberOwned === true,
    },
    push: Boolean(process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY),
    supportStudio: Boolean(process.env.NEXT_PUBLIC_SUPPORT_SLUG),
  });
}
