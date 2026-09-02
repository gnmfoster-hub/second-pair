/**
 * Service worker.
 *
 * Deliberately minimal: it exists to receive push notifications and to open
 * the right page when one is tapped. No offline caching — a diary showing
 * yesterday's bookings because it came from a cache is worse than a diary that
 * says it cannot reach the internet.
 */

/*
 * A fetch handler that does nothing, on purpose.
 *
 * Chrome will not offer to install an app unless its service worker handles
 * fetch — it is how the browser decides the thing is app-shaped rather than a
 * page with a manifest bolted on. Without this there is no "Install" in the
 * menu and no prompt, which is exactly what was happening.
 *
 * It forwards every request to the network and caches nothing. The reasoning
 * in the comment above still stands: a diary showing yesterday's bookings
 * because they came from a cache is worse than one saying it cannot reach the
 * internet. This makes the app installable without making it lie.
 */
self.addEventListener("fetch", function () {
  // Deliberately empty. Not calling respondWith lets the browser handle the
  // request exactly as it would with no service worker at all.
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
