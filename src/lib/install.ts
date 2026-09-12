/**
 * Holding on to the browser's offer to install, so we can make it ourselves.
 *
 * Chrome decides on its own when to offer "Install", shows it once somewhere
 * in a menu, and if it is dismissed it may never appear again. iOS never
 * offers anything at all. So the phone app — which is the only way an iPhone
 * gets notifications, and the only way anybody gets the badge or the
 * shortcuts — sat behind a prompt the browser might or might not show, in a
 * place most people never look.
 *
 * The event can only be used later if it is caught and kept: it fires once,
 * early, and calling prompt() on it is the only way to open the install dialog
 * from our own button. So it is captured on every page from the root layout
 * and parked on the window, and the panel in Settings asks whether one is
 * waiting whenever somebody opens it.
 *
 * None of this makes the app installable that was not already — the browser
 * still decides. It moves the offer somewhere it can be found.
 */

export type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

declare global {
  interface Window {
    /** The last offer the browser made, or null once it is spent. */
    __spInstall?: InstallEvent | null;
  }
}

/** Fired when an offer arrives or is spent, so anything on screen can redraw. */
export const INSTALL_CHANGED = "sp:install-changed";

/**
 * Start listening. Returns the tidy-up, and is safe to call on the server.
 */
export function watchForInstallOffer(): () => void {
  if (typeof window === "undefined") return () => {};

  const offered = (event: Event) => {
    /*
     * preventDefault, or Chrome shows its own bar as well as ours — and on
     * some versions using the event afterwards is refused because the browser
     * considers it already handled.
     */
    event.preventDefault();
    window.__spInstall = event as InstallEvent;
    window.dispatchEvent(new Event(INSTALL_CHANGED));
  };

  const installed = () => {
    window.__spInstall = null;
    window.dispatchEvent(new Event(INSTALL_CHANGED));
  };

  window.addEventListener("beforeinstallprompt", offered);
  window.addEventListener("appinstalled", installed);

  return () => {
    window.removeEventListener("beforeinstallprompt", offered);
    window.removeEventListener("appinstalled", installed);
  };
}

/**
 * Ask to install, and say whether it happened.
 *
 * The offer is spent either way: an event that has been prompted cannot be
 * prompted again, so it is cleared rather than left to fail silently the
 * second time somebody presses the button.
 */
export async function askToInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
  const offer = typeof window === "undefined" ? null : window.__spInstall;
  if (!offer) return "unavailable";

  try {
    await offer.prompt();
    const { outcome } = await offer.userChoice;
    return outcome;
  } catch {
    return "unavailable";
  } finally {
    window.__spInstall = null;
    window.dispatchEvent(new Event(INSTALL_CHANGED));
  }
}
