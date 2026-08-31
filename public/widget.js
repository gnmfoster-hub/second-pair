/**
 * Second Pair chat widget loader.
 *
 * Drop one line into the business's site:
 *   <script src="https://app.handled.example/widget.js" data-studio="living-canvas-tattoo"></script>
 *
 * Optional:
 *   data-accent="#1d4ed8"   the button colour
 *   data-teaser="..."       the nudge shown after a few seconds
 *   data-position="left"    put it in the other corner
 *
 * Everything the client sees lives inside an iframe, so the business's own CSS
 * and ours can never collide. This file is the only thing that touches their
 * page, so it stays vanilla, small and defensive: no globals, no dependencies,
 * inline styles only.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var slug = script.getAttribute("data-studio");
  if (!slug) {
    console.error("[Second Pair] Missing data-studio on the widget script tag.");
    return;
  }

  var origin = new URL(script.src, window.location.href).origin;
  var accent = script.getAttribute("data-accent") || "#1E5647";
  var teaserText =
    script.getAttribute("data-teaser") || "Hi — anything I can help you with?";
  var onLeft = script.getAttribute("data-position") === "left";

  var STATE_KEY = "secondpair_widget_open";
  var TEASER_KEY = "secondpair_teaser_seen";

  var open = false;
  var teaserShown = false;
  var unread = false;

  // Anyone who has asked not to see motion gets none of it, rather than a
  // slightly shorter version of it.
  var still =
    window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var ease = still ? "0ms" : "260ms cubic-bezier(0.16, 1, 0.3, 1)";

  function narrow() {
    return window.innerWidth < 640;
  }

  function style(element, styles) {
    for (var key in styles) element.style[key] = styles[key];
  }

  // ---------------------------------------------------------------- elements

  var panel = document.createElement("iframe");
  // The accent travels into the frame, so the whole widget wears the
  // business's colour rather than ours. Without it a salon with a pink button
  // gets a blue conversation, which is worse than not offering the option.
  panel.src =
    origin +
    "/widget/" +
    encodeURIComponent(slug) +
    "?a=" +
    encodeURIComponent(accent.replace("#", ""));
  panel.title = "Chat with us";
  panel.setAttribute("aria-hidden", "true");

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "Chat with us");
  button.setAttribute("aria-expanded", "false");

  var icon = document.createElement("span");
  var dot = document.createElement("span");
  var teaser = document.createElement("button");
  teaser.type = "button";
  teaser.textContent = teaserText;

  var CHAT_ICON =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M20 11.5a7.5 7.5 0 0 1-10.9 6.7L4 19.5l1.4-4.6A7.5 7.5 0 1 1 20 11.5Z"/></svg>';

  var CLOSE_ICON =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
    'stroke-width="2.1" stroke-linecap="round" aria-hidden="true">' +
    '<path d="M6 6l12 12M18 6L6 18"/></svg>';

  icon.innerHTML = CHAT_ICON;
  style(icon, { display: "grid", placeItems: "center", transition: "transform " + ease });

  style(dot, {
    position: "absolute",
    top: "2px",
    right: "2px",
    width: "13px",
    height: "13px",
    borderRadius: "50%",
    background: "#ef4444",
    border: "2.5px solid #fff",
    display: "none",
  });

  button.appendChild(icon);
  button.appendChild(dot);

  function layout() {
    var full = narrow();

    style(panel, {
      position: "fixed",
      border: "0",
      zIndex: "2147483000",
      colorScheme: "normal",
      transformOrigin: full ? "center bottom" : onLeft ? "20% 110%" : "80% 110%",
      transition: "opacity " + ease + ", transform " + ease + ", visibility " + ease,
      // On a phone this is a sheet, not a floating card. A 380px box inside a
      // 390px screen is the classic tell of a widget nobody tested on a phone.
      right: full ? "0" : onLeft ? "auto" : "20px",
      left: full ? "0" : onLeft ? "20px" : "auto",
      bottom: full ? "0" : "94px",
      width: full ? "100%" : "384px",
      height: full ? "88%" : "min(620px, calc(100vh - 130px))",
      maxWidth: "100vw",
      borderRadius: full ? "20px 20px 0 0" : "18px",
      boxShadow: "0 16px 50px rgba(10, 12, 16, 0.26), 0 2px 8px rgba(10, 12, 16, 0.1)",
    });

    style(button, {
      position: "fixed",
      bottom: "20px",
      right: onLeft ? "auto" : "20px",
      left: onLeft ? "20px" : "auto",
      width: "58px",
      height: "58px",
      display: "grid",
      placeItems: "center",
      borderRadius: "50%",
      border: "0",
      padding: "0",
      background: accent,
      color: "#fff",
      cursor: "pointer",
      boxShadow: "0 8px 24px rgba(10, 12, 16, 0.3)",
      zIndex: "2147483001",
      transition: "transform " + ease + ", box-shadow " + ease,
      WebkitTapHighlightColor: "transparent",
    });

    style(teaser, {
      position: "fixed",
      bottom: "88px",
      right: onLeft ? "auto" : "20px",
      left: onLeft ? "20px" : "auto",
      maxWidth: "min(260px, calc(100vw - 40px))",
      padding: "11px 14px",
      background: "#fff",
      color: "#16181d",
      font: "400 14px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      textAlign: "left",
      border: "0",
      borderRadius: onLeft ? "14px 14px 14px 4px" : "14px 14px 4px 14px",
      boxShadow: "0 8px 28px rgba(10, 12, 16, 0.18)",
      cursor: "pointer",
      zIndex: "2147483001",
      transition: "opacity " + ease + ", transform " + ease,
    });
  }

  // ------------------------------------------------------------------ render

  function render() {
    layout();

    panel.style.opacity = open ? "1" : "0";
    panel.style.visibility = open ? "visible" : "hidden";
    panel.style.transform = open
      ? "translateY(0) scale(1)"
      : narrow()
        ? "translateY(16px)"
        : "translateY(10px) scale(0.97)";
    panel.setAttribute("aria-hidden", open ? "false" : "true");

    icon.innerHTML = open ? CLOSE_ICON : CHAT_ICON;
    icon.style.transform = open ? "rotate(90deg)" : "rotate(0deg)";
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.setAttribute("aria-label", open ? "Close chat" : "Chat with us");

    if (open) {
      unread = false;
      hideTeaser();
    }
    dot.style.display = unread && !open ? "block" : "none";

    // A phone keyboard plus a page scrolling behind a sheet is horrible, so
    // the page underneath is frozen while it is open.
    document.documentElement.style.overflow = narrow() && open ? "hidden" : "";
  }

  function toggle(next) {
    open = next === undefined ? !open : next;
    try {
      sessionStorage.setItem(STATE_KEY, open ? "1" : "0");
    } catch {
      /* private browsing; it just will not be remembered */
    }
    render();
    if (open) {
      window.setTimeout(function () {
        try {
          panel.contentWindow.focus();
        } catch {
          /* not worth failing over */
        }
      }, 120);
    }
  }

  // ------------------------------------------------------------------ teaser

  function showTeaser() {
    if (open || teaserShown) return;
    try {
      if (sessionStorage.getItem(TEASER_KEY)) return;
    } catch {
      /* carry on */
    }
    teaserShown = true;
    teaser.style.pointerEvents = "auto";
    teaser.style.opacity = "1";
    teaser.style.transform = "translateY(0) scale(1)";
    window.setTimeout(hideTeaser, 12000);
  }

  function hideTeaser() {
    teaser.style.opacity = "0";
    teaser.style.transform = "translateY(8px) scale(0.96)";
    teaser.style.pointerEvents = "none";
    try {
      sessionStorage.setItem(TEASER_KEY, "1");
    } catch {
      /* carry on */
    }
  }

  // -------------------------------------------------------------------- wire

  button.addEventListener("click", function () {
    toggle();
  });
  button.addEventListener("mouseenter", function () {
    if (!still) button.style.transform = "scale(1.06)";
  });
  button.addEventListener("mouseleave", function () {
    button.style.transform = "scale(1)";
  });

  teaser.addEventListener("click", function () {
    hideTeaser();
    toggle(true);
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && open) toggle(false);
  });

  window.addEventListener("resize", function () {
    render();
  });

  // The chat window tells us when a reply landed, so a closed widget can show
  // there is something waiting rather than sitting there silently.
  window.addEventListener("message", function (event) {
    if (event.origin !== origin || !event.data) return;
    if (event.data.secondPair === "reply" && !open) {
      unread = true;
      render();
    }
    if (event.data.secondPair === "close") toggle(false);
  });

  function mount() {
    document.body.appendChild(panel);
    document.body.appendChild(teaser);
    document.body.appendChild(button);

    try {
      open = sessionStorage.getItem(STATE_KEY) === "1";
    } catch {
      /* default closed */
    }

    // Start hidden without animating in from nothing on first paint.
    teaser.style.opacity = "0";
    teaser.style.transform = "translateY(8px) scale(0.96)";
    teaser.style.pointerEvents = "none";

    render();

    // Long enough not to feel like a pop-up, early enough to catch somebody
    // still reading the page.
    if (!open) window.setTimeout(showTeaser, 9000);
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
