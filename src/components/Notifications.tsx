"use client";

import { useEffect, useState } from "react";

/**
 * Turning on notifications for this device.
 *
 * Deliberately per-device rather than per-account: the owner's phone should
 * buzz, the salon iPad probably should not, and that is a decision made by
 * whoever is holding the thing.
 *
 * The permission prompt is never fired on page load. A browser that is asked
 * the moment somebody arrives usually gets refused, and a refusal is sticky —
 * the prompt cannot be shown again without the user digging into site
 * settings. So it is asked only after a deliberate click.
 */
type State = "checking" | "unsupported" | "denied" | "off" | "on" | "working";

/**
 * The VAPID key arrives base64url encoded and the browser wants raw bytes.
 *
 * Typed as ArrayBuffer rather than Uint8Array because a Uint8Array can sit on
 * a SharedArrayBuffer, which subscribe() will not take.
 */
function urlBase64ToBytes(base64: string): ArrayBuffer {
  const padded = (base64 + "=".repeat((4 - (base64.length % 4)) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  const bytes = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return bytes.buffer;
}

/** "iPhone", "this Mac" — enough to tell two devices apart in a list. */
function describeDevice(): string {
  const ua = navigator.userAgent;
  if (/iPhone/.test(ua)) return "iPhone";
  if (/iPad/.test(ua)) return "iPad";
  if (/Android/.test(ua)) return "Android phone";
  if (/Macintosh/.test(ua)) return "Mac";
  if (/Windows/.test(ua)) return "Windows PC";
  return "This device";
}

export function Notifications() {
  const [state, setState] = useState<State>("checking");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      if (
        typeof window === "undefined" ||
        !("serviceWorker" in navigator) ||
        !("PushManager" in window) ||
        !("Notification" in window)
      ) {
        if (!cancelled) setState("unsupported");
        return;
      }

      if (Notification.permission === "denied") {
        if (!cancelled) setState("denied");
        return;
      }

      try {
        const registration = await navigator.serviceWorker.register("/sw.js");
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setState(existing ? "on" : "off");
      } catch {
        if (!cancelled) setState("unsupported");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  async function turnOn() {
    setState("working");
    setError("");

    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setState(permission === "denied" ? "denied" : "off");
        return;
      }

      const registration = await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) {
        setError("Notifications are not configured on the server yet.");
        setState("off");
        return;
      }

      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToBytes(key),
      });

      const response = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subscription: subscription.toJSON(),
          label: describeDevice(),
        }),
      });

      if (!response.ok) throw new Error("Could not register this device.");
      setState("on");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
      setState("off");
    }
  }

  async function turnOff() {
    setState("working");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await fetch(
          `/api/push/subscribe?endpoint=${encodeURIComponent(subscription.endpoint)}`,
          { method: "DELETE" },
        );
        await subscription.unsubscribe();
      }
      setState("off");
    } catch {
      setState("on");
    }
  }

  return (
    <div className="card p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 className="section-title">Tell me when someone needs me</h2>
          <p className="hint mt-1 max-w-prose">
            The assistant handles almost everything. When it genuinely cannot — a complaint,
            anything medical, someone under 18, anyone asking for a person — it stops and
            hands over. This is how you find out, without checking.
          </p>
        </div>

        {state === "on" ? (
          <button type="button" onClick={turnOff} className="btn-ghost shrink-0">
            Turn off
          </button>
        ) : state === "off" ? (
          <button
            type="button"
            onClick={turnOn}
            className="btn shrink-0 bg-highlight font-semibold text-[#17150f] hover:brightness-95"
          >
            Turn on
          </button>
        ) : null}
      </div>

      <div className="mt-4 text-sm">
        {state === "checking" && <span className="text-muted">Checking…</span>}

        {state === "working" && <span className="text-muted">One moment…</span>}

        {state === "on" && (
          <span className="pill bg-ok/10 text-ok">
            On for {describeDevice().toLowerCase()}
          </span>
        )}

        {state === "off" && (
          <span className="text-muted">
            Off. Turn it on once per device — your phone and your computer are separate.
          </span>
        )}

        {state === "denied" && (
          <span className="text-warn">
            Your browser is blocking notifications for this site. Turn them back on in the
            padlock menu next to the address, then reload.
          </span>
        )}

        {state === "unsupported" && (
          <span className="text-muted">
            This browser cannot do notifications. On an iPhone, add Second Pair to your home
            screen first and open it from there.
          </span>
        )}
      </div>

      {error && <p className="mt-2 text-sm text-bad">{error}</p>}
    </div>
  );
}
