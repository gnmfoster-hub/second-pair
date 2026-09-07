/**
 * Second Pair chat widget loader.
 *
 * Drop one line into the business's site:
 *   <script src="https://www.second-pair.com/widget.js" data-studio="living-canvas-tattoo"></script>
 *
 * Optional:
 *   data-accent="#1d4ed8"   the button colour
 *   data-text="#ffffff"     the writing on it
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
  /*
   * The script tag still wins, and is no longer the only way.
   *
   * These live in the HTML of the business's own website, so an owner who
   * rebrands could not change their colour without editing their site. They
   * are settings now, fetched with the status — but somebody who has
   * deliberately written data-accent into their page should not be quietly
   * overruled, so anything set here beats what we hold.
   */
  var tagAccent = script.getAttribute("data-accent") || null;
  var tagText = script.getAttribute("data-text") || null;
  var tagTeaser = script.getAttribute("data-teaser") || null;
  var tagPosition = script.getAttribute("data-position");

  var accent = tagAccent || "#14243F";
  var textColour = tagText || "#ffffff";

  /*
   * What the button is, before the business's own answer arrives.
   *
   * The middle of every choice, so the one repaint between drawing it and
   * hearing back is the smallest it can be for the most people.
   */
  var shape = { height: 56, radius: "999px", icon: 24, font: 13.5, padding: 18 };
  var pulse = { rings: 2, every: 0, until: 0 };
  var bubbleLook = {
    fill: "#ffffff",
    text: "#16181d",
    shadow: "0 8px 28px rgba(10, 12, 16, 0.18)",
  };
  var teaserText = tagTeaser || "Hi — anything I can help you with?";
  var onLeft = tagPosition === "left";

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

  /*
   * Take it all off the page.
   *
   * For a business that has switched the widget off. Hiding is not enough: a
   * hidden button is still in the document, still in the accessibility tree,
   * and still somewhere a keyboard can land. Timers go too, or the nudge
   * arrives nine seconds later looking for elements that are gone.
   */
  var timers = [];
  function teardown() {
    stopPulsing();
    for (var i = 0; i < timers.length; i++) window.clearTimeout(timers[i]);
    timers = [];
    [button, teaser, panel].forEach(function (el) {
      if (el && el.parentNode) el.parentNode.removeChild(el);
    });
  }

  /** setTimeout, remembered, so teardown can cancel it. */
  function later(fn, ms) {
    var id = window.setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  /*
   * Keyframes, which an inline style cannot express.
   *
   * One <style> of our own with names nobody else would pick, rather than
   * anything that could collide with the business's own CSS. Skipped entirely
   * for somebody who has asked for no motion — they get a button that is
   * simply there, which is a complete answer and not a lesser one.
   */
  /** The button's ordinary drop shadow, in one place because two need it. */
  var REST = "0 8px 24px rgba(10, 12, 16, 0.3)";

  function addKeyframes() {
    if (still || document.getElementById("secondpair-motion")) return;
    var sheet = document.createElement("style");
    sheet.id = "secondpair-motion";
    sheet.textContent =
      "@keyframes secondpair-arrive{" +
      "0%{transform:scale(0.6) translateY(12px);opacity:0}" +
      "60%{transform:scale(1.06) translateY(0);opacity:1}" +
      "100%{transform:scale(1) translateY(0);opacity:1}}" +
      // A ring that leaves the button and fades, rather than the button
      // itself moving. Something arriving in the corner of an eye reads as a
      // notification; the button jumping about reads as a broken page.
      // The drop shadow is repeated in every frame. Animating box-shadow
      // replaces the whole property, so leaving it out flattens the button
      // against the page for the length of the animation.
      "@keyframes secondpair-ring{" +
      "0%{box-shadow:" + REST + ",0 0 0 0 var(--sp-ring)}" +
      "70%{box-shadow:" + REST + ",0 0 0 14px rgba(0,0,0,0)}" +
      "100%{box-shadow:" + REST + ",0 0 0 0 rgba(0,0,0,0)}}";
    document.head.appendChild(sheet);
  }

  /*
   * Rings, at the moment there is something to read.
   *
   * How many times is the business's, not ours. The default rings twice and
   * stops; a business on a busy page can ask for it to keep going. Either way
   * it stops the moment somebody opens the chat or waves the nudge away, and
   * it stops on its own after a couple of minutes regardless — by then they
   * have seen it, and repeating a thing to somebody who has already answered
   * is how a signal turns into a nuisance.
   *
   * Nothing at all for anybody who has asked for no motion.
   */
  var pulsing = null;
  var pulseStops = null;
  /** Whether it has rung at all yet, so two routes cannot both start it. */
  var ringing = false;

  /*
   * Start ringing.
   *
   * "Ring once" hangs off the nudge, which is right: the ring is there to say
   * something has arrived, and the nudge is the something.
   *
   * "Keep ringing" cannot hang off the nudge, and did. The nudge shows once per
   * session and never again, so on the second page somebody visited there was
   * no nudge and therefore no ring — a business had switched on a thing that
   * only worked for a first-time visitor who waited nine seconds. This is
   * started from the answer arriving instead, and guards against being started
   * twice when both routes fire.
   */
  function startPulsing() {
    if (still || !pulse || pulsing || ringing) return;
    addKeyframes();
    ringing = true;
    ring();

    if (!pulse.every) return;

    pulsing = window.setInterval(ring, pulse.every);
    pulseStops = later(stopPulsing, pulse.until);
  }

  function ring() {
    button.style.setProperty("--sp-ring", ringColour());
    // Restarting the same animation needs it cleared and the element read, or
    // the browser treats the second one as still the first and shows nothing.
    button.style.animation = "";
    void button.offsetWidth;
    button.style.animation = "secondpair-ring 1.6s ease-out " + pulse.rings;
  }

  function stopPulsing() {
    if (pulsing) window.clearInterval(pulsing);
    if (pulseStops) window.clearTimeout(pulseStops);
    pulsing = null;
    pulseStops = null;
    ringing = true;
    button.style.animation = "";
  }

  /** The ring, in their colour, faint enough to be a glow and not a border. */
  function ringColour() {
    var m = /^#?([0-9a-f]{6})$/i.exec(accent || "");
    if (!m) return "rgba(20, 36, 63, 0.45)";
    var n = parseInt(m[1], 16);
    return (
      "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + ",0.45)"
    );
  }

  function style(element, styles) {
    for (var key in styles) element.style[key] = styles[key];
  }

  // ---------------------------------------------------------------- elements

  var panel = document.createElement("iframe");
  /*
   * Loaded the first time somebody opens it, not on every page view.
   *
   * This used to point at the conversation immediately, so every visitor to
   * every customer's site downloaded and booted a chat application they would
   * probably never open — on somebody else's page, against somebody else's
   * performance budget.
   *
   * It also had to be built before the business's own colour had arrived, so
   * the accent could only ever come from the script tag. Waiting until it is
   * opened means the settings are already here, and the whole conversation
   * wears their colour rather than ours.
   */
  function loadPanel() {
    if (panel.src) return;
    panel.src =
      origin +
      "/widget/" +
      encodeURIComponent(slug) +
      "?a=" +
      encodeURIComponent(accentNow().replace("#", "")) +
      "&t=" +
      encodeURIComponent(textNow().replace("#", ""));
  }

  /** Their setting, unless the page has deliberately overridden it. */
  function accentNow() {
    if (tagAccent) return tagAccent;
    return status && status.accent ? "#" + status.accent : "#14243F";
  }

  /*
   * The writing on the button.
   *
   * Worked out on the server and sent already decided, rather than by a copy
   * of the rule living here. There were three copies of that rule and they
   * disagreed: the panel darkened a pale colour, the button did not, and the
   * settings page described a behaviour neither of them had. A business can now
   * set this themselves; when they have not, the server picks whichever of
   * white and near-black reads better on their colour.
   */
  function textNow() {
    if (tagText) return tagText;
    return status && status.text ? "#" + status.text : "#ffffff";
  }

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

  /* performance.now where it exists, so the clock cannot jump backwards. */
  function now() {
    return window.performance && window.performance.now
      ? window.performance.now()
      : new Date().getTime();
  }

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

  /*
   * The two pieces that turn the circle into a sentence: a live dot and a
   * line of text. Created always, shown only when there is something true to
   * say — see the pill comment in layout().
   */
  var label = document.createElement("span");
  var pulse = document.createElement("span");
  var status = null;

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
    display: "none",
  });

  button.appendChild(icon);
  button.appendChild(pulse);
  button.appendChild(label);
  button.appendChild(dot);

  /*
   * Ask the business whether it is open, and say so.
   *
   * Deliberately after the button already exists and is usable. If this never
   * answers — offline, blocked, a slow server — the launcher stays exactly the
   * circle it has always been, and nothing about asking a question is worse
   * than it was. A status that cannot be fetched is not a status worth
   * blocking a chat button for.
   */
  function askStatus() {
    try {
      fetch(origin + "/api/widget/status?studio=" + encodeURIComponent(slug), {
        credentials: "omit",
      })
        .then(function (r) {
          return r.ok ? r.json() : null;
        })
        .then(function (got) {
          if (!got) return;

          /*
           * Switched off in their settings.
           *
           * Everything goes, rather than being hidden: a display:none button is
           * still in the page, still in the accessibility tree, still something
           * a keyboard lands on. Somebody who has turned this off has turned it
           * off.
           *
           * It arrives after the button is drawn because the answer comes over
           * the network, so this is a removal and not a decision not to draw.
           * The button is one repaint old at worst.
           */
          if (got.off) {
            teardown();
            return;
          }

          if (typeof got.line !== "string") return;
          status = got;

          // Their look, unless the page said otherwise.
          if (!tagAccent && got.accent) accent = "#" + got.accent;
          if (!tagText && got.text) textColour = "#" + got.text;
          if (got.geometry) shape = got.geometry;
          if (got.bubble) bubbleLook = got.bubble;
          // Null is a real answer here — it means they have asked for none.
          // Null is a real answer here — it means they have asked for none.
          if ("pulse" in got) pulse = got.pulse;

          /*
           * A repeating ring starts on its own, rather than waiting for a
           * nudge that may never come. Four seconds is long enough for the
           * page to have settled and short enough to still be the same glance.
           */
          if (pulse && pulse.every && !open) later(startPulsing, 4000);
          if (!tagTeaser && got.teaser) {
            teaserText = got.teaser;
            teaser.setAttribute("aria-label", teaserText);
          }
          if (tagPosition == null && got.position) onLeft = got.position === "left";

          layout();
        })
        .catch(function () {
          /* the circle is a perfectly good button */
        });
    } catch {
      /* older browsers, same answer */
    }
  }

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
      // Clear of the button, whatever size they chose it to be.
      bottom: full ? "0" : shape.height + 38 + "px",
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

    /*
     * Not a circle.
     *
     * Every chat widget on the internet is a coloured circle in the corner of
     * a website, and they are interchangeable: the shape says "somebody bolted
     * a chat thing on here" and nothing else. A visitor at ten at night has no
     * reason to think this one is any different from the last five that took a
     * message and emailed somebody in the morning.
     *
     * So it is a pill that says what it is doing — "Answering now", or the day
     * they are back if they are shut. That is the whole product, stated before
     * anybody has clicked, and it is true because it is computed from the
     * business's own hours in its own timezone.
     *
     * It collapses back to a circle when there is nothing to say, which is
     * exactly what the ordinary widget always was.
     */
    var wide = Boolean(status && status.line) && !open;

    style(button, {
      position: "fixed",
      bottom: "20px",
      right: onLeft ? "auto" : "20px",
      left: onLeft ? "20px" : "auto",
      height: shape.height + "px",
      minWidth: shape.height + "px",
      display: "flex",
      alignItems: "center",
      gap: wide ? "10px" : "0",
      padding: wide ? "0 " + shape.padding + "px 0 " + Math.round(shape.padding * 0.67) + "px" : "0",
      justifyContent: "center",
      // Their shape: a pill, a rounded rectangle, or nearly a square, so it
      // can sit next to buttons the business did not ask us to design.
      borderRadius: shape.radius,
      border: "0",
      background: accent,
      color: textColour,
      cursor: "pointer",
      font:
        "500 " + shape.font + "px/1.2 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      letterSpacing: "0.005em",
      whiteSpace: "nowrap",
      boxShadow: REST,
      zIndex: "2147483001",
      // Width animates too, so it grows into a sentence rather than appearing
      // as one — which is the bit that catches an eye already on the page.
      transition:
        "transform " + ease + ", box-shadow " + ease + ", padding " + ease + ", gap " + ease,
      WebkitTapHighlightColor: "transparent",
    });

    label.textContent = wide ? status.line : "";
    style(label, {
      display: wide ? "block" : "none",
      opacity: wide ? "1" : "0",
      transition: "opacity " + ease,
    });

    // The ring around the unread badge is a hole punched in the button, so it
    // has to be the button's colour rather than white.
    dot.style.border = "2.5px solid " + accent;

    // A live dot beside the words, green when somebody really is answering.
    style(pulse, {
      display: wide ? "block" : "none",
      width: "7px",
      height: "7px",
      borderRadius: "50%",
      flex: "none",
      background: status && status.open ? "#4ade80" : textColour,
      opacity: status && status.open ? "1" : "0.5",
      boxShadow: status && status.open ? "0 0 0 3px rgba(74,222,128,0.25)" : "none",
    });

    style(teaser, {
      position: "fixed",
      bottom: shape.height + 32 + "px",
      right: onLeft ? "auto" : "20px",
      left: onLeft ? "20px" : "auto",
      maxWidth: "min(260px, calc(100vw - 40px))",
      padding: "11px 14px",
      background: bubbleLook.fill,
      color: bubbleLook.text,
      font: "400 14px/1.45 -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif",
      textAlign: "left",
      border: "0",
      borderRadius: onLeft ? "14px 14px 14px 4px" : "14px 14px 4px 14px",
      boxShadow: bubbleLook.shadow,
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
    /*
     * Scaled rather than redrawn.
     *
     * Both marks are 26px squares with the size written into the SVG, so CSS
     * on the span around them does nothing. A transform costs no layout and
     * the mark keeps its proportions against a button that changed size.
     */
    icon.style.transform =
      (open ? "rotate(90deg)" : "rotate(0deg)") + " scale(" + shape.icon / 26 + ")";
    // The button steps back while the panel is up: it is no longer the thing
    // being offered, and a full-size button under an open panel competes.
    button.style.transform = open ? "scale(0.88)" : "scale(1)";
    button.setAttribute("aria-expanded", open ? "true" : "false");
    button.setAttribute("aria-label", open ? "Close chat" : "Chat with us");

    if (open) {
      unread = false;
      hideTeaser();
      /*
       * They opened it, so the ringing has done its job.
       *
       * This used to live in hideTeaser, which also runs on the timer that
       * takes the nudge away after twelve seconds — so a business that asked
       * for a ring every six seconds got two rings and then silence. Letting a
       * bubble time out is not the same as a person answering.
       */
      stopPulsing();
    }
    dot.style.display = unread && !open ? "block" : "none";

    // A phone keyboard plus a page scrolling behind a sheet is horrible, so
    // the page underneath is frozen while it is open.
    document.documentElement.style.overflow = narrow() && open ? "hidden" : "";
  }

  function toggle(next) {
    open = next === undefined ? !open : next;
    // The conversation is fetched the first time it is actually wanted.
    if (open) loadPanel();
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

    startPulsing();
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
     * Driven by the clock, not by a chain of timers.
     *
     * The obvious way to write this is setTimeout(step, 26) calling itself.
     * It is also wrong, and measurably so: Chrome clamps timers in a tab that
     * is not in front to roughly one second, so a 26ms delay fires at 939ms
     * and a fifty-character line takes forty-eight seconds instead of one and
     * a half. Somebody opening a salon's site in a background tab would come
     * back to a half-written sentence, and the twelve seconds it is meant to
     * be readable for would not have started.
     *
     * The cure is not a different kind of timer. It is to stop trusting the
     * timer to keep time: each tick asks how much should be showing by now
     * rather than showing one more character, so a late tick catches up
     * instead of stretching the line.
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

    /*
     * A timer pump, told the time by the clock.
     *
     * This asks on every tick how much should be showing by now rather than
     * revealing one more character, so a late tick catches up instead of
     * stretching the line. That is the part that matters: a browser clamps
     * timers in a tab that is not in front to about a second, and without the
     * arithmetic a fifty-character line would take the best part of a minute.
     *
     * Frames were tried here and are wrong for the same reason they were wrong
     * on the homepage demo. requestAnimationFrame does not run at all in a tab
     * that is not being painted, and the failure is not a nudge that waits
     * politely — it is an empty bubble sitting at its full width on somebody's
     * website, which looks far more broken than no bubble at all.
     */
    var began = now();
    typing = window.setInterval(function () {
      var gone = now() - began;

      // The beat before it starts. A sentence that arrives the instant the
      // bubble lands was obviously pre-written, which is the one thing this is
      // trying not to look like.
      if (gone < THINK) return;
      teaserDots.innerHTML = "";

      var at = 0;
      while (at < schedule.length && schedule[at] <= gone - THINK) at++;
      teaserSaid.textContent = teaserText.slice(0, at);
      teaserRest.textContent = teaserText.slice(at);

      if (at >= teaserText.length) {
        window.clearInterval(typing);
        typing = window.setTimeout(hideTeaser, 12000);
      }
    }, 40);
  }

  function hideTeaser() {
    /*
     * Stop typing into a bubble nobody can see any more.
     *
     * Without this, opening the widget mid-sentence leaves a timer running
     * that keeps writing into a hidden element for another two seconds, and
     * the next time the bubble is shown it starts from wherever that got to.
     */
    // It may be a pump or it may be the hide timer; both live in the same
    // handle and clearing the wrong kind is harmless.
    window.clearTimeout(typing);
    window.clearInterval(typing);
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

  /*
   * Dismissing the nudge is an answer too, even though it is a no.
   *
   * Somebody who has waved it away has seen it. Ringing at them for another
   * two minutes is arguing.
   */
  teaser.addEventListener("keydown", function (event) {
    if (event.key === "Escape") stopPulsing();
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

    // Asked once the button is on the page, so a slow answer never delays it.
    askStatus();
    /*
     * And again on the hour, for the tab somebody leaves open all afternoon.
     * A launcher saying "Answering now" two hours after closing is worse than
     * one that never said anything.
     */
    window.setInterval(askStatus, 15 * 60 * 1000);

    try {
      open = sessionStorage.getItem(STATE_KEY) === "1";
    } catch {
      /* default closed */
    }

    // Start hidden without animating in from nothing on first paint.
    teaser.style.opacity = "0";
    teaser.style.transform = "translateY(8px) scale(0.96)";
    teaser.style.pointerEvents = "none";

    // Somebody who had it open when they navigated gets it back, which means
    // the conversation is genuinely wanted and should load now.
    if (open) loadPanel();

    render();

    /*
     * It grows in rather than being there.
     *
     * The page has usually settled by now, so a button that simply exists on
     * the next repaint is not noticed at all — somebody who has already looked
     * at that corner never looks again. One small arrival, once per page load,
     * and never for anybody who has asked for no motion.
     */
    if (!open && !still) {
      addKeyframes();
      button.style.animation = "secondpair-arrive 420ms cubic-bezier(0.16, 1, 0.3, 1) both";
      window.setTimeout(function () {
        button.style.animation = "";
      }, 600);
    }

    // Long enough not to feel like a pop-up, early enough to catch somebody
    // still reading the page.
    if (!open) later(showTeaser, 9000);
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
