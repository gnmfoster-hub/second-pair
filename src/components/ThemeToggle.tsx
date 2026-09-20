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

/*
 * Light unless somebody says otherwise.
 *
 * This followed the device, which sounds like the considerate default and is
 * not: most people have never chosen a device theme deliberately, and a
 * business owner showing the app to a client on a phone that flipped to dark
 * at sunset gets a look they did not pick and cannot explain. The product has
 * a light identity, so that is what it opens as.
 *
 * "Match my device" is still there and still works — it is now a choice rather
 * than the thing that happens to you.
 */
function snapshot(): Choice {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") return stored;
  } catch {
    // Storage blocked. Light is the default anyway, so nothing is lost.
  }
  return "light";
}

/** Matches the pre-hydration script below: nothing chosen means light. */
const serverSnapshot = (): Choice => "light";

function choose(next: Choice) {
  const root = document.documentElement;
  if (next === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", next);

  try {
    // "system" is now stored rather than cleared: clearing it would mean the
    // same thing as never having chosen, which is light.
    localStorage.setItem(STORAGE_KEY, next);
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

  /*
   * One button on a phone, pressed round the three.
   *
   * Three 44px squares took 132px of the header, and the header's other job is
   * saying whose business this is — "Willow & Co (de…" was what was left of
   * the name. A thing set once and rarely touched does not need three targets;
   * it needs one, still thumb-sized, that says what it is on now.
   */
  if (compact) {
    const at = OPTIONS.findIndex((o) => o.value === choice);
    const current = OPTIONS[at] ?? OPTIONS[0];
    const next = OPTIONS[(at + 1) % OPTIONS.length];
    return (
      <button
        type="button"
        onClick={() => choose(next.value)}
        title={`Colours: ${current.label}. Press for ${next.label.toLowerCase()}.`}
        aria-label={`Colours: ${current.label}. Press for ${next.label.toLowerCase()}.`}
        /*
         * Inherits its colour, like the lockup beside it.
         *
         * border-border and text-foreground are both ink-on-pale, and the
         * marketing header is the brand navy now — so this rendered as a
         * black square with an invisible icon inside it, on the one row a
         * visitor sees before anything else. currentColor follows whatever it
         * is put on, and is unchanged everywhere it already sat.
         */
        className="grid h-11 w-11 shrink-0 place-items-center rounded-lg border border-current/25 text-sm text-current"
      >
        <span aria-hidden="true">{current.icon}</span>
      </button>
    );
  }

  return (
    <div
      className="flex overflow-hidden rounded-lg border border-border"
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
          className={`flex-1 px-2.5 py-2 text-xs transition-colors ${
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
/*
 * Stamped before the first paint, or the page flashes the wrong theme.
 *
 * Anything other than a deliberate "system" gets light, including a visitor who
 * has never chosen — which is the default, and has to be applied here rather
 * than in CSS so that a device set to dark does not show one frame of it.
 */
export const themeScript = `(function(){try{var t=localStorage.getItem("${STORAGE_KEY}");if(t!=="system"){document.documentElement.setAttribute("data-theme",t==="dark"?"dark":"light")}}catch(e){document.documentElement.setAttribute("data-theme","light")}})();`;
