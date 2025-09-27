// static/js/view.overlays.js
// Ansvar: overlay-synlighet, bygging og plassering
(function () {
  "use strict";

  function overlayIsVisible(ov, mode /* clock | countdown/daily */) {
    const v = ov && ov.visible_in;
    if (!Array.isArray(v)) return true;
    if (!v.length) return false;
    return mode === "clock" ? v.includes("clock") : v.includes("countdown");
  }

  function placeOverlay(wrap, o) {
    const pos = String(o.position || "top-right").toLowerCase();
    const offVW = Number(o.offset_vw ?? 2);
    const offVH = Number(o.offset_vh ?? 2);
    const set = (p, v) => (wrap.style[p] = v);
    const clr = (...ps) => ps.forEach((p) => (wrap.style[p] = ""));

    switch (pos) {
      case "top-left":
        set("top", `${offVH}vh`);
        set("left", `${offVW}vw`);
        clr("right", "bottom");
        wrap.style.transform = "none";
        break;
      case "top-right":
        set("top", `${offVH}vh`);
        set("right", `${offVW}vw`);
        clr("left", "bottom");
        wrap.style.transform = "none";
        break;
      case "bottom-left":
        set("bottom", `${offVH}vh`);
        set("left", `${offVW}vw`);
        clr("right", "top");
        wrap.style.transform = "none";
        break;
      case "bottom-center":
        set("bottom", `${offVH}vh`);
        set("left", "50%");
        clr("top", "right");
        wrap.style.transform = "translateX(-50%)";
        break;
      case "top-center":
        set("top", `${offVH}vh`);
        set("left", "50%");
        clr("bottom", "right");
        wrap.style.transform = "translateX(-50%)";
        break;
      case "center":
        set("top", "50%");
        set("left", "50%");
        clr("bottom", "right");
        wrap.style.transform = "translate(-50%,-50%)";
        break;
      case "center-left":
        set("top", "50%");
        set("left", `${offVW}vw`);
        clr("right", "bottom");
        wrap.style.transform = "translateY(-50%)";
        break;
      case "center-right":
        set("top", "50%");
        set("right", `${offVW}vw`);
        clr("left", "bottom");
        wrap.style.transform = "translateY(-50%)";
        break;
      case "bottom-right":
      default:
        set("bottom", `${offVH}vh`);
        set("right", `${offVW}vw`);
        clr("left", "top");
        wrap.style.transform = "none";
        break;
    }
  }

  function buildOverlayEl(o) {
    const wrap = document.createElement("div");
    wrap.className = "overlay-wrap";
    wrap.style.position = "absolute";
    wrap.style.pointerEvents = "none";
    wrap.style.display = "inline-block";
    wrap.style.zIndex = String(Number.isFinite(o.z_index) ? o.z_index : 10);
    wrap.style.width = `${Math.max(2, Number(o.size_vmin ?? 12))}vmin`;

    placeOverlay(wrap, o);

    const url = (o.url || "").trim();
    const img = document.createElement("img");
    img.src = url;
    img.alt = o.id || "overlay";
    img.className = "overlay-img";
    img.style.display = "block";
    img.style.width = "100%";
    img.style.height = "auto";
    img.style.opacity = String(Math.max(0, Math.min(1, Number(o.opacity ?? 1))));
    img.style.zIndex = wrap.style.zIndex;
    img.style.position = "relative";
    wrap.appendChild(img);

    const tint = o.tint || {};
    const tintOpacity = Math.max(0, Math.min(1, Number(tint.opacity ?? 0)));
    if (tintOpacity > 0) {
      const overlay = document.createElement("div");
      overlay.className = "overlay-tint";
      overlay.style.position = "absolute";
      overlay.style.inset = "0";
      overlay.style.backgroundColor = (tint.color || "#000000").trim();
      overlay.style.opacity = String(tintOpacity);
      overlay.style.zIndex = String((Number(wrap.style.zIndex) || 10) + 1);
      overlay.style.mixBlendMode = (tint.blend || "multiply").trim();
      overlay.style.webkitMaskImage = `url("${url}")`;
      overlay.style.maskImage = `url("${url}")`;
      wrap.appendChild(overlay);
    }
    return wrap;
  }

  function applyOverlays(cfg) {
    const root = document.getElementById("overlays");
    if (!root) return;
    root.innerHTML = "";

    const list = Array.isArray(cfg?.overlays) ? cfg.overlays : [];
    if (!list.length) return;

    const mode = cfg?.mode || "daily";
    for (const o of list) {
      if (o.type !== "image") continue;
      if (!overlayIsVisible(o, mode)) continue;
      const url = (o.url || "").trim();
      if (!url) continue;
      root.appendChild(buildOverlayEl(o));
    }
  }

  window.ViewOverlays = { applyOverlays, overlayIsVisible };
})();
