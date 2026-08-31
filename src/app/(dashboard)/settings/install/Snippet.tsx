"use client";

import { useState } from "react";

/**
 * A block of text with a copy button that tells you it worked.
 *
 * Most people using this are not developers. The failure mode to design out is
 * them selecting half the line by hand and pasting something broken.
 */
export function Snippet({ value, label }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      // Clipboard permission refused. Leave the text on screen to select.
    }
  };

  return (
    <div>
      {label && <div className="label">{label}</div>}
      <div className="flex items-stretch gap-2">
        <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-surface-2 px-3 py-2.5 font-mono text-xs leading-relaxed">
          {value}
        </code>
        <button
          type="button"
          onClick={copy}
          className="btn-ghost shrink-0 px-3"
          aria-label={`Copy ${label ?? "to clipboard"}`}
        >
          {copied ? <span className="text-ok">Copied</span> : "Copy"}
        </button>
      </div>
    </div>
  );
}
