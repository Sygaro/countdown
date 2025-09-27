// filepath: static/js/overlays_preview_fix.js
// Overlays preview-fix: én kilde for sannhet, robust synlighetslogikk i preview.
(() => {
  "use strict";

  function overlayIsVisible(ov, mode /* "countdown" | "clock" */) {
    const v = ov && ov.visible_in;
    if (!Array.isArray(v)) return true;     // eldre config → synlig
    if (v.length === 0) return false;       // eksplisitt tom → aldri
    return v.includes(mode);
  }
  // Eksponer for andre moduler (admin/view/preview)
  try { window.overlayIsVisible = overlayIsVisible; } catch {}

  function detectModeFromDOMOrConfig(cfg) {
    const bodyMode = (document.body.getAttribute("data-mode") || "").toLowerCase();
    if (bodyMode === "clock" || bodyMode === "countdown") return bodyMode;
    const cfgMode = (cfg?.mode || "").toLowerCase();
    return cfgMode === "clock" ? "clock" : "countdown";
  }

  function applyVisibility() {
    try {
      const cfg = window.latestConfig || window.previewConfig || null;
      if (!cfg || !Array.isArray(cfg.overlays)) return;
      const mode = detectModeFromDOMOrConfig(cfg);
      const layer = document.getElementById("overlays") || document.body;
      cfg.overlays.forEach((ov) => {
        const el = layer.querySelector(`[data-overlay-id="${ov.id}"]`);
        if (!el) return;
        el.style.display = overlayIsVisible(ov, mode) ? "" : "none";
      });
    } catch {
      /* stille feil */
    }
  }

  // Lytt på preview-oppdateringer (hvis admin sender postMessage)
  window.addEventListener("message", (ev) => {
    const d = ev?.data;
    if (!d || d.type !== "preview-config" || !d.config) return;
    try { window.previewConfig = d.config; } catch {}
    // Gi view.js litt tid til å re-rendre før vi maskerer synlighet
    setTimeout(applyVisibility, 30);
  });

  // Når UI indikerer overlay-endring
  window.addEventListener("overlays:updated", () => setTimeout(applyVisibility, 0));

  // Init på DOM klar
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(applyVisibility, 0), { once: true });
  } else {
    setTimeout(applyVisibility, 0);
  }
})();
