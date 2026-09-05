import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";
import { createAdminClient } from "@/lib/supabase/admin";
import { CreateAccount } from "./CreateAccount";

/**
 * Accepting an invitation.
 *
 * The link is the credential, so everything is checked server-side by the
 * accept_team_invite function: that the token exists, has not expired, has not
 * been used, and that somebody is signed in.
 *
 * Signing in first is deliberate. Creating an account here would mean guessing
 * at their email and handling a password on a page reached from a link — the
 * ordinary sign-up already does that properly, so this sends them there and
 * brings them back.
 */
export default async function JoinPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    /*
     * Who this was meant for, so the form can say so.
     *
     * Read with the service key because nobody is signed in yet, and the
     * invitation is the only thing identifying them. Nothing sensitive is
     * shown: an address they were already sent a link at.
     */
    const { data: invite } = await createAdminClient()
      .from("team_invites")
      .select("email, expires_at, accepted_at")
      .eq("token", token)
      .maybeSingle();

    const usable =
      invite && !invite.accepted_at && new Date(invite.expires_at) > new Date();

    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <Logo height={48} lockup="flush-right" />
          <h1 className="page-title mt-7">You have been invited</h1>

          {usable ? (
            <>
              <p className="hint mt-2">
                Choose a password and you are in. It takes a moment.
              </p>

              {/*
                * The account is made here rather than somewhere else.
                *
                * This used to say "sign in or create an account" and point at a
                * login page that has no way to create one — sign-up is
                * invitation-only. Somebody invited to a salon they work at
                * could not get in at all. The invitation is the permission,
                * which is a better warrant than any sign-up form.
                */}
              <CreateAccount token={token} invitedEmail={invite?.email ?? null} />

              <p className="hint mt-5 border-t border-border pt-4">
                Already use Second Pair?{" "}
                <Link
                  href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}
                  className="underline underline-offset-2"
                >
                  Sign in instead
                </Link>{" "}
                and you will be added straight away.
              </p>
            </>
          ) : (
            <>
              <p className="hint mt-2">
                That invitation has expired or has already been used. Links last
                fourteen days and work once &mdash; ask whoever sent it for a fresh one.
              </p>
              <Link href="/login" className="btn-primary mt-6 w-full">
                Go to sign in
              </Link>
            </>
          )}
        </div>
      </div>
    );
  }

  const { error } = await supabase.rpc("accept_team_invite", { invite_token: token });

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <Logo height={48} lockup="flush-right" />
          <h1 className="page-title mt-7">That invitation has expired</h1>
          <p className="hint mt-2">
            Links last fourteen days and work once. Ask whoever sent it for a fresh one.
          </p>
          <Link href="/" className="btn-ghost mt-6 w-full">
            Go to your diary
          </Link>
        </div>
      </div>
    );
  }

  redirect("/");
}
