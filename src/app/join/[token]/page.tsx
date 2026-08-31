import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Logo } from "@/components/Logo";

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
    return (
      <div className="flex min-h-screen items-center justify-center px-6 py-10">
        <div className="w-full max-w-sm">
          <Logo height={48} lockup="flush-right" />
          <h1 className="page-title mt-7">You have been invited</h1>
          <p className="hint mt-2">
            Sign in or create an account first, and you will be added to the team
            straight afterwards.
          </p>
          <Link
            href={`/login?next=${encodeURIComponent(`/join/${token}`)}`}
            className="btn-primary mt-6 w-full"
          >
            Continue
          </Link>
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
