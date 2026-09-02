"use client";

import { useEffect } from "react";

/**
 * Registers the service worker on every page, not just the settings one.
 *
 * It used to be registered only when somebody turned notifications on, which
 * meant that on every other page there was no service worker at all — and
 * Chrome decides whether to offer "Install" by looking for one. So the app was
 * installable only if you happened to be on the one screen that registered it,
 * and in practice never.
 *
 * That matters more than a menu entry: on iOS a web page cannot send
 * notifications at all until it has been added to the home screen, so the
 * install is the gate in front of the whole notification feature.
 *
 * Failure is silent by design. A browser without service workers, a private
 * window, or a blocked registration should cost the user nothing — everything
 * here is an enhancement, and the app works without any of it.
 */
export function RegisterWorker() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {
      // Nothing to tell them. Notifications will say so themselves if asked.
    });
  }, []);

  return null;
}
