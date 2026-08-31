"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Keyboard shortcuts for the diary.
 *
 * The people who live in this page all day will learn three or four of these
 * and never touch the buttons again — which is the difference between software
 * you tolerate and software you like.
 *
 * Deliberately single keys with no modifier, in the Google Calendar idiom, and
 * ignored while anything is being typed into.
 */
const KEYS: { key: string; label: string; what: string }[] = [
  { key: "T", label: "T", what: "Jump to today" },
  { key: "D", label: "D", what: "Day view" },
  { key: "W", label: "W", what: "Week view" },
  { key: "←", label: "←", what: "Back" },
  { key: "→", label: "→", what: "Forward" },
  { key: "?", label: "?", what: "This list" },
];

function typing(target: EventTarget | null): boolean {
  const el = target as HTMLElement | null;
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || el.isContentEditable
  );
}

export function Shortcuts({
  back,
  forward,
  today,
  dayHref,
  weekHref,
}: {
  back: string;
  forward: string;
  today: string;
  dayHref: string;
  weekHref: string;
}) {
  const router = useRouter();
  const [showing, setShowing] = useState(false);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (typing(event.target)) return;

      // A dialog is open and Escape belongs to it, not to us.
      if (event.key === "Escape") {
        setShowing(false);
        return;
      }

      const go = (href: string) => {
        event.preventDefault();
        router.push(href);
      };

      switch (event.key.toLowerCase()) {
        case "t":
          return go(today);
        case "d":
          return go(dayHref);
        case "w":
          return go(weekHref);
        case "arrowleft":
          return go(back);
        case "arrowright":
          return go(forward);
        case "?":
          event.preventDefault();
          return setShowing((s) => !s);
      }
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, back, forward, today, dayHref, weekHref]);

  return (
    <>
      <button
        type="button"
        onClick={() => setShowing(true)}
        className="hidden text-xs text-muted transition-colors hover:text-foreground md:block"
        title="Keyboard shortcuts"
      >
        <kbd className="rounded border border-border px-1.5 py-0.5 font-mono">?</kbd>
      </button>

      {showing && (
        <div
          className="fixed inset-0 z-50 grid place-items-center bg-foreground/25 p-4 backdrop-blur-sm"
          onClick={() => setShowing(false)}
          role="dialog"
          aria-label="Keyboard shortcuts"
        >
          <div
            className="card w-full max-w-xs p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="section-title">Shortcuts</div>
            <ul className="mt-4 space-y-2.5">
              {KEYS.map((k) => (
                <li key={k.key} className="flex items-center justify-between gap-4 text-sm">
                  <span className="text-muted">{k.what}</span>
                  <kbd className="rounded border border-border bg-surface-2 px-2 py-0.5 font-mono text-xs">
                    {k.label}
                  </kbd>
                </li>
              ))}
            </ul>
            <p className="hint mt-4">
              Drag an entry to move it, pull its bottom edge to make it longer, or drag
              across empty space to block time out.
            </p>
          </div>
        </div>
      )}
    </>
  );
}
