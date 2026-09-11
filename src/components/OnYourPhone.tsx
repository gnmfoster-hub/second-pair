"use client";

import { useEffect, useState } from "react";

/**
 * Telling people the phone app exists, and what it does once it is there.
 *
 * Everything here has been built for a while and nothing anywhere mentioned
 * it. A business that never adds Second Pair to its home screen gets no
 * notifications at all on an iPhone — Apple will not deliver them to a page in
 * Safari — no number on an icon it has not got, and none of the shortcuts.
 * The whole of the phone side of this product was behind a step nobody was
 * ever asked to take.
 *
 * Written as what they get rather than as an instruction, because "add to home
 * screen" is a chore and "see how many people are waiting without opening
 * anything" is a reason.
 */

type Where = "unknown" | "installed" | "ios" | "android" | "desktop";

function whereAmI(): Where {
  if (typeof window === "undefined") return "unknown";

  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // Safari's own, which predates the standard and is still the only one it has.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (standalone) return "installed";

  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua)) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export function OnYourPhone() {
  const [where, setWhere] = useState<Where>("unknown");

  // After mount, because none of this exists on the server and guessing would
  // mean the panel changing under somebody as the page settles.
  useEffect(() => setWhere(whereAmI()), []);

  if (where === "unknown") return null;

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="section-title">On your phone</h2>
          <p className="hint mt-1 max-w-prose">
            {where === "installed"
              ? "You are in the app now. Everything below is already working on this device."
              : "Added to your home screen it stops being a website and starts being the thing you glance at."}
          </p>
        </div>

        {where === "installed" && (
          <span className="pill shrink-0 bg-ok/10 text-ok">Added</span>
        )}
      </div>

      <ul className="mt-4 space-y-3 text-sm">
        <li className="flex gap-3">
          <span aria-hidden className="select-none text-base leading-6">①</span>
          <span>
            <strong className="font-medium">A number on the icon.</strong>{" "}
            <span className="hint">
              How many conversations are waiting, on your home screen, without opening
              anything. It updates when somebody needs you, even while the app is shut.
            </span>
          </span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden className="select-none text-base leading-6">②</span>
          <span>
            <strong className="font-medium">Hold the icon for the shortcuts.</strong>{" "}
            <span className="hint">
              Today, add an appointment, who needs you, clients &mdash; straight there,
              without going through the app.{" "}
              {where === "ios" || where === "installed" ? (
                <em className="not-italic">Android only; iPhones do not offer these yet.</em>
              ) : null}
            </span>
          </span>
        </li>
        <li className="flex gap-3">
          <span aria-hidden className="select-none text-base leading-6">③</span>
          <span>
            <strong className="font-medium">Notifications, which need it on an iPhone.</strong>{" "}
            <span className="hint">
              Apple will not send them to a page in Safari at all. Added to the home
              screen, they work like any other app&rsquo;s.
            </span>
          </span>
        </li>
      </ul>

      {where !== "installed" && (
        <div className="note mt-4 rounded-lg bg-surface-2 px-3.5 py-3 text-sm text-muted">
          {where === "ios" && (
            <>
              <strong className="text-foreground">On this iPhone:</strong> the share button
              at the bottom of Safari, then <strong className="text-foreground">Add to
              Home Screen</strong>. It has to be Safari &mdash; Chrome on an iPhone cannot
              do it.
            </>
          )}
          {where === "android" && (
            <>
              <strong className="text-foreground">On this phone:</strong> the three dots in
              Chrome, then <strong className="text-foreground">Add to Home screen</strong>{" "}
              or <strong className="text-foreground">Install app</strong>.
            </>
          )}
          {where === "desktop" && (
            <>
              This one is for a phone. Open{" "}
              <strong className="text-foreground">second-pair.com</strong> on it, sign in,
              and come back to this page &mdash; it will tell you which buttons to press
              on that phone.
            </>
          )}
        </div>
      )}
    </div>
  );
}
