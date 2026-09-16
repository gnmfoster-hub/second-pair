"use client";

import { useState } from "react";

/**
 * A link to hand somebody, with one press to copy it.
 *
 * Shown as well as copyable: a link nobody can read is a link nobody trusts,
 * and somebody reading it out over the phone is a real thing that happens.
 * Copying can fail — an old browser, a page not served securely — so the
 * button says what happened rather than pretending.
 */
export function CopyLink({ url, label = "Copy the link" }: { url: string; label?: string }) {
  const [said, setSaid] = useState<"copied" | "failed" | null>(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setSaid("copied");
    } catch {
      setSaid("failed");
    }
  };

  return (
    <div className="mt-2 flex flex-wrap items-center gap-2">
      <code className="min-w-0 flex-1 truncate rounded-md bg-surface px-2 py-1.5 text-xs">{url}</code>
      <button type="button" onClick={copy} className="btn shrink-0 border border-border text-sm">
        {said === "copied" ? "Copied" : said === "failed" ? "Select it and copy" : label}
      </button>
    </div>
  );
}
