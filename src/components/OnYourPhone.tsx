"use client";

import { useEffect, useState } from "react";
import { INSTALL_CHANGED, askToInstall } from "@/lib/install";

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

type Where = "unknown" | "installed" | "ios" | "ipad" | "android" | "desktop";

function whereAmI(): Where {
  if (typeof window === "undefined") return "unknown";

  const standalone =
    window.matchMedia?.("(display-mode: standalone)").matches ||
    // Safari's own, which predates the standard and is still the only one it has.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  if (standalone) return "installed";

  const ua = navigator.userAgent;
  if (/iPhone|iPod/.test(ua)) return "ios";

  /*
   * An iPad says it is a Mac, and has done since iPadOS 13.
   *
   * Safari on an iPad sends a desktop user agent by default — "Macintosh",
   * with no mention of iPad anywhere in it — so the check above missed every
   * one of them and this panel offered "open it on your phone instead" to
   * somebody holding the device it was talking about. On the one platform
   * where adding to the home screen is not optional, because Apple will not
   * deliver a notification to a page in Safari at all.
   *
   * A Mac with a touchscreen is the giveaway, since Apple has never made one.
   */
  const pretendingToBeAMac = /Macintosh/.test(ua) && navigator.maxTouchPoints > 1;
  if (/iPad/.test(ua) || pretendingToBeAMac) return "ipad";

  if (/Android/.test(ua)) return "android";
  return "desktop";
}

export function OnYourPhone() {
  const [where, setWhere] = useState<Where>("unknown");

  /*
   * Whether the browser has an install waiting for us to ask.
   *
   * It is caught on every page by RegisterWorker and parked on the window,
   * because it fires once and early and this panel is three taps into
   * Settings. Here we only ask whether one is there.
   */
  const [canInstall, setCanInstall] = useState(false);
  const [outcome, setOutcome] = useState<"dismissed" | null>(null);

  // After mount, because none of this exists on the server and guessing would
  // mean the panel changing under somebody as the page settles.
  useEffect(() => setWhere(whereAmI()), []);

  useEffect(() => {
    const look = () => setCanInstall(Boolean(window.__spInstall));
    look();
    window.addEventListener(INSTALL_CHANGED, look);
    return () => window.removeEventListener(INSTALL_CHANGED, look);
  }, []);

  const install = async () => {
    const result = await askToInstall();
    if (result === "accepted") setWhere("installed");
    if (result === "dismissed") setOutcome("dismissed");
  };

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
              {where === "ios" || where === "ipad" || where === "installed" ? (
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

      {/*
        * A button, when the browser has an offer for us to make.
        *
        * Chrome decides on its own when to offer this and buries it in a menu;
        * dismissed once, it may never come back. Asking on our own button puts
        * it where somebody is already reading about why they want it.
        *
        * The written directions stay underneath regardless. They are the only
        * route on an iPhone, which never makes this offer at all, and the only
        * route on an Android where the offer has already been used up.
        */}
      {where !== "installed" && canInstall && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={install}
            className="btn inline-flex bg-accent text-on-accent"
          >
            Add it to this phone
          </button>
          <span className="hint">One tap. It asks you to confirm.</span>
        </div>
      )}

      {outcome === "dismissed" && (
        <p className="hint mt-3">
          Not added. You can still do it by hand below, or press the button again.
        </p>
      )}

      {where !== "installed" && (
        /*
         * Step by step, with the words that are actually on the buttons.
         *
         * "Use the share menu" is only instructions to somebody who already
         * knows where it is. These name the icon, say where on the screen it
         * lives, and say what the list looks like when you get there —
         * because the person doing this is doing it once, on a device they may
         * not use much, and every unnamed step is a place to give up.
         */
        <div className="note mt-4 rounded-lg bg-surface-2 px-3.5 py-3 text-sm text-muted">
          {(where === "ios" || where === "ipad") && (
            <>
              <strong className="text-foreground">
                On this {where === "ipad" ? "iPad" : "iPhone"}, in Safari:
              </strong>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                <li>
                  Tap the <strong className="text-foreground">share</strong> button &mdash;
                  a square with an arrow coming out of the top. It is{" "}
                  {where === "ipad"
                    ? "in the row of buttons along the top, to the right of the address bar"
                    : "in the bar at the bottom of the screen, in the middle"}
                  .
                </li>
                <li>
                  The menu that opens has a list of grey rows. Scroll down it until you
                  find <strong className="text-foreground">Add to Home Screen</strong>{" "}
                  &mdash; a square with a plus in it. It is usually below Add Bookmark.
                </li>
                <li>
                  It offers <strong className="text-foreground">Second Pair</strong> as the
                  name. Leave it, and tap <strong className="text-foreground">Add</strong>{" "}
                  at the top right.
                </li>
                <li>
                  Close Safari and open it from the icon instead. That icon is the app
                  &mdash; the same screens, without the address bar, and the only version
                  that can send you a notification.
                </li>
              </ol>
              <p className="mt-2.5">
                It has to be Safari. Chrome and Firefox on an{" "}
                {where === "ipad" ? "iPad" : "iPhone"} have no Add to Home Screen at all
                &mdash; Apple does not give it to them.
              </p>
            </>
          )}
          {where === "android" && (
            <>
              <strong className="text-foreground">On this phone, in Chrome:</strong>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5">
                <li>
                  Tap the <strong className="text-foreground">three dots</strong> at the
                  top right of Chrome.
                </li>
                <li>
                  Look for <strong className="text-foreground">Install app</strong>, or{" "}
                  <strong className="text-foreground">Add to Home screen</strong> if it
                  does not say Install. Either is the right one.
                </li>
                <li>
                  Confirm the name, then tap{" "}
                  <strong className="text-foreground">Install</strong> or{" "}
                  <strong className="text-foreground">Add</strong>. Some phones then ask
                  you to drag it onto the home screen, others put it there for you.
                </li>
                <li>
                  Open it from that icon from now on. It is the same screens without the
                  address bar, and notifications arrive there.
                </li>
              </ol>
            </>
          )}
          {where === "desktop" && (
            <>
              This one is for a phone or a tablet. Open{" "}
              <strong className="text-foreground">second-pair.com</strong> on it, sign in,
              and come back to this page &mdash; it will name the buttons for whichever
              device you are holding.
            </>
          )}
        </div>
      )}
    </div>
  );
}
