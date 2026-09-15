"use server";

import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";
import { readAnswers, whatIsMissing, needsSignature, cleanBlocks } from "@/lib/forms/blocks";

export type SignState = { error?: string; missing?: string[]; done?: boolean };

/**
 * The customer handing their form back.
 *
 * No login: the long random token in the address is the only credential, and
 * it only ever opens this one form. Everything is read back from the stored
 * copy — the questions, whether it has already been signed, whether the link
 * has run out — so the form on their screen is advisory and the server is not.
 *
 * Once signed it cannot be signed again or changed. A consent that could be
 * quietly re-submitted is not a record of anything.
 */
export async function submitForm(_prev: SignState, fd: FormData): Promise<SignState> {
  const token = String(fd.get("token") ?? "");
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return { error: "This link is not right. Ask for a new one." };

  const db = createAdminClient();
  const { data: form } = await db
    .from("client_forms")
    .select("id, studio_id, contact_id, blocks, status, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!form) return { error: "This form is no longer available. Ask for a new link." };
  if (form.status === "signed") return { done: true };
  if (form.status === "void") return { error: "This form was withdrawn. Ask for a new link." };
  if (form.expires_at && Date.parse(form.expires_at as string) < Date.now()) {
    return { error: "This link has run out. Ask for a new one." };
  }

  const blocks = cleanBlocks(form.blocks);
  const answers = readAnswers(blocks, (key) => {
    const v = fd.get(key);
    return typeof v === "string" ? v : null;
  });
  const signing = {
    name: String(fd.get("signer_name") ?? "").trim().slice(0, 120),
    signature: String(fd.get("signature") ?? "") || null,
  };

  const missing = whatIsMissing(blocks, answers, needsSignature(blocks) ? signing : undefined);
  if (missing.length) return { missing };

  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? h.get("x-real-ip") ?? "").split(",")[0].trim().slice(0, 64);

  const { data: saved, error } = await db
    .from("client_forms")
    .update({
      answers,
      status: "signed",
      signed_at: new Date().toISOString(),
      signer_name: needsSignature(blocks) ? signing.name : null,
      signature: needsSignature(blocks) ? signing.signature : null,
      signer_ip: ip || null,
      signer_agent: (h.get("user-agent") ?? "").slice(0, 300) || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", form.id)
    .neq("status", "signed")
    .select("id");

  if (error) return { error: "It did not save. Check your signal and press Submit again." };
  if (!saved?.length) return { done: true };

  return { done: true };
}
