"use client";

import { useEffect, useRef } from "react";

/**
 * The layer behind the hero that the questions are drawn on. The drawing code is
 * fetched once the browser has a quiet moment, so the first screen never waits on it.
 */
export function HeroGround() {
  const layer = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = layer.current;
    const hero = el?.closest<HTMLElement>(".sp-hero");
    if (!el || !hero || el.firstChild) return;
    const go = () => import("./HeroMessages").then((m) => m.startMessages(hero, el));
    if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 1500 });
    else setTimeout(go, 300);
  }, []);

  return <div ref={layer} className="sp-hero-ground" aria-hidden />;
}
