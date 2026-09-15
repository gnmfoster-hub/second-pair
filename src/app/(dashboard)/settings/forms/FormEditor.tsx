"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useEffect, useState } from "react";
import { saveTemplate, retireTemplate, type FormActionState } from "../../formActions";
import { BLOCK_TYPES, blockId, type Block, type BlockType } from "@/lib/forms/blocks";

const KINDS = [
  { value: "consent", label: "Consent" },
  { value: "questionnaire", label: "Questionnaire" },
  { value: "waiver", label: "Waiver" },
  { value: "quote", label: "Quote" },
  { value: "other", label: "Other" },
];

/**
 * Writing a form, one block at a time.
 *
 * A list rather than a canvas: each block is its wording, its kind, whether
 * it must be answered, and up/down/remove. That is everything a consent form
 * needs, and it works the same with a thumb on a phone as with a mouse.
 */
export function FormEditor({
  template,
}: {
  template: { id: string; name: string; kind: string; blocks: Block[] } | null;
}) {
  const router = useRouter();
  const [state, action, pending] = useActionState<FormActionState, FormData>(saveTemplate, {});
  const [retired, retire] = useActionState<FormActionState, FormData>(retireTemplate, {});
  const [name, setName] = useState(template?.name ?? "");
  const [kind, setKind] = useState(template?.kind ?? "consent");
  const [blocks, setBlocks] = useState<Block[]>(
    template?.blocks ?? [
      { id: blockId(), type: "text", label: "Please answer honestly. Your answers are kept privately with your record." },
      { id: blockId(), type: "signature", label: "Signature", required: true },
    ],
  );

  useEffect(() => {
    if (state.ok || retired.ok) router.push("/settings/forms");
  }, [state.ok, retired.ok, router]);

  const change = (id: string, patch: Partial<Block>) =>
    setBlocks((all) => all.map((b) => (b.id === id ? { ...b, ...patch } : b)));
  const move = (i: number, by: number) =>
    setBlocks((all) => {
      const j = i + by;
      if (j < 0 || j >= all.length) return all;
      const copy = [...all];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return copy;
    });
  const add = (type: BlockType) => {
    const block: Block = {
      id: blockId(),
      type,
      label: type === "signature" ? "Signature" : "",
      ...(type === "choice" ? { options: ["", ""] } : {}),
      ...(type === "agree" || type === "signature" ? { required: true } : {}),
    };
    setBlocks((all) => {
      // The signature belongs at the end, and new questions above it.
      const at = all.findIndex((b) => b.type === "signature");
      if (type === "signature" || at < 0) return type === "signature" && at >= 0 ? all : [...all, block];
      return [...all.slice(0, at), block, ...all.slice(at)];
    });
  };

  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="id" value={template?.id ?? ""} />
      <input type="hidden" name="blocks" value={JSON.stringify(blocks)} />

      <div className="flex items-center justify-between gap-3">
        <Link href="/settings/forms" className="text-sm text-accent hover:underline">
          ← Your forms
        </Link>
        {template && (
          <button
            type="submit"
            formAction={retire}
            formNoValidate
            className="text-sm text-muted hover:text-warn"
          >
            Remove this form
          </button>
        )}
      </div>

      <section className="card grid gap-3 p-5 sm:grid-cols-[1fr_12rem]">
        <label className="block">
          <span className="label">Name</span>
          <input id="form-name" name="name" value={name} onChange={(e) => setName(e.target.value)} className="input" required placeholder="Tattoo consent" />
        </label>
        <label className="block">
          <span className="label">Kind</span>
          <select id="form-kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value)} className="input">
            {KINDS.map((k) => (
              <option key={k.value} value={k.value}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
      </section>

      <ol className="space-y-3">
        {blocks.map((b, i) => (
          <li key={b.id} className="card space-y-3 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <select
                id={`type-${b.id}`}
                value={b.type}
                onChange={(e) => change(b.id, { type: e.target.value as BlockType, options: e.target.value === "choice" ? (b.options ?? ["", ""]) : undefined })}
                className="input w-auto py-1.5 text-sm"
                aria-label="Kind of block"
              >
                {BLOCK_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
              <div className="flex items-center gap-1">
                <button type="button" onClick={() => move(i, -1)} className="btn border border-border px-2 py-1 text-sm" aria-label="Move up">
                  ↑
                </button>
                <button type="button" onClick={() => move(i, 1)} className="btn border border-border px-2 py-1 text-sm" aria-label="Move down">
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => setBlocks((all) => all.filter((x) => x.id !== b.id))}
                  className="btn border border-border px-2 py-1 text-sm text-warn"
                  aria-label="Remove"
                >
                  ✕
                </button>
              </div>
            </div>

            {b.type !== "signature" && (
              <label className="block">
                <span className="label">{b.type === "text" ? "Paragraph" : b.type === "agree" ? "What they agree to" : "Question"}</span>
                <textarea
                  id={`label-${b.id}`}
                  value={b.label}
                  onChange={(e) => change(b.id, { label: e.target.value })}
                  rows={b.type === "text" ? 3 : 2}
                  className="input"
                />
              </label>
            )}
            {b.type === "signature" && <p className="hint text-sm">They sign with a finger or mouse and type their name.</p>}

            {b.type === "choice" && (
              <div className="space-y-2">
                <span className="label">Options</span>
                {(b.options ?? []).map((o, oi) => (
                  <div key={oi} className="flex gap-2">
                    <input
                      id={`opt-${b.id}-${oi}`}
                      value={o}
                      onChange={(e) =>
                        change(b.id, { options: (b.options ?? []).map((x, xi) => (xi === oi ? e.target.value : x)) })
                      }
                      className="input"
                      placeholder={`Option ${oi + 1}`}
                    />
                    <button
                      type="button"
                      onClick={() => change(b.id, { options: (b.options ?? []).filter((_, xi) => xi !== oi) })}
                      className="btn border border-border px-2 text-sm"
                      aria-label="Remove option"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <button type="button" onClick={() => change(b.id, { options: [...(b.options ?? []), ""] })} className="text-sm text-accent hover:underline">
                  Add an option
                </button>
              </div>
            )}

            {(b.type === "short" || b.type === "long" || b.type === "yesno" || b.type === "choice" || b.type === "date") && (
              <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={Boolean(b.required)} onChange={(e) => change(b.id, { required: e.target.checked })} className="accent-[var(--accent)]" />
                  Must be answered
                </label>
                {b.type === "yesno" && (
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={Boolean(b.detailOnYes)} onChange={(e) => change(b.id, { detailOnYes: e.target.checked })} className="accent-[var(--accent)]" />
                    Ask for detail when they say yes
                  </label>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>

      <section className="card p-4">
        <span className="label">Add</span>
        <div className="mt-2 flex flex-wrap gap-2">
          {BLOCK_TYPES.filter((t) => t.value !== "signature" || !blocks.some((b) => b.type === "signature")).map((t) => (
            <button key={t.value} type="button" onClick={() => add(t.value)} className="btn border border-border text-sm">
              + {t.label}
            </button>
          ))}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={pending} className="btn bg-accent text-on-accent disabled:opacity-60">
          {pending ? "Saving…" : "Save form"}
        </button>
        {state.error && <p className="text-sm text-warn">{state.error}</p>}
        {retired.error && <p className="text-sm text-warn">{retired.error}</p>}
      </div>
    </form>
  );
}
