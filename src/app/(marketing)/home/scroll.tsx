"use client";

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/*
 * Scroll as the playhead.
 *
 * The sections under the hero move with the page rather than on a timer, and
 * all of them do it the same way: one number between 0 and 1, written to the
 * element as --p, and CSS does the rest. No library. A marketing page that
 * ships a hundred kilobytes of animation framework to move four things is a
 * slower page for no reason.
 *
 * Every section built on this is finished without it. The number defaults in
 * CSS to whatever the resting picture needs, so with script off, or for
 * somebody who has asked for less motion, the page is still and complete
 * rather than waiting for a scroll that will not drive anything.
 */

/** Wide enough for a pinned stage, and nobody has asked for less motion. */
const LIVE = "(min-width: 960px) and (min-height: 620px) and (prefers-reduced-motion: no-preference)";

/** True once mounted on a screen that can take the moving version. */
export function useLive(): boolean {
  const [live, setLive] = useState(false);
  useEffect(() => {
    /* ?still shows the resting page, for a full-page picture of it. */
    if (/[?&]still\b/.test(window.location.search)) return;
    const mq = window.matchMedia(LIVE);
    const set = () => setLive(mq.matches);
    set();
    mq.addEventListener("change", set);
    return () => mq.removeEventListener("change", set);
  }, []);
  return live;
}

/**
 * Calls back with how far an element has travelled, once a frame at most.
 *
 * "pin": 0 when its top reaches the top of the screen, 1 when its bottom
 * reaches the bottom — the travel of a tall section with a pinned stage in it.
 * "pass": 0 as it enters at the bottom of the screen, 1 as it leaves the top.
 */
export function useProgress<T extends HTMLElement>(
  mode: "pin" | "pass",
  on: boolean,
  cb: (p: number, el: T) => void,
) {
  const ref = useRef<T>(null);
  const saved = useRef(cb);
  useEffect(() => {
    saved.current = cb;
  });

  useEffect(() => {
    const el = ref.current;
    if (!el || !on) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const raw = mode === "pin" ? -r.top / Math.max(1, r.height - vh) : (vh - r.top) / (vh + r.height);
      saved.current(Math.min(1, Math.max(0, raw)), el);
    };
    const ask = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", ask, { passive: true });
    window.addEventListener("resize", ask);
    return () => {
      window.removeEventListener("scroll", ask);
      window.removeEventListener("resize", ask);
      if (frame) cancelAnimationFrame(frame);
    };
  }, [mode, on]);

  return ref;
}

/** A block that knows how far through the screen it is, as --p. */
export function Passing({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}) {
  const live = useLive();
  const ref = useProgress<HTMLDivElement>("pass", live, (p, el) => {
    el.style.setProperty("--p", p.toFixed(4));
  });
  return (
    <div ref={ref} className={className} style={style} data-live={live ? "" : undefined}>
      {children}
    </div>
  );
}
