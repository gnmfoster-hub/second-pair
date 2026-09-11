"use client";

import { useEffect } from "react";

/**
 * The number on the app icon.
 *
 * The closest a web app gets to a home screen widget, and most of what people
 * actually want from one: how many conversations are waiting, visible on the
 * home screen without opening anything. An owner glances at their phone,
 * sees a 3, and knows. Nothing else in the product can say anything at all to
 * somebody who has not opened it.
 *
 * The same number the inbox tab shows, from the same query, so the icon and
 * the app can never disagree — a badge saying 3 over an inbox showing none is
 * worse than no badge, because the next glance is not trusted either.
 *
 * Works in an installed app on Android and on iOS 16.4 and later. Everywhere
 * else the call simply does not exist and nothing happens, which is the right
 * outcome: a browser tab has no icon to write on.
 *
 * Cleared rather than set to zero. A zero badge is a dot on the icon in some
 * launchers, which reads as "something is waiting" — the opposite of what it
 * means.
 */
export function AppBadge({ count }: { count: number }) {
  useEffect(() => {
    if (typeof navigator === "undefined") return;

    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };

    if (!nav.setAppBadge || !nav.clearAppBadge) return;

    /*
     * Swallowed on purpose, and not logged.
     *
     * Safari rejects this when the app is not installed to the home screen,
     * which is the ordinary case for anybody trying the product in a browser.
     * An unhandled rejection in the console on every page load, for a feature
     * that is working exactly as designed, is noise that hides real faults.
     */
    const done = count > 0 ? nav.setAppBadge(count) : nav.clearAppBadge();
    done?.catch(() => {});
  }, [count]);

  return null;
}
