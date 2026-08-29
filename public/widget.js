/**
 * InkDesk chat widget loader.
 *
 * Drop one line into the studio's site:
 *   <script src="https://app.inkdesk.example/widget.js" data-studio="living-canvas-tattoo"></script>
 *
 * Everything the client sees lives inside an iframe, so the studio's own CSS
 * and ours can never collide.
 */
(function () {
  "use strict";

  var script = document.currentScript;
  if (!script) return;

  var slug = script.getAttribute("data-studio");
  if (!slug) {
    console.error("[InkDesk] Missing data-studio on the widget script tag.");
    return;
  }

  var origin = new URL(script.src, window.location.href).origin;
  var accent = script.getAttribute("data-accent") || "#e8482f";
  var open = false;

  var panel = document.createElement("iframe");
  panel.src = origin + "/widget/" + encodeURIComponent(slug);
  panel.title = "Chat with the studio";
  panel.setAttribute("aria-hidden", "true");
  setStyle(panel, {
    position: "fixed",
    right: "20px",
    bottom: "92px",
    width: "380px",
    height: "560px",
    maxWidth: "calc(100vw - 40px)",
    maxHeight: "calc(100vh - 120px)",
    border: "0",
    borderRadius: "16px",
    boxShadow: "0 12px 40px rgba(0,0,0,.28)",
    zIndex: "2147483000",
    display: "none",
    colorScheme: "normal",
  });

  var button = document.createElement("button");
  button.type = "button";
  button.setAttribute("aria-label", "Chat with the studio");
  setStyle(button, {
    position: "fixed",
    right: "20px",
    bottom: "20px",
    width: "56px",
    height: "56px",
    borderRadius: "50%",
    border: "0",
    background: accent,
    color: "#fff",
    fontSize: "24px",
    lineHeight: "1",
    cursor: "pointer",
    boxShadow: "0 6px 20px rgba(0,0,0,.28)",
    zIndex: "2147483001",
  });
  button.textContent = "✕";

  function render() {
    panel.style.display = open ? "block" : "none";
    panel.setAttribute("aria-hidden", open ? "false" : "true");
    button.textContent = open ? "✕" : "💬";
    button.setAttribute("aria-expanded", open ? "true" : "false");
  }

  button.addEventListener("click", function () {
    open = !open;
    render();
  });

  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && open) {
      open = false;
      render();
    }
  });

  function mount() {
    document.body.appendChild(panel);
    document.body.appendChild(button);
    render();
  }

  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);

  function setStyle(element, styles) {
    for (var key in styles) element.style[key] = styles[key];
  }
})();
