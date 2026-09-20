import Link from "next/link";
import { requireOwner } from "@/lib/studio";
import { createClient } from "@/lib/supabase/server";
import { verticalPack } from "@/lib/verticals";
import { startersFor } from "@/lib/forms/starters";
import { cleanBlocks } from "@/lib/forms/blocks";
import { FormEditor } from "./FormEditor";
import { StarterPicker } from "./StarterPicker";

export const dynamic = "force-dynamic";

/**
 * The business's forms: consents, questionnaires, waivers and quotes.
 *
 * Starts with ready-made forms for this trade, because a blank builder is a
 * job that never gets done. Each is copied in and edited, so the wording
 * becomes the business's own.
 */
export default async function FormsSettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ edit?: string; new?: string }>;
}) {
  const { studio } = await requireOwner();
  const { edit, new: adding } = await searchParams;
  const supabase = await createClient();

  const { data: templates, error } = await supabase
    .from("form_templates")
    .select("id, name, kind, blocks, starter, active, updated_at")
    .eq("studio_id", studio.id)
    .eq("active", true)
    .order("sort_order")
    .order("created_at");

  if (error) {
    return (
      <section className="card p-5">
        <h2 className="section-title">Forms</h2>
        <p className="hint mt-2 max-w-prose">
          Consent forms, health questionnaires, waivers and quotes that customers fill in and
          sign on their own phone. This needs a database update before it can be used, and it is on
          your list.
        </p>
      </section>
    );
  }

  const pack = verticalPack(studio.vertical);
  const { suggested, others } = startersFor(pack);
  const have = new Set((templates ?? []).map((t) => t.starter).filter(Boolean));
  const editing = edit ? (templates ?? []).find((t) => t.id === edit) : null;

  if (editing || adding) {
    return (
      <FormEditor
        template={
          editing
            ? {
                id: editing.id as string,
                name: editing.name as string,
                kind: editing.kind as string,
                blocks: cleanBlocks(editing.blocks),
              }
            : null
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <section className="card p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="section-title">Your forms</h2>
            <p className="hint mt-1 max-w-prose">
              Send them from a customer&rsquo;s record, or to several people at once. They fill
              them in and sign on their own phone, and the signed copy is kept with their record.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link href="/clients/forms" className="btn border border-border text-sm">
              Send to several
            </Link>
            <Link href="/settings/forms?new=1" className="btn bg-accent text-sm text-on-accent">
              Write a new form
            </Link>
          </div>
        </div>

        {templates && templates.length > 0 ? (
          <ul className="mt-4 divide-y divide-border">
            {templates.map((t) => {
              const blocks = cleanBlocks(t.blocks);
              const questions = blocks.filter((b) => b.type !== "text" && b.type !== "signature").length;
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <div className="font-medium">{t.name}</div>
                    <div className="hint text-xs">
                      {questions} question{questions === 1 ? "" : "s"}
                      {blocks.some((b) => b.type === "signature") ? " · signed" : ""} · {t.kind}
                    </div>
                  </div>
                  <Link href={`/settings/forms?edit=${t.id}`} className="btn border border-border text-sm">
                    Edit
                  </Link>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="hint mt-4">No forms yet. Start from one below.</p>
        )}
      </section>

      <StarterPicker
        trade={pack.label}
        suggested={suggested.map((s) => ({ key: s.key, name: s.name, blurb: s.blurb, added: have.has(s.key) }))}
        others={others.map((s) => ({ key: s.key, name: s.name, blurb: s.blurb, added: have.has(s.key) }))}
      />

      <p className="hint px-1 text-xs">
        The ready-made wording is a starting point, not legal or medical advice. Read each form and
        change it to match how you work before you send it.
      </p>
    </div>
  );
}
