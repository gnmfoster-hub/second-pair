/**
 * Second Pair chat widget loader.
 *
 * Drop one line into the business's site:
 *   <script src="https://www.second-pair.com/widget.js" data-studio="living-canvas-tattoo"></script>
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
  var accent = script.getAttribute("data-accent") || "#14243F";
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

  /*
   * The nudge types itself out, the way the assistant would.
   *
   * Every widget on the internet pops a finished sentence into a bubble, which
   * reads as an advert because that is what it is — nothing wrote it, it was
   * always there. Watching a line arrive says something an advert cannot: that
   * there is something on the other end composing an answer right now. That is
   * the entire promise of the product, made before anybody has clicked.
   *
   * Two layers rather than one growing string. The remainder sits in the
   * bubble the whole time with visibility hidden, so the shape is its final
   * size from the first character and nothing on the page reflows underneath
   * it. A bubble that grows character by character shoves the corner of
   * somebody's website around for two seconds, which is the sort of thing that
   * gets a widget removed.
   */
  var teaserSaid = document.createElement("span");
  var teaserRest = document.createElement("span");
  teaserRest.style.visibility = "hidden";
  var teaserDots = document.createElement("span");
  teaserDots.setAttribute("aria-hidden", "true");
  teaser.appendChild(teaserDots);
  teaser.appendChild(teaserSaid);
  teaser.appendChild(teaserRest);

  // Read by anything assistive as the finished sentence, never letter by
  // letter — the animation is decoration and should not be narrated.
  teaser.setAttribute("aria-label", teaserText);

  var typing = 0;
  var frame = 0;

  /*
   * Two dots in a bubble, not an outlined speech balloon.
   *
   * The stock balloon is the icon on every chat widget there is, so it reads as
   * "widget" before it reads as anything else. Two dots inside one is the
   * typing indicator everybody already knows on sight — it says somebody is
   * about to answer, which is the entire promise — and it is the shape of our
   * own mark, so the product and the button agree.
   */
  var CHAT_ICON =
    '<svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">' +
    '<path d="M6 2.5h14a3.5 3.5 0 0 1 3.5 3.5v8a3.5 3.5 0 0 1-3.5 3.5h-7.5l-6 4.5V17.5H6A3.5 3.5 0 0 1 2.5 14V6A3.5 3.5 0 0 1 6 2.5Z" ' +
    'fill="currentColor" opacity="0.22"/>' +
    '<circle cx="9.5" cy="10" r="2.1" fill="currentColor"/>' +
    '<circle cx="16.5" cy="10" r="2.1" fill="currentColor"/></svg>';

  /* The same two dots as the mark, so the wait and the button agree. */
  var TEASER_DOTS =
    '<span style="display:inline-flex;gap:4px;vertical-align:middle">' +
    '<span style="width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.35;' +
    'animation:sp-breathe 1.1s ease-in-out infinite"></span>' +
    '<span style="width:5px;height:5px;border-radius:50%;background:currentColor;opacity:.35;' +
    'animation:sp-breathe 1.1s ease-in-out .38s infinite"></span></span>';

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
      /*
       * It grows out of the button, from the corner that points at it.
       *
       * The origin was up near the middle of the panel, so it expanded from
       * roughly nowhere and read as a box fading in. Anchoring it to the
       * pinched corner makes the button and the panel one movement.
       */
      transformOrigin: full ? "center bottom" : onLeft ? "0% 100%" : "100% 100%",
      transition: "opacity " + ease + ", transform " + ease + ", visibility " + ease,
      // On a phone this is a sheet, not a floating card. A 380px box inside a
      // 390px screen is the classic tell of a widget nobody tested on a phone.
      right: full ? "0" : onLeft ? "auto" : "20px",
      left: full ? "0" : onLeft ? "20px" : "auto",
      bottom: full ? "0" : "94px",
      width: full ? "100%" : "384px",
      height: full ? "88%" : "min(620px, calc(100vh - 130px))",
      maxWidth: "100vw",
      /*
       * A bubble anchored to its button, not a rectangle floating near one.
       *
       * Uniform corners are what every widget does, and they leave the panel
       * looking like it happens to be nearby. Pulling in the corner nearest
       * the launcher points the whole shape at it — the same trick the teaser
       * above already uses, so the two now read as one thing.
       *
       * Full-screen on a phone keeps square lower corners: there is no button
       * to point at, and rounding into the bottom of the screen only shows a
       * strip of the page behind.
       */
      borderRadius: full ? "22px 22px 0 0" : onLeft ? "22px 22px 22px 6px" : "22px 22px 6px 22px",
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
    // Small enough that it visibly comes from the button. 0.97 was a nudge
    // nobody could see, which is the same as no animation with the cost of one.
    panel.style.transform = open
      ? "translateY(0) scale(1)"
      : narrow()
        ? "translateY(16px)"
        : "translateY(8px) scale(0.88)";
    panel.setAttribute("aria-hidden", open ? "false" : "true");

    icon.innerHTML = open ? CLOSE_ICON : CHAT_ICON;
    icon.style.transform = open ? "rotate(90deg)" : "rotate(0deg)";
    // The button steps back while the panel is up: it is no longer the thing
    // being offered, and a full-size button under an open panel competes.
    button.style.transform = open ? "scale(0.88)" : "scale(1)";
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

    type();
  }

  /*
   * A beat of thinking, then the line.
   *
   * The pause matters more than the typing does: a sentence that starts the
   * instant the bubble lands was clearly pre-written, and the whole point is
   * that it does not look pre-written.
   *
   * Twelve seconds on screen is counted from when the line finishes, not from
   * when the bubble appears — otherwise a long nudge spends most of its life
   * half-written.
   */
  function type() {
    // Nobody asked for animation. Say the thing and stop.
    if (still) {
      teaserSaid.textContent = teaserText;
      teaserRest.textContent = "";
      typing = window.setTimeout(hideTeaser, 12000);
      return;
    }

    teaserSaid.textContent = "";
    teaserRest.textContent = teaserText;
    teaserDots.innerHTML = TEASER_DOTS;

    /*
     * Driven by the clock and by frames, not by a chain of timers.
     *
     * The obvious way to write this is setTimeout(step, 26) calling itself.
     * It is also wrong, and measurably so: Chrome clamps timers in a tab that
     * is not in front to roughly one second, so a 26ms delay fires at 939ms
     * and a fifty-character line takes forty-eight seconds instead of one and
     * a half. Somebody opening a salon's site in a background tab would come
     * back to a half-written sentence, and the twelve seconds it is meant to
     * be readable for would not have started.
     *
     * requestAnimationFrame does not run at all in a background tab, so the
     * nudge simply waits and plays properly when somebody is actually looking
     * at it. And because each frame asks "how much should be showing by now?"
     * rather than "show one more", a dropped or late frame is caught up on the
     * next one instead of stretching the whole line.
     */
    var THINK = 700;
    var schedule = [];
    var when = 0;
    for (var i = 0; i < teaserText.length; i++) {
      when += 26;
      schedule.push(when);
      /*
       * Slower after a comma or a full stop. Even typing is a machine typing;
       * the pauses are most of what makes it read as somebody thinking.
       */
      var c = teaserText.charAt(i);
      if (c === "." || c === "?" || c === "!") when += 260;
      else if (c === "," || c === ";") when += 150;
    }

    var began = null;
    frame = window.requestAnimationFrame(function step(now) {
      if (began === null) began = now;
      var gone = now - began;

      // The beat before it starts. A sentence that arrives the instant the
      // bubble lands was obviously pre-written, which is the one thing this is
      // trying not to look like.
      if (gone < THINK) {
        frame = window.requestAnimationFrame(step);
        return;
      }
      teaserDots.innerHTML = "";

      var at = 0;
      while (at < schedule.length && schedule[at] <= gone - THINK) at++;
      teaserSaid.textContent = teaserText.slice(0, at);
      teaserRest.textContent = teaserText.slice(at);

      if (at >= teaserText.length) {
        frame = 0;
        typing = window.setTimeout(hideTeaser, 12000);
        return;
      }
      frame = window.requestAnimationFrame(step);
    });
  }

  function hideTeaser() {
    /*
     * Stop typing into a bubble nobody can see any more.
     *
     * Without this, opening the widget mid-sentence leaves a timer running
     * that keeps writing into a hidden element for another two seconds, and
     * the next time the bubble is shown it starts from wherever that got to.
     */
    window.clearTimeout(typing);
    if (frame) window.cancelAnimationFrame(frame);
    frame = 0;
    teaserSaid.textContent = teaserText;
    teaserRest.textContent = "";
    teaserDots.innerHTML = "";

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
    /*
     * One keyframe, and nothing else.
     *
     * This script has never put a stylesheet on anybody's website and it is
     * not going to start — every other rule here is an inline style, which
     * cannot leak. An animation is the one thing that cannot be expressed
     * inline, so it gets a uniquely prefixed name and its own tag, added once.
     */
    if (!document.getElementById("sp-widget-keyframes")) {
      var sheet = document.createElement("style");
      sheet.id = "sp-widget-keyframes";
      sheet.textContent =
        "@keyframes sp-breathe{0%,100%{opacity:.28;transform:translateY(0)}" +
        "50%{opacity:.85;transform:translateY(-1.5px)}}";
      document.head.appendChild(sheet);
    }

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
