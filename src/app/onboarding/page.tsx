import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Mark } from "@/components/Logo";
import { signOut } from "@/app/(dashboard)/actions";

/**
 * Somebody signed in who does not belong to a business.
 *
 * This used to offer a form for creating one, and that form has never worked:
 * the row-level policy on studios required the person inserting it to already
 * be a member of it, which nobody is before it exists. Anybody who reached
 * this page filled it in and watched it fail.
 *
 * It could be made to work, and should not be. Sign-up is invitation-only on
 * purpose — every business is set up by somebody who has spoken to the owner,
 * and a page that quietly let anybody with a login create one would undo that
 * without anybody deciding to.
 *
 * So it says what has actually happened. Almost everybody here is a member of
 * staff whose invitation did not finish, and the thing they need is the link
 * again, not a form.
 */
export default async function OnboardingPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  /*
   * Anybody who already has a business is not signing up.
   *
   * This page only ever checked that somebody was signed in, so an owner who
   * arrived here with a business already made — which is now every owner,
   * because they are all created in the back office — would be invited to make
   * a second one. Filling it in gave them two, and the app picks the first
   * membership it finds, so they could well end up looking at the empty one
   * with their real business nowhere in sight.
   */
  const { data: already, error: cannotTell } = await supabase
    .from("studio_members")
    .select("studio_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  /*
   * Not being able to tell is not the same as not having one.
   *
   * This guard exists to stop an owner creating a second business, and it was
   * written discarding the error — so the one moment the check matters most, a
   * database that will not answer, was the moment it silently passed. Sending
   * them home is the safe way to be wrong: somebody who genuinely has no
   * business is bounced straight back here by requireStudio.
   */
  if (cannotTell || already) redirect("/");

  return (
    <div className="grid min-h-screen place-items-center px-6 py-12">
      <div className="w-full max-w-md">
        <Mark className="size-9" />
        <h1 className="page-title mt-4">Your account is not attached to a business</h1>

        <p className="hint mt-2">
          You are signed in, but this login has not been added to anybody&rsquo;s
          business yet &mdash; so there is nothing here to show you.
        </p>

        <div className="card mt-6 p-5">
          <div className="text-sm font-medium">If you were invited</div>
          <p className="hint mt-1.5">
            Open the link you were sent again. It adds you as soon as you are signed
            in, which you now are.
          </p>

          <div className="mt-4 border-t border-border pt-4 text-sm font-medium">
            If you are setting up a new business
          </div>
          <p className="hint mt-1.5">
            Second Pair is set up with you rather than signed up for &mdash; get in
            touch and we will have it running the same day.
          </p>
        </div>

        <form action={signOut} className="mt-5">
          <button type="submit" className="btn-ghost w-full">
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}
