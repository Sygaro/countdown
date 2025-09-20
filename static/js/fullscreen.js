// static/js/fullscreen.js
// Viser en knapp for å aktivere fullskjerm i vanlige nettlesere.
// Skjules helt i kiosk-miljøer (Cog/WPE/WebKit DRM/KMS) og når API ikke støttes.

(function () {
  const doc = document;
  const de = doc.documentElement;

  function isSupported() {
    return !!(de.requestFullscreen || de.webkitRequestFullscreen || de.mozRequestFullScreen || de.msRequestFullscreen);
  }
  function inFullscreen() {
    return !!(
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    );
  }
  function requestFS() {
    const el = de;
    (el.requestFullscreen || el.webkitRequestFullscreen || el.mozRequestFullScreen || el.msRequestFullscreen).call(el);
  }

  function isKioskEnvironment() {
    const ua = (navigator.userAgent || "").toLowerCase();
    const isWPE = ua.includes("wpe") || ua.includes("cog") || ua.includes("webkit wpe") || ua.includes("wpewebkit");
    const displayModeFS = window.matchMedia && window.matchMedia("(display-mode: fullscreen)").matches;
    // Hvis API ikke støttes, antar vi også at vi er i "kiosk" (ingen vits i å vise knapp).
    return isWPE || displayModeFS || !isSupported();
  }

  function ensureButton() {
    let btn = doc.getElementById("fullscreen-btn");
    if (!btn) {
      btn = doc.createElement("button");
      btn.id = "fullscreen-btn";
      btn.setAttribute("aria-label", "Fullskjerm");
      btn.textContent = "↕︎";
      btn.style.position = "fixed";
      btn.style.right = "14px";
      btn.style.bottom = "14px";
      btn.style.padding = "8px 10px";
      btn.style.fontSize = "16px";
      btn.style.borderRadius = "12px";
      btn.style.border = "1px solid rgba(255,255,255,.6)";
      btn.style.background = "rgba(0,0,0,.35)";
      btn.style.color = "#fff";
      btn.style.cursor = "pointer";
      btn.style.userSelect = "none";
      btn.style.zIndex = "9999";
      doc.body.appendChild(btn);
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        try {
          requestFS();
        } catch {}
      });
    }
    return btn;
  }

  function updateVisibility() {
    const btn = ensureButton();
    // I kiosk -> skjul; i vanlig nettleser -> vis når vi IKKE er i fullskjerm
    const hide = isKioskEnvironment() || inFullscreen();
    btn.style.display = hide ? "none" : "block";
  }

  function init() {
    // Unngå duplikat: hvis siden har egen knapp (#btn_fullscreen), ikke injiser ny
    if (document.getElementById("btn_fullscreen")) return;

    if (isKioskEnvironment()) {
      const btn = ensureButton();
      btn.style.display = "none";
      return;
    }
    updateVisibility();
    doc.addEventListener("fullscreenchange", updateVisibility);
    doc.addEventListener("webkitfullscreenchange", updateVisibility);
    doc.addEventListener("mozfullscreenchange", updateVisibility);
    doc.addEventListener("MSFullscreenChange", updateVisibility);
    window.addEventListener("resize", updateVisibility);
    doc.addEventListener("visibilitychange", updateVisibility);
  }

  if (doc.readyState === "loading") {
    doc.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
