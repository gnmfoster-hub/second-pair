"use client";

import { useEffect } from "react";

/**
 * TRIAL. Chooses the hero's sky from ?sky=blue|bubble|lines|night so the options can
 * be looked at side by side. Goes when one is chosen.
 */
export function SkyPick() {
  useEffect(() => {
    const sky = new URLSearchParams(window.location.search).get("sky");
    if (sky) document.documentElement.dataset.sky = sky;
  }, []);
  return null;
}
