"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * Keep a form that was signed on paper: a photo from the phone's camera, or a
 * PDF from a scanner. Named, so a record with three of them can tell them apart.
 */
export function PaperForm({ contactId }: { contactId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="w-full text-center text-sm text-accent hover:underline">
        Add a paper form (photo or PDF)
      </button>
    );
  }

  return (
    <form
      className="space-y-3 rounded-xl border border-border bg-surface-2/40 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        const res = await fetch("/api/forms/upload", { method: "POST", body: new FormData(e.currentTarget) }).catch(
          () => null,
        );
        const body = res ? await res.json().catch(() => ({})) : {};
        setBusy(false);
        if (!res?.ok) {
          setError((body as { error?: string }).error ?? "It did not upload. Check your signal and try again.");
          return;
        }
        setDone(true);
        router.refresh();
      }}
    >
      <input type="hidden" name="contact_id" value={contactId} />
      <label className="block">
        <span className="label">What it is</span>
        <input id="paper-title" name="title" placeholder="Consent form, signed at the desk" className="input" />
      </label>
      <label className="block">
        <span className="label">Photo or PDF</span>
        <input
          id="paper-file"
          name="file"
          type="file"
          accept="image/*,application/pdf"
          required
          className="block w-full text-sm"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={busy} className="btn bg-accent text-sm text-on-accent disabled:opacity-60">
          {busy ? "Uploading…" : "Keep it"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="text-sm text-muted hover:text-foreground">
          {done ? "Close" : "Cancel"}
        </button>
      </div>
      {done && <p className="text-sm text-ok">Kept on their record.</p>}
      {error && <p className="text-sm text-warn">{error}</p>}
    </form>
  );
}
