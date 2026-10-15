"use client";

import { useCopied, writeCopied } from "./copied";

/**
 * What you are holding, and how to put it down.
 *
 * Rendered once by the diary page rather than inside either view, because
 * both views are always mounted and CSS hides one — a bar inside the grid
 * would be invisible to somebody working in the list, which is most people on
 * a phone.
 *
 * Along the bottom rather than beside the booking it came from: by the time
 * it is useful you are looking at a different day. It says the length as well
 * as the name, because a paste puts down the original's length whatever was
 * dragged out, and that is better said than discovered.
 */
export function CopiedBar() {
  const copied = useCopied();
  if (!copied) return null;

  return (
    <div className="fixed inset-x-4 bottom-24 z-40 mx-auto flex w-fit max-w-sm items-center gap-3 rounded-xl border border-accent/40 bg-surface px-4 py-3 text-sm shadow-[var(--shadow-pop)] md:bottom-6">
      <span>
        Holding <strong>{copied.what}</strong>, {copied.minutes} minutes. Tap a free space to put
        it in.
      </span>
      <button
        type="button"
        onClick={() => writeCopied(null)}
        className="shrink-0 text-muted underline hover:text-foreground"
      >
        Drop it
      </button>
    </div>
  );
}
