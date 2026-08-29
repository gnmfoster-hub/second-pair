"use client";

import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/(dashboard)/settings/actions";

export function SubmitButton({
  children = "Save",
  className = "btn-primary",
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={className} disabled={pending}>
      {pending ? "Saving…" : children}
    </button>
  );
}

export function FormMessage({ state }: { state: FormState }) {
  if (state.error) return <p className="text-sm text-accent">{state.error}</p>;
  if (state.ok) return <p className="text-sm text-ok">Saved.</p>;
  return null;
}

export function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="label">{label}</label>
      {children}
      {hint && <p className="hint mt-1.5">{hint}</p>}
    </div>
  );
}
