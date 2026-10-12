"use client";

import { useEffect, useRef } from "react";

/**
 * The layer behind the hero that the diary is drawn on. The drawing code is
 * fetched once the browser has a quiet moment, so the first screen never waits on it.
 */
export function HeroGround() {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // TRIAL: ?bg=mist|sky|sand|plain tries another colour for the ground. Goes when one is chosen.
    const bg = new URLSearchParams(window.location.search).get("bg");
    if (bg) document.documentElement.dataset.bg = bg;
    const el = layer.current;
    const hero = el?.closest<HTMLElement>(".sp-hero");
    if (!el || !hero || el.firstChild) return;
    const go = () => import("./HeroDiary").then((m) => m.startDiary(hero, el));
    if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 1500 });
    else setTimeout(go, 300);
  }, []);

  return <div ref={layer} className="sp-hero-ground" aria-hidden />;
}
