// static/js/view.background.js
// Ansvar: all bakgrunnslogikk (solid / gradient / image / picsum / dynamic)
(function () {
  "use strict";

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

  function hexToRgba(hex, opacity) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(String(hex || "").trim());
    if (!m) return `rgba(0,0,0,${Number(opacity || 0)})`;
    const r = parseInt(m[1], 16),
      g = parseInt(m[2], 16),
      b = parseInt(m[3], 16);
    const a = clamp(Number(opacity || 0), 0, 1);
    return `rgba(${r},${g},${b},${a})`;
  }

  // Enkel URL-sikringsvakt: tillat http(s) og relative URLer. Avvis javascript:, data:, file:, etc.
  function safeUrl(u) {
    const s = String(u || "").trim();
    if (!s) return "";
    try {
      const url = new URL(s, location.origin);
      const allowed = url.protocol === "http:" || url.protocol === "https:";
      const sameOriginRel = !/^[a-z]+:/i.test(s); // relative eller root-relative
      return allowed || sameOriginRel ? url.href : "";
    } catch {
      // Hvis ikke gyldig URL, forsøk å bruke den som relativ path (lar browseren validere videre)
      return s.startsWith("/") ? s : "";
    }
  }

  function viewportPxForPicsum(fit) {
    const dpr = clamp(window.devicePixelRatio || 1, 1, 2);
    let vw = Math.max(1, Math.round((window.innerWidth || 1280) * dpr));
    let vh = Math.max(1, Math.round((window.innerHeight || 720) * dpr));
    if ((fit || "cover") === "contain") {
      const side = Math.max(vw, vh);
      vw = side;
      vh = side;
    }
    return { vw, vh };
  }
    // Bygg nøyaktig Picsum-URL fra bakgrunnskonfig (brukes også for preloading)
  function buildPicsumUrlFromBg(bg) {
    const pc = (bg && bg.picsum) || {};
    const fit = (pc.fit || "cover").toLowerCase();
    const { vw, vh } = viewportPxForPicsum(fit);

    let base;
    const idNum = Number(pc.id ?? 0);
    if (Number.isFinite(idNum) && idNum > 0) {
      base = `https://picsum.photos/id/${idNum}/${vw}/${vh}`;
    } else if (pc.lock_seed && (pc.seed || "").trim()) {
      base = `https://picsum.photos/seed/${encodeURIComponent(pc.seed.trim())}/${vw}/${vh}`;
    } else {
      base = `https://picsum.photos/${vw}/${vh}`;
    }
    const params = [];
    if (pc.grayscale) params.push("grayscale");
    const blurN = Math.max(0, Math.min(10, Number(pc.blur || 0) || 0));
    if (blurN > 0) params.push(`blur=${blurN}`);
    return params.length ? `${base}?${params.join("&")}` : base;
  }

  // Enkelt preloader; løses når bildet er lastet (timeout → reject)
  function preloadImage(url, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      if (!url) return reject(new Error("empty url"));
      const img = new Image();
      let done = false;
      const to = setTimeout(() => {
        if (!done) {
          done = true;
          img.src = "";
          reject(new Error("timeout"));
        }
      }, Math.max(1000, timeoutMs));
      img.onload = () => {
        if (!done) {
          done = true;
          clearTimeout(to);
          resolve();
        }
      };
      img.onerror = () => {
        if (!done) {
          done = true;
          clearTimeout(to);
          reject(new Error("error"));
        }
      };
      img.src = url;
    });
  }


  // dynamic helper
  function ensureDynKeyframes() {
    if (document.getElementById("dynbg_keyframes")) return;
    const st = document.createElement("style");
    st.id = "dynbg_keyframes";
    st.textContent = `@keyframes dynbg-rotate{0%{transform:rotate(0deg) scale(1.02)}100%{transform:rotate(360deg) scale(1.02)}}`;
    document.head.appendChild(st);
  }
  function getDynLayer() {
    // Standardiser: bruk bindestrek-versjonen overalt
    return document.getElementById("dynbg-layer");
  }
  function ensureDynLayer() {
    let el = getDynLayer();
    if (!el) {
      el = document.createElement("div");
      el.id = "dynbg-layer";
      Object.assign(el.style, {
        position: "fixed",
        inset: "0",
        zIndex: "0",
        pointerEvents: "none",
      });
      document.body.appendChild(el);
    }
    return el;
  }
  function removeDynLayer() {
    const el = getDynLayer();
    if (el?.parentNode) el.parentNode.removeChild(el);
  }

  function applyBaseImageLayers(el, fit, url, tint) {
    const safe = safeUrl(url);
    const layers = [];
    if (tint?.color && Number(tint.opacity) > 0) {
      const rgba = hexToRgba(tint.color, tint.opacity);
      layers.push(`linear-gradient(${rgba}, ${rgba})`);
    }
    if (safe) layers.push(`url("${safe}")`);
    if (!layers.length) return false;

    el.style.backgroundImage = layers.join(", ");
    el.style.backgroundRepeat = "no-repeat, no-repeat";
    el.style.backgroundSize = (layers.length === 2 ? "auto, " : "") + (fit === "contain" ? "contain" : "cover");
    el.style.backgroundPosition = "center center, center center";
    el.style.backgroundColor = "transparent";
    return true;
  }

  // appliers
  function applyBgSolid(el, bg) {
    el.style.backgroundColor = bg?.solid?.color || "#0b0f14";
    el.style.backgroundImage = "none";
  }
  function applyBgGradient(el, bg) {
    const from = bg?.gradient?.from || "#142033";
    const to = bg?.gradient?.to || "#0b0f14";
    const angle = Number(bg?.gradient?.angle_deg ?? 180);
    el.style.backgroundImage = `linear-gradient(${angle}deg, ${from}, ${to})`;
    el.style.backgroundColor = "transparent";
    el.style.backgroundRepeat = "no-repeat";
    el.style.backgroundSize = "cover";
    el.style.backgroundPosition = "center center";
  }
  function applyBgImage(el, bg) {
    const url = (bg?.image?.url || "").trim();
    if (!url) {
      el.style.backgroundColor = "#0b0f14";
      el.style.backgroundImage = "none";
      return;
    }
    const fit = (bg?.image?.fit || "cover").toLowerCase();
    applyBaseImageLayers(el, fit, url, bg?.image?.tint);
  }
  function applyBgPicsum(el, bg) {
    const url = buildPicsumUrlFromBg(bg);
    const pc = bg?.picsum || {};
    applyBaseImageLayers(el, (pc.fit || "cover").toLowerCase(), url, pc.tint);
  }
    window.ViewBg = { applyBackground, viewportPxForPicsum, buildPicsumUrlFromBg, preloadImage };

  function applyBgDynamic(rootEl, bg) {
  const dyn = bg?.dynamic || {};
  const basePref = (dyn.base_mode || "auto").toLowerCase();
  if (basePref === "image" && bg?.image?.url) applyBgImage(rootEl, bg);
  else if (basePref === "gradient" && bg?.gradient) applyBgGradient(rootEl, bg);
  else if (basePref === "solid" && bg?.solid) applyBgSolid(rootEl, bg);
  else if (basePref === "picsum" && bg?.picsum) applyBgPicsum(rootEl, bg);
  else {
    if (bg?.image?.url) applyBgImage(rootEl, bg);
    else if (bg?.gradient) applyBgGradient(rootEl, bg);
    else if (bg?.picsum) applyBgPicsum(rootEl, bg);
    else applyBgSolid(rootEl, bg);
  }

  ensureDynKeyframes();
  const layer = ensureDynLayer();

  const clampNum = (v, lo, hi, def) => Math.max(lo, Math.min(hi, Number(v ?? def)));
  const from = dyn.from || "#16233a";
  const to = dyn.to || "#0e1a2f";
  const rotateS = clampNum(dyn.rotate_s, 5, 600, 60);
  const blurPx = clampNum(dyn.blur_px, 0, 80, 18);
  const opacity = clampNum(dyn.opacity, 0, 1, 0.9);
  const layerPos = (dyn.layer || "under").toLowerCase();

  // Les tidligere signatur FØR vi setter den nye
  const prevSig = layer.dataset.dynsig || "";
  const sig = JSON.stringify({ from, to, rotateS, blurPx, opacity, layerPos });
  const changed = prevSig !== sig;

  // Alltid oppdater disse stilene
  Object.assign(layer.style, {
    zIndex: layerPos === "over" ? "15" : "0",
    filter: `blur(${blurPx}px)`,
    opacity: String(opacity),
    background:
      `radial-gradient(72vmax 54vmax at 12% 10%, ${from} 0%, transparent 62%),` +
      `radial-gradient(70vmax 52vmax at 88% 12%, ${to} 0%, transparent 64%),` +
      `conic-gradient(from 220deg at 50% 50%, #0000 0%, #0000 100%)`,
  });

  // Oppdater / restart animasjon KUN når signatur endres (inkl. rotate_s)
  if (changed) {
    const anim = `dynbg-rotate ${rotateS}s linear infinite`;
    // Tving restart slik at ny varighet trer i kraft i alle browsere
    layer.style.animation = "none";
    void layer.offsetWidth; // reflow
    layer.style.animation = anim;
  } else if (!layer.style.animation) {
    // Første init
    layer.style.animation = `dynbg-rotate ${rotateS}s linear infinite`;
  }

  // Til slutt: sett ny signatur
  layer.dataset.dynsig = sig;
}


  function applyBackground(rootEl, bg) {
    if (!rootEl) return;
    const mode = (bg?.mode || "solid").toLowerCase();

    // Nullstill base-bakgrunnsegenskaper som før …
    rootEl.style.background = "";
    rootEl.style.backgroundColor = "";
    rootEl.style.backgroundImage = "";
    rootEl.style.backgroundRepeat = "";
    rootEl.style.backgroundSize = "";
    rootEl.style.backgroundPosition = "";

    // … men IKKE fjern det dynamiske laget hvis vi fortsatt er i dynamic-modus.
    if (mode !== "dynamic") {
      removeDynLayer();
    }

    switch (mode) {
      case "solid":
        return applyBgSolid(rootEl, bg);
      case "gradient":
        return applyBgGradient(rootEl, bg);
      case "image":
        return applyBgImage(rootEl, bg);
      case "picsum":
        return applyBgPicsum(rootEl, bg);
      case "dynamic":
        return applyBgDynamic(rootEl, bg);
      default:
        rootEl.style.backgroundColor = "#0b0f14";
    }
  }

  window.ViewBg = { applyBackground, viewportPxForPicsum, buildPicsumUrlFromBg, preloadImage };
})();
