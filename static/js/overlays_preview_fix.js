/* File: static/js/overlays_preview_fix.js
 * Purpose: Riktig synlighetslogikk for overlays i preview + enkel re-render trigger.
 * Notes: Inkluderes etter admin/preview-skript. Ikke-invasiv.
 */

(() => {
  "use strict";

  function overlayIsVisible(ov, mode /* "countdown" | "clock" */) {
    const v = ov && ov.visible_in;
    if (!Array.isArray(v)) return true; // backwards compat: mangler => vis
    if (v.length === 0) return false; // eksplisitt tom => skjul overalt
    return v.includes(mode);
  }

  // Eksponer for annen kode
  window.overlayIsVisible = overlayIsVisible;

  // Når overlays endres i UI, prøv å trigge preview
  window.addEventListener("overlays:updated", () => {
    // Foretrukket: hvis admin-preview har en render-funksjon
    if (typeof window.renderPreview === "function") {
      try {
        window.renderPreview();
        return;
      } catch {}
    }
    // Fallback: skjul/vis DOM-noder i #overlays etter data-overlay-id
    try {
      const mode = document.body.getAttribute("data-mode") || "countdown";
      const cfg = window.latestConfig || window.previewConfig || null;
      if (!cfg || !Array.isArray(cfg.overlays)) return;

      const layer = document.getElementById("overlays") || document.body;
      cfg.overlays.forEach((ov) => {
        const el = layer.querySelector(`[data-overlay-id="${ov.id}"]`);
        if (!el) return;
        el.style.display = overlayIsVisible(ov, mode) ? "" : "none";
      });
    } catch {}
  });
})();

(function () {
  "use strict";

  function overlayIsVisible(ov, mode /* "countdown" | "clock" */) {
    const v = ov && ov.visible_in;
    if (!Array.isArray(v)) return true; // eldre config → vis som før
    if (v.length === 0) return false; // eksplisitt tom → aldri vis
    return v.includes(mode);
  }
  window.overlayIsVisible = overlayIsVisible;

  function applyVisibility() {
    try {
      const cfg = window.latestConfig || window.previewConfig || null;
      if (!cfg || !Array.isArray(cfg.overlays)) return;

      // Finn modus: bruk <body data-mode="..."> hvis satt, ellers fra config
      const bodyMode = (document.body.getAttribute("data-mode") || "").toLowerCase();
      const cfgMode = (cfg.mode || "").toLowerCase() === "clock" ? "clock" : "countdown";
      const mode = bodyMode === "clock" ? "clock" : cfgMode;

      const layer = document.getElementById("overlays") || document.body;
      cfg.overlays.forEach((ov) => {
        const el = layer.querySelector(`[data-overlay-id="${ov.id}"]`);
        if (!el) return;
        el.style.display = overlayIsVisible(ov, mode) ? "" : "none";
      });
    } catch {}
  }

  window.addEventListener("overlays:updated", applyVisibility);
  document.addEventListener("DOMContentLoaded", applyVisibility, { once: true });
})();
