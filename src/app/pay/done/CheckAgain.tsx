"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Waiting for Stripe to confirm, without the page reloading under them.
 *
 * It used to be a meta refresh: the whole document reloaded every four
 * seconds, up to fifteen times, with no way to pause or stop it. For a minute
 * the page jumped under the reader — unusable with a screen reader or a
 * magnifier, and alarming on a page about money, which is the one place
 * somebody is already anxious.
 *
 * A soft refresh instead: React re-renders the server component in place, so
 * the status line changes and nothing else moves. It backs off as it goes —
 * a card that has not confirmed in twenty seconds is not going to confirm in
 * the next four — and it stops on its own with a button rather than leaving
 * somebody watching a page that has quietly given up.
 */
export function CheckAgain({ stopAfter = 8 }: { stopAfter?: number }) {
  const router = useRouter();
  const [tries, setTries] = useState(0);
  const [waiting, setWaiting] = useState(true);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!waiting || tries >= stopAfter) return;

    // Four seconds, then six, then eight — banks are slow, and asking faster
    // does not make them quicker.
    const gap = 4000 + tries * 2000;
    timer.current = setTimeout(() => {
      setTries((n) => n + 1);
      router.refresh();
    }, gap);

    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [tries, waiting, stopAfter, router]);

  const stopped = !waiting || tries >= stopAfter;

  return (
    <div className="mt-4 flex flex-col items-center gap-2">
      <p className="hint text-sm" role="status" aria-live="polite">
        {stopped
          ? "Still not showing as paid here. If your bank says it went through, it will catch up shortly."
          : "Checking with the bank…"}
      </p>
      <div className="flex flex-wrap justify-center gap-2">
        <button
          type="button"
          onClick={() => {
            setTries(0);
            setWaiting(true);
            router.refresh();
          }}
          className="btn border border-border text-sm"
        >
          Check again
        </button>
        {!stopped && (
          <button
            type="button"
            onClick={() => setWaiting(false)}
            className="hint text-sm underline underline-offset-4"
          >
            Stop checking
          </button>
        )}
      </div>
    </div>
  );
}
