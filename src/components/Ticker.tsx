"use client";

import { useEffect, useRef, useState } from "react";
import { formatPence } from "@/lib/money";

/**
 * A figure that arrives rather than appears.
 *
 * The number an owner opens this app for is what the assistant won while they
 * were working, and it was rendering as static text like everything else. A
 * short count draws the eye to it without a word of explanation — which is the
 * whole job of that card.
 *
 * Deliberately quick and deliberately once. Anything longer than about half a
 * second stops being a flourish and becomes something you wait for, and on a
 * page somebody opens twenty times a day that would be intolerable by Tuesday.
 */
export function Ticker({
  value,
  money = false,
  className,
}: {
  value: number;
  /** Pence, formatted as currency on the way up. */
  money?: boolean;
  className?: string;
}) {
  const render = (n: number) => (money ? formatPence(Math.round(n)) : String(Math.round(n)));

  /*
   * Starts at the final value, not at zero.
   *
   * The server renders this too, and a page that shows £0 before hydrating is
   * a page that flashes the wrong number at somebody — briefly telling them
   * they earned nothing, which is precisely the wrong first impression.
   */
  const [shown, setShown] = useState(value);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (value === 0) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const DURATION = 520;
    const started = performance.now();

    // Ease out: quick at the start, settling gently, so it reads as landing on
    // the figure rather than stopping dead on it.
    const ease = (t: number) => 1 - Math.pow(1 - t, 3);

    const step = (now: number) => {
      const progress = Math.min(1, (now - started) / DURATION);
      setShown(value * ease(progress));
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };

    /*
     * The reset to zero happens in the first frame, not here.
     *
     * Setting it synchronously in the effect is a second render before the
     * browser has painted the first — React rightly complains, and the count
     * wants to begin on a frame boundary anyway.
     */
    frame.current = requestAnimationFrame((now) => {
      setShown(0);
      frame.current = requestAnimationFrame(step);
      void now;
    });

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
      setShown(value);
    };
  }, [value]);

  return (
    <span className={className} suppressHydrationWarning>
      {render(shown)}
    </span>
  );
}
