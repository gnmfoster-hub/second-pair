/**
 * Service worker.
 *
 * Deliberately minimal: it exists to receive push notifications, to make the
 * app installable, and to open the right page when one is tapped. No offline
 * caching — a diary showing yesterday's bookings because it came from a cache
 * is worse than a diary that says it cannot reach the internet.
 */

/*
 * A real fetch handler, because an empty one stopped counting.
 *
 * Chrome will not offer to install an app unless its service worker handles
 * fetch — it is how the browser decides the thing is app-shaped rather than a
 * page with a manifest bolted on.
 *
 * This used to be an empty listener that never called respondWith, which was
 * enough at the time. It is not any more: Chrome now detects a fetch handler
 * that does nothing and skips it as an optimisation, and a skipped handler
 * counts as no handler at all. The install option quietly disappeared from the
 * menu without anything here changing.
 *
 * So it handles navigations for real and forwards them to the network. It
 * still caches nothing — the reasoning above stands, a diary showing
 * yesterday's bookings because they came from a cache is worse than one saying
 * it cannot reach the internet. Everything that is not a navigation is left
 * entirely alone, exactly as if there were no service worker.
 */
var OFFLINE_PAGE =
  '<!doctype html><meta charset="utf-8">' +
  '<meta name="viewport" content="width=device-width,initial-scale=1">' +
  "<title>No connection — Second Pair</title>" +
  "<style>body{margin:0;min-height:100vh;display:grid;place-items:center;" +
  "background:#0A0F1A;color:#EEF1F6;font:400 16px/1.5 -apple-system,BlinkMacSystemFont," +
  "'Segoe UI',Roboto,sans-serif;padding:2rem;text-align:center}" +
  "h1{font-size:1.25rem;margin:0 0 .5rem}p{margin:0;color:#9BAAC2;max-width:24rem}</style>" +
  "<div><h1>No connection</h1><p>Second Pair needs the internet to show you " +
  "today&rsquo;s diary. Nothing is lost &mdash; try again once you are back on.</p></div>";

self.addEventListener("fetch", function (event) {
  // Only pages. Scripts, images and API calls are the browser's business.
  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(function () {
      // Honest about being offline rather than quietly serving something old.
      return new Response(OFFLINE_PAGE, {
        status: 503,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }),
  );
});

self.addEventListener("push", function (event) {
  if (!event.data) return;

  var message;
  try {
    message = event.data.json();
  } catch {
    message = { title: "Second Pair", body: event.data.text() };
  }

  event.waitUntil(
    self.registration.showNotification(message.title || "Second Pair", {
      body: message.body || "",
      icon: "/brand/png/app-icon-192.png",
      badge: "/brand/png/favicon-32.png",
      // Same tag replaces rather than stacks, so five messages from one client
      // do not become five notifications.
      tag: message.tag || "second-pair",
      renotify: true,
      data: { url: message.url || "/" },
    }),
  );
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  var target = (event.notification.data && event.notification.data.url) || "/";

  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then(function (windows) {
        // Reuse an open window rather than piling up tabs.
        for (var i = 0; i < windows.length; i++) {
          var client = windows[i];
          if (client.url.indexOf(self.location.origin) === 0 && "focus" in client) {
            client.navigate(target);
            return client.focus();
          }
        }
        if (self.clients.openWindow) return self.clients.openWindow(target);
      }),
  );
});

// A push service can decide a subscription needs replacing. Without this the
// device silently stops receiving anything.
self.addEventListener("pushsubscriptionchange", function (event) {
  event.waitUntil(
    self.registration.pushManager
      .subscribe(event.oldSubscription.options)
      .then(function (subscription) {
        return fetch("/api/push/subscribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subscription: subscription.toJSON() }),
        });
      }),
  );
});
