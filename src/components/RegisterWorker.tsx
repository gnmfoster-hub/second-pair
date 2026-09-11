"use client";

import { useEffect } from "react";

/**
 * Registers the service worker, and makes sure a new version actually arrives.
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

    let reloading = false;

    /*
     * When the new worker takes over, take the page with it.
     *
     * The worker skips waiting and claims its clients, so this fires on the
     * deploy after somebody last loaded the app. Without the reload they keep
     * running the old page against the new worker — which is not broken, but
     * it is how somebody ends up asking whether they need to do something to
     * see a change that shipped three days ago.
     *
     * Guarded: a controller change can fire more than once, and a reload loop
     * on the screen a business runs its day from would be unforgivable.
     */
    const onControllerChange = () => {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    };

    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);

    navigator.serviceWorker
      .register("/sw.js")
      .then((registration) => {
        /*
         * Ask again whenever they come back to it.
         *
         * A home screen app is opened and left, sometimes for days, and the
         * browser only checks for a new worker on its own schedule. Coming
         * back to the app is exactly the moment to look, and it costs one
         * conditional request.
         */
        const check = () => {
          if (document.visibilityState === "visible") registration.update().catch(() => {});
        };

        document.addEventListener("visibilitychange", check);
        return () => document.removeEventListener("visibilitychange", check);
      })
      .catch(() => {
        // Nothing to tell them. Notifications will say so themselves if asked.
      });

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
    };
  }, []);

  return null;
}
