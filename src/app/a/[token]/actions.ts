"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { validSignature, isTypedSignature } from "@/lib/forms/blocks";

export type SignState = { error?: string; done?: boolean };

/**
 * Signing the agreement.
 *
 * Runs as the service role, because whoever is signing has no account and never
 * will — the token is the whole of their authority, exactly as on a consent
 * form. So everything that matters is re-read from the stored row and nothing
 * is trusted from the page: the page on their screen is advisory, and the server
 * is not.
 *
 * What comes from the browser: the token, the tick, an email address, a name and
 * a signature. What does not: the terms, the version, the figures, the date, or
 * who the business is. Those are already on the row, frozen at the moment it was
 * sent, which is the only reason a signature on it means anything.
 */
export async function signAgreement(_prev: SignState, fd: FormData): Promise<SignState> {
  const token = String(fd.get("token") ?? "").trim();
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) {
    return { error: "This link is not valid. Ask us to send it again." };
  }

  const db = createAdminClient();

  const { data: agreement, error: read } = await db
    .from("agreements")
    .select("*")
    .eq("token", token)
    .maybeSingle();

  /*
   * The table not existing is not an error anybody reading this can act on.
   *
   * It means the migration has not been run, which is our job and not theirs.
   * Said as plainly as it can be without asking a plasterer to think about a
   * database.
   */
  if (read && /relation|does not exist|schema cache/i.test(read.message)) {
    return { error: "We cannot take a signature just yet. Tell us and we will sort it out." };
  }
  if (!agreement) return { error: "This agreement is no longer available. Ask us for a new link." };
  if (agreement.void_at) {
    return { error: "This agreement was withdrawn. Ask us for the current one." };
  }
  /* Already signed is success rather than failure: there is nothing left to do. */
  if (agreement.signed_at) return { done: true };

  /*
   * The tick is not a formality.
   *
   * A sixty-day notice period is enforceable between businesses if it was
   * clearly put in front of somebody before they signed, and a tick that says
   * "I have read it" is a large part of what makes that true. So it is refused
   * here rather than only in the browser, where it can be turned off.
   */
  if (fd.get("agreed") !== "on") {
    return { error: "Please tick to say you have read it and agree to it." };
  }

  const name = String(fd.get("signer_name") ?? "").trim().slice(0, 120);
  if (name.length < 2) return { error: "Please put the name of whoever is signing." };

  const signature = String(fd.get("signature") ?? "");
  /*
   * Drawn or typed, and checked the same way the consent form checks it: the
   * right prefix, long enough not to be an empty canvas, small enough not to be
   * somebody's photograph, and base64 throughout.
   */
  if (!signature || (!validSignature(signature) && !isTypedSignature(signature))) {
    return { error: "Please sign in the box, or type your name using the link under it." };
  }

  const email = String(fd.get("signer_email") ?? "").trim().slice(0, 200);

  /*
   * Where from, out of the headers rather than out of a field.
   *
   * A browser can send whatever it likes in a form. The point of recording this
   * at all is that it is evidence, and evidence somebody can type is not
   * evidence. Same for the user agent, which is the thing an owner can hold
   * against their memory of the day — "on an iPhone" means something to them
   * where four numbers do not.
   */
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "")
    .split(",")[0]
    .trim()
    .slice(0, 64);

  const now = new Date().toISOString();

  /*
   * `.is("signed_at", null)` is what actually stops a second signature.
   *
   * The read above can be beaten by two tabs pressing at the same moment, so the
   * database settles it instead: the update only matches a row nobody has signed,
   * and an empty result means somebody else got there first. The consent form
   * does this with `.neq("status", "signed")`; there is no status column here, so
   * the timestamp is the flag.
   *
   * Nothing about the money, the terms or the version is written. Those were
   * settled when it was sent, and a signature that could change them would be
   * worth nothing.
   */
  const { data: saved, error } = await db
    .from("agreements")
    .update({
      signed_at: now,
      signer_name: name,
      signer_email: email || null,
      signature,
      signer_ip: ip || null,
      signer_agent: (h.get("user-agent") ?? "").slice(0, 300) || null,
      updated_at: now,
    })
    .eq("id", agreement.id)
    .is("signed_at", null)
    .select("id");

  if (error) {
    return { error: "It did not save. Check your signal and press Agree and sign again." };
  }
  /* Somebody else signed it between the read and the write. Still done. */
  if (!saved?.length) return { done: true };

  return { done: true };
}

/**
 * Noting that somebody has actually looked at it.
 *
 * Called from the browser rather than when the page renders, because WhatsApp,
 * iMessage and Outlook all fetch a link to build a preview — so a write on
 * render recorded the mail client opening it, and the field became useless for
 * the one thing it is for, which is knowing whether to chase.
 *
 * Only ever moves an unopened agreement to opened, and never throws: nothing
 * about a visitor's experience should depend on this working.
 */
export async function markAgreementOpened(token: string): Promise<void> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return;
  try {
    const db = createAdminClient();
    await db
      .from("agreements")
      .update({ opened_at: new Date().toISOString() })
      .eq("token", token)
      .is("opened_at", null)
      .is("signed_at", null);
  } catch {
    /* A missing table, or no signal. Neither is worth a word to the reader. */
  }
}
