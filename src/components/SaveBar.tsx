"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import type { FormState } from "@/app/(dashboard)/settings/actions";

/**
 * Save, where you can reach it, and proof it happened.
 *
 * The settings form has always had a Save button. It is at the bottom of six
 * hundred lines of form, and opening hours are near the top — so somebody
 * changing a Tuesday closing time is looking at a screen with no save button
 * anywhere on it, and has to guess whether the change took. Reasonably, they
 * assume it saved itself.
 *
 * And when it did save, it said "Saved." until the next render and then said
 * nothing, so five minutes later there was no way to tell a saved form from an
 * unsaved one. A settings page that cannot answer "did that go in?" gets
 * checked twice by careful people and trusted blindly by everyone else.
 *
 * Two things, then: the button follows you down the page once something has
 * changed, and the time it last saved stays on screen afterwards.
 */
export function SaveBar({
  state,
  lastSaved,
  label = "Save changes",
}: {
  state: FormState;
  /** When it last saved, already in words. Null if it never has. */
  lastSaved: string | null;
  label?: string;
}) {
  const { pending } = useFormStatus();
  const [dirty, setDirty] = useState(false);
  const anchor = useRef<HTMLDivElement>(null);

  /*
   * Whether anything has been touched.
   *
   * Listened for on the form itself rather than tracked per field, because the
   * form has dozens of them and any one counts. Input covers typing; change
   * covers checkboxes, selects and the time pickers, which never fire input in
   * some browsers.
   */
  useEffect(() => {
    const form = anchor.current?.closest("form");
    if (!form) return;

    const touched = () => setDirty(true);
    form.addEventListener("input", touched);
    form.addEventListener("change", touched);
    return () => {
      form.removeEventListener("input", touched);
      form.removeEventListener("change", touched);
    };
  }, []);

  // A save that went through is a clean form again.
  useEffect(() => {
    if (state.ok) setDirty(false);
  }, [state.ok]);

  return (
    <div ref={anchor}>
      {/*
       * Clear of the bottom navigation on a phone, which is six rem tall and
       * would otherwise sit on top of the one button this is about.
       */}
      <div className="sticky bottom-24 z-30 md:bottom-4">
        <div
          className={`flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border px-4 py-3 shadow-lg backdrop-blur transition-colors ${
            dirty
              ? "border-accent/40 bg-surface/95"
              : "border-border bg-surface/90"
          }`}
        >
          <button
            type="submit"
            className={dirty ? "btn bg-accent text-on-accent" : "btn-ghost"}
            disabled={pending}
          >
            {pending ? "Saving…" : label}
          </button>

          {/*
           * One line that says where things stand, in the order somebody needs
           * it: what went wrong, then what just happened, then whether there is
           * anything outstanding, then when it last went in.
           */}
          {state.error ? (
            <span className="text-sm text-bad">{state.error}</span>
          ) : dirty ? (
            <span className="text-sm text-muted">Not saved yet</span>
          ) : state.ok ? (
            <span className="text-sm text-ok">Saved.</span>
          ) : null}

          <span className="hint ml-auto">
            {lastSaved ? `Last saved ${lastSaved}` : "Never saved"}
          </span>
        </div>
      </div>
    </div>
  );
}
