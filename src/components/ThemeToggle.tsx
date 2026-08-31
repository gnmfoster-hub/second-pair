"use client";

import { useSyncExternalStore } from "react";

type Choice = "system" | "light" | "dark";

const STORAGE_KEY = "secondpair_theme";

/**
 * The theme lives outside React — in localStorage and on the root element — so
 * it is read as an external store rather than mirrored into state. That also
 * keeps another tab's change in sync, for free.
 */
const listeners = new Set<() => void>();

function subscribe(notify: () => void) {
  listeners.add(notify);
  window.addEventListener("storage", notify);
  return () => {
    listeners.delete(notify);
    window.removeEventListener("storage", notify);
  };
}

function snapshot(): Choice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
  } catch {
    // Storage blocked; following the device is a fine place to be.
  }
  return "system";
}

/** The server has no idea what the device prefers, so it renders "system". */
const serverSnapshot = (): Choice => "system";

function choose(next: Choice) {
  const root = document.documentElement;
  if (next === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", next);

  try {
    if (next === "system") localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, next);
  } catch {
    // The choice still applies for this visit.
  }

  listeners.forEach((notify) => notify());
}

const OPTIONS: { value: Choice; label: string; icon: string }[] = [
  { value: "light", label: "Light", icon: "☀" },
  { value: "system", label: "Match my device", icon: "◐" },
  { value: "dark", label: "Dark", icon: "☾" },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const choice = useSyncExternalStore(subscribe, snapshot, serverSnapshot);

  return (
    <div
      className={`flex overflow-hidden rounded-lg border border-border ${
        compact ? "shrink-0" : ""
      }`}
      role="group"
      aria-label="Colour theme"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => choose(option.value)}
          aria-pressed={choice === option.value}
          title={option.label}
          className={`px-2.5 py-2 text-xs transition-colors ${compact ? "" : "flex-1"} ${
            choice === option.value
              ? "bg-surface-2 text-foreground"
              : "text-muted hover:text-foreground"
          }`}
        >
          <span aria-hidden="true">{option.icon}</span>
          <span className="sr-only">{option.label}</span>
        </button>
      ))}
    </div>
  );
}

/**
 * Runs before first paint so a stored choice is applied without the page
 * flashing the other theme. Inlined in the document head, deliberately tiny,
 * and silent if storage is unavailable.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t==="light"||t==="dark"){document.documentElement.setAttribute("data-theme",t)}}catch(e){}})();`;
