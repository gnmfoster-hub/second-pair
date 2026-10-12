"use client";

import { useEffect } from "react";

const LIVE = ["msgs", "diary", "torch", "field"];

/**
 * TRIAL. Chooses the hero's ground from ?sky= so the options can be looked at side
 * by side: blue, bubble, lines, night, and the ones that answer a finger (msgs,
 * diary, torch, field), whose code is only fetched when asked for. Goes when one
 * is chosen.
 */
export function SkyPick() {
  useEffect(() => {
    const sky = new URLSearchParams(window.location.search).get("sky");
    if (!sky) return;
    document.documentElement.dataset.sky = sky;
    if (!LIVE.includes(sky)) return;
    const hero = document.querySelector<HTMLElement>(".sp-hero");
    const layer = hero?.querySelector<HTMLElement>(".sp-hero-sky");
    if (!hero || !layer || layer.querySelector("canvas")) return;
    const go = () => import("./SkyLive").then((m) => m.startLive(sky, hero, layer));
    if ("requestIdleCallback" in window) window.requestIdleCallback(go, { timeout: 1500 });
    else setTimeout(go, 300);
  }, []);
  return null;
}
