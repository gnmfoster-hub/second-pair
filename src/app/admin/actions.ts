"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient } from "@/lib/supabase/admin";
import { isPlatformAdmin } from "@/lib/platform";
import { siteOrigin } from "@/lib/origin";

export type Result = { ok?: true; error?: string; note?: string; link?: string };

/**
 * Every action here runs as the service role, which ignores row-level security.
 *
 * So each one begins by asking the server who is calling. Not the page that
 * rendered the button, not a hidden field, not a header — the session, every
 * time. A single missing check here is every business on the platform.
 */
async function guard(): Promise<Result | null> {
  return (await isPlatformAdmin()) ? null : { error: "Not allowed." };
}

const slugify = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "business";

/**
 * Set a business up: the owner's login, the business, and the link that lets
 * them in.
 *
 * This is what replaces the sign-up form. Nobody arrives on their own — every
 * business is created here, deliberately, by somebody who has spoken to them.
 *
 * The owner is created without a usable password. They get a link that lets
 * them choose one, which also proves the address works, so there is no separate
 * confirmation email and no account sitting unverified on a typo.
 */
export async function createBusiness(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const vertical = String(fd.get("vertical") ?? "general").trim();

  if (!name) return { error: "The business needs a name." };
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: "That email does not look right." };

  const db = createAdminClient();

  /*
   * A slug nobody else has.
   *
   * It ends up in the widget URL the business puts on its own website, so a
   * collision is not a database error, it is two businesses sharing an inbox.
   */
  let slug = slugify(name);
  const { data: taken } = await db.from("studios").select("slug").like("slug", `${slug}%`);
  if (taken?.some((s) => s.slug === slug)) {
    slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
  }

  // Does this person already have a login? Two businesses under one email is
  // legitimate — somebody with a salon and a barber — so this is not an error.
  const { data: existing } = await db.auth.admin.listUsers();
  let userId = existing?.users.find((u) => u.email?.toLowerCase() === email)?.id ?? null;
  let created = false;

  if (!userId) {
    const { data, error } = await db.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { full_name: String(fd.get("owner") ?? "").trim() || null },
    });
    if (error) return { error: `Could not create the login: ${error.message}` };
    userId = data.user.id;
    created = true;
  }

  const { data: studio, error: studioError } = await db
    .from("studios")
    .insert({ name, slug, vertical })
    .select("id, slug")
    .single();

  if (studioError) {
    // Do not leave an orphaned login behind if the business could not be made.
    if (created && userId) await db.auth.admin.deleteUser(userId);
    return { error: `Could not create the business: ${studioError.message}` };
  }

  const { error: memberError } = await db
    .from("studio_members")
    .insert({ studio_id: studio.id, user_id: userId, role: "owner" });

  if (memberError) return { error: `Created, but could not attach the owner: ${memberError.message}` };

  const origin = await siteOrigin();
  const { data: link } = await db.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/auth/callback?next=/onboarding` },
  });

  revalidatePath("/admin");
  return {
    ok: true,
    note: created
      ? `${name} is set up. Send them the link below to choose a password.`
      : `${name} is set up under an existing login, so they sign in as they already do.`,
    link: created ? (link?.properties?.action_link ?? undefined) : undefined,
  };
}

/**
 * A fresh link for somebody who cannot get in.
 *
 * Generated rather than emailed, so it can be handed over on the phone while
 * they are on it — which is the situation this is for, and it does not depend
 * on our email being set up or their spam filter being kind.
 */
export async function resetLink(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  if (!email) return { error: "No email on that owner." };

  const db = createAdminClient();
  const origin = await siteOrigin();
  const { data, error } = await db.auth.admin.generateLink({
    type: "recovery",
    email,
    options: { redirectTo: `${origin}/auth/callback?next=/reset-password` },
  });

  if (error) return { error: error.message };
  return { ok: true, note: `A link for ${email}. It works once.`, link: data?.properties?.action_link };
}

/**
 * Delete a business and everything belonging to it.
 *
 * Irreversible, and it takes real customers' conversations with it, so it asks
 * for the name to be typed out. A confirmation somebody can dismiss by reflex
 * is not a confirmation.
 *
 * The owner's login is left alone. It may belong to another business, and a
 * person is not a business.
 */
export async function deleteBusiness(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("id") ?? "");
  const typed = String(fd.get("confirm") ?? "").trim();

  const db = createAdminClient();
  const { data: studio } = await db.from("studios").select("name").eq("id", id).maybeSingle();
  if (!studio) return { error: "That business no longer exists." };

  if (typed !== studio.name) {
    return { error: `Type the name exactly — ${studio.name} — to delete it.` };
  }

  const { error } = await db.from("studios").delete().eq("id", id);
  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true, note: `${studio.name} is gone, with everything belonging to it.` };
}

/**
 * What a customer is on, what they pay, and how many people they may have.
 *
 * The seat limit is the one with teeth: without it an owner adds their whole
 * team and the price stays the same, which is not a plan, it is a donation. It
 * is checked where somebody is added rather than here, so raising it takes
 * effect immediately and lowering it never locks anybody out of a person they
 * already have.
 */
export async function saveAccount(_prev: Result, fd: FormData): Promise<Result> {
  const denied = await guard();
  if (denied) return denied;

  const id = String(fd.get("id") ?? "");
  if (!id) return { error: "No business." };

  const pounds = String(fd.get("price") ?? "").trim();
  const pence = pounds === "" ? 0 : Math.round(Number(pounds) * 100);
  if (!Number.isFinite(pence) || pence < 0) return { error: "That price does not look right." };

  const seatsRaw = String(fd.get("seats") ?? "").trim();
  const seats = seatsRaw === "" ? null : Number(seatsRaw);
  if (seats !== null && (!Number.isInteger(seats) || seats < 1)) {
    return { error: "Seats must be a whole number, or blank for no limit." };
  }

  const status = String(fd.get("status") ?? "trial");
  if (!["trial", "active", "overdue", "paused", "closed"].includes(status)) {
    return { error: "Unknown status." };
  }

  const started = String(fd.get("started") ?? "").trim() || null;

  /*
   * Channels are entitlements, like seats.
   *
   * The web widget is always on: it costs nothing extra to run and a business
   * without it has nothing at all. Everything else is something somebody agreed
   * to, and can be charged for differently.
   */
  const channels = ["web", ...fd.getAll("channel").map(String)].filter(
    (c, i, all) => all.indexOf(c) === i,
  );

  const db = createAdminClient();
  const { error } = await db
    .from("studios")
    .update({
      channels_allowed: channels,
      plan: String(fd.get("plan") ?? "").trim() || null,
      plan_pence: pence,
      seat_limit: seats,
      account_status: status,
      billing_started_on: started,
      account_note: String(fd.get("note") ?? "").trim() || null,
    })
    .eq("id", id);

  if (error) return { error: error.message };

  revalidatePath("/admin");
  return { ok: true, note: "Saved." };
}
