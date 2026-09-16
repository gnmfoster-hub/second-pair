"use client";

import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/(dashboard)/settings/actions";
import { Explain } from "./Explain";

export function SubmitButton({
  children = "Save",
  className = "btn-primary",
  pending: pendingLabel = "Saving…",
}: {
  children?: React.ReactNode;
  className?: string;
  /*
   * What it says while it is working.
   *
   * It always said "Saving…", so pressing Send said Saving and pressing Add
   * client said Saving. A button that changes verb mid-press is a small thing
   * that makes a product feel unfinished.
   */
  pending?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-bad">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-ok">Saved.</p>;
  return null;
}

export function Field({
  label,
  hint,
  explain,
  children,
}: {
  label: string;
  /** Said on the page, for anything that costs something to get wrong. */
  hint?: string;
  /**
   * Said behind a question mark beside the label, for anything a person can
   * work out by pressing it — a detail, a reassurance, a nicety.
   *
   * Both may be set: the consequence stays on the page and the explanation
   * folds away. See components/Explain for where the line is.
   */
  explain?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">
        {label}
        {explain && <Explain label={`What ${label.toLowerCase()} means`}>{explain}</Explain>}
      </label>
      {children}
      {hint && <p className="hint mt-1.5">{hint}</p>}
    </div>
  );
}
