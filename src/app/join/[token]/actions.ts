"use server";

import { createAdminClient } from "@/lib/supabase/admin";

export type JoinState = { error?: string; ok?: boolean };

/**
 * Make an account for somebody who was invited, and nothing else.
 *
 * Sign-up is invitation-only, which is deliberate — nobody talks their way
 * into the product without a conversation first. But the join page told an
 * invited stylist to "sign in or create an account", and there was nowhere to
 * create one: the login page has only sign in and forgot password. A person
 * invited to a salon they work at simply could not get in.
 *
 * The invite is the authorisation. A valid, unexpired, unused token is proof
 * somebody inside the business asked for this person specifically, which is a
 * better warrant than any sign-up form.
 *
 * The account is created already confirmed, on purpose. The ordinary path
 * would email them a confirmation link — and email is the one thing that may
 * not be working when a business first sets itself up, which would leave the
 * invited person stuck behind a message that never arrives. They are holding
 * an invite that was checked; a second proof by email adds nothing.
 */
export async function joinWithNewAccount(_prev: JoinState, fd: FormData): Promise<JoinState> {
  const token = String(fd.get("token") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const password = String(fd.get("password") ?? "");

  if (!token) return { error: "That link is missing something. Ask for a fresh one." };
  if (!email.includes("@")) return { error: "That does not look like an email address." };
  if (password.length < 8) return { error: "Use at least eight characters." };

  const db = createAdminClient();

  /*
   * Checked here rather than trusted from the page: this is the only thing
   * standing between a form on the internet and a new account.
   */
  const { data: invite } = await db
    .from("team_invites")
    .select("id, email, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  if (!invite || invite.accepted_at || new Date(invite.expires_at) < new Date()) {
    return {
      error: "That invitation has expired or has already been used. Ask them to send another.",
    };
  }

  /*
   * If the invite names an address, that is the address.
   *
   * Otherwise somebody holding a link meant for one person could make an
   * account under any email they liked, which is not what the person who sent
   * it agreed to.
   */
  if (invite.email && invite.email.toLowerCase() !== email) {
    return { error: `This invitation is for ${invite.email}. Use that address.` };
  }

  const { error } = await db.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });

  if (error) {
    // Already having an account is not a failure — it is the other door.
    if (/already registered|already been registered/i.test(error.message)) {
      return { error: "There is already an account on that email. Sign in instead." };
    }
    return { error: error.message };
  }

  return { ok: true };
}
