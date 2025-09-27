(function () {
  const $ = (s) => document.querySelector(s);
  const state = {
    cfg: null,
    tick: null,
    lastCfgRev: 0,
    clockTimer: null,
  };
  const isPreview = new URLSearchParams(location.search).get("preview") === "1";
  if (isPreview) {
    document.documentElement.classList.add("is-preview");
  }

  let lastActivityTs = Date.now();

  const fmtMMSS = (ms) => {
    const neg = ms < 0 ? "-" : "";
    ms = Math.abs(ms);
    const t = Math.floor(ms / 1000),
      m = Math.floor(t / 60),
      s = t % 60;
    return `${neg}${m}:${String(s).padStart(2, "0")}`;
  };
  const fmtHMS = (ms) => {
    const neg = ms < 0 ? "-" : "";
    ms = Math.abs(ms);
    const t = Math.floor(ms / 1000),
      h = Math.floor(t / 3600),
      r = t % 3600,
      m = Math.floor(r / 60),
      s = r % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return `${neg}${h}:${pad(m)}:${pad(s)}`;
  };

  function applyDigitsSize() {
    const d = state.cfg?.theme?.digits || {};
    const vmin = Number(d.size_vmin != null ? d.size_vmin : 14);
    $("#digits").style.fontSize = `${vmin}vmin`;
  }
  function applyMessageStyles() {
    const p = state.cfg?.theme?.messages?.primary || {};
    const s = state.cfg?.theme?.messages?.secondary || {};

    const set = (sel, m) => {
      const el = document.querySelector(sel);
      if (!el) return;
      const size = Number(m.size_vmin ?? 6);
      el.style.fontSize = `${size}vmin`;
      el.style.fontWeight = String(Number(m.weight ?? 400));
      el.style.color = String(m.color ?? "#9aa4b2");
    };

    set("#msg_primary_above", p);
    set("#msg_secondary_above", s);
    set("#msg_primary_below", p);
    set("#msg_secondary_below", s);

    // primær litt større enn sekundær (beholdt)
    set("#msg_primary_above", p, 2.0);
    set("#msg_secondary_above", s, 1.8);
    set("#msg_primary_below", p, 2.0);
    set("#msg_secondary_below", s, 1.8);
  }

  // --- dynamisk lag: keyframes + elementhåndtering ---
  function ensureDynKeyframes() {
    if (document.getElementById("dynbg_keyframes")) return;
    const st = document.createElement("style");
    st.id = "dynbg_keyframes";
    st.textContent = `
@keyframes dynbg-rotate {
  0%   { transform: rotate(0deg) scale(1.02); }
  100% { transform: rotate(360deg) scale(1.02); }
}`;
    document.head.appendChild(st);
  }
  function getDynLayer() {
    return document.getElementById("dyn_bg_layer");
  }
  function ensureDynLayer() {
    let el = getDynLayer();
    if (!el) {
      el = document.createElement("div");
      el.id = "dyn_bg_layer";
      el.style.position = "fixed";
      el.style.inset = "-15%";
      el.style.zIndex = "0";
      el.style.pointerEvents = "none";
      document.body.appendChild(el);
    }
    return el;
  }
  function removeDynLayer() {
    const el = getDynLayer();
    if (el && el.parentNode) el.parentNode.removeChild(el);
  }

  // --- Hjelpere ---
  function hexToRgba(hex, opacity) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex || "").trim());
    if (!m) return `rgba(0,0,0,${Number(opacity || 0)})`;
    const r = parseInt(m[1], 16),
      g = parseInt(m[2], 16),
      b = parseInt(m[3], 16);
    const a = Math.max(0, Math.min(1, Number(opacity || 0)));
    return `rgba(${r},${g},${b},${a})`;
  }

  // --- Bakgrunn inkl. dynamic + base ---
  function applyThemeBackground(el, bg) {
    if (!el || !bg) return;

    el.style.background = "";
    el.style.backgroundColor = "";
    el.style.backgroundImage = "";
    el.style.backgroundRepeat = "";
    el.style.backgroundSize = "";
    el.style.backgroundPosition = "";

    const mode = (bg.mode || "solid").toLowerCase();

    function applyBase(pref) {
      const want = pref || "auto";
      const hasImg = !!(bg?.image?.url || "").trim();

      if (want === "image" || (want === "auto" && hasImg)) {
        const url = (bg?.image?.url || "").trim();
        const fit = (bg?.image?.fit || "cover").toLowerCase();
        const tintC = bg?.image?.tint?.color || null;
        const tintO = Number(bg?.image?.tint?.opacity ?? 0);
        const layers = [];
        if (tintC && tintO > 0) {
          const rgba = hexToRgba(tintC, tintO);
          layers.push(`linear-gradient(${rgba}, ${rgba})`);
        }
        if (url) layers.push(`url("${url}")`);
        if (layers.length) {
          el.style.backgroundImage = layers.join(", ");
          el.style.backgroundRepeat = "no-repeat, no-repeat";
          el.style.backgroundSize = (layers.length === 2 ? "auto, " : "") + (fit === "contain" ? "contain" : "cover");
          el.style.backgroundPosition = "center center, center center";
          el.style.backgroundColor = "transparent";
          return;
        }
      }

      if (want === "gradient" || want === "auto") {
        const from = bg?.gradient?.from || "#142033";
        const to = bg?.gradient?.to || "#0b0f14";
        const angle = Number(bg?.gradient?.angle_deg ?? 180);
        el.style.backgroundImage = `linear-gradient(${angle}deg, ${from}, ${to})`;
        el.style.backgroundRepeat = "no-repeat";
        el.style.backgroundSize = "cover";
        el.style.backgroundPosition = "center center";
        el.style.backgroundColor = "transparent";
        return;
      }

      el.style.backgroundColor = bg?.solid?.color || "#0b0f14";
      el.style.backgroundImage = "none";
    }

    if (mode === "solid") {
      removeDynLayer();
      el.style.backgroundColor = bg?.solid?.color || "#0b0f14";
      el.style.backgroundImage = "none";
      return;
    }

    if (mode === "gradient") {
      removeDynLayer();
      const from = bg?.gradient?.from || "#142033";
      const to = bg?.gradient?.to || "#0b0f14";
      const angle = Number(bg?.gradient?.angle_deg ?? 180);
      el.style.backgroundImage = `linear-gradient(${angle}deg, ${from}, ${to})`;
      el.style.backgroundColor = "transparent";
      el.style.backgroundRepeat = "no-repeat";
      el.style.backgroundSize = "cover";
      el.style.backgroundPosition = "center center";
      return;
    }

    if (mode === "picsum") {
      removeDynLayer();
      const pc = bg?.picsum || {};

      const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
      let vw = Math.max(1, Math.round((window.innerWidth || 1280) * dpr));
      let vh = Math.max(1, Math.round((window.innerHeight || 720) * dpr));

      const fit = (pc.fit || "cover").toLowerCase();
      if (fit === "contain") {
        const side = Math.max(vw, vh);
        vw = side;
        vh = side;
      }

        // Prioritet: id > (lock_seed ? seed : random)
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
      const blurN = Number(pc.blur || 0);
      if (blurN > 0) params.push(`blur=${Math.min(10, Math.max(1, blurN))}`);

      const url = params.length ? `${base}?${params.join("&")}` : base;

      const tintColor = pc?.tint?.color || null;
      const tintOpacity = Math.max(0, Math.min(1, Number(pc?.tint?.opacity ?? 0)));

      const layers = [];
      if (tintColor && tintOpacity > 0) {
        const rgba = hexToRgba(tintColor, tintOpacity);
        layers.push(`linear-gradient(${rgba}, ${rgba})`);
      }
      layers.push(`url("${url}")`);

      el.style.backgroundImage = layers.join(", ");
      el.style.backgroundRepeat = "no-repeat, no-repeat";
      el.style.backgroundSize = (layers.length === 2 ? "auto, " : "") + (fit === "contain" ? "contain" : "cover");
      el.style.backgroundPosition = "center center, center center";
      el.style.backgroundColor = "transparent";
      return;
    }

    if (mode === "image") {
      removeDynLayer();
      const url = (bg?.image?.url || "").trim();
      if (!url) {
        el.style.backgroundColor = "#0b0f14";
        return;
      }
      const fit = (bg?.image?.fit || "cover").toLowerCase();
      const tintC = bg?.image?.tint?.color || null;
      const tintO = Number(bg?.image?.tint?.opacity ?? 0);

      const layers = [];
      if (tintC && tintO > 0) {
        const rgba = hexToRgba(tintC, tintO);
        layers.push(`linear-gradient(${rgba}, ${rgba})`);
      }
      layers.push(`url("${url}")`);
      el.style.backgroundImage = layers.join(", ");
      el.style.backgroundRepeat = "no-repeat, no-repeat";
      el.style.backgroundSize = (layers.length === 2 ? "auto, " : "") + (fit === "contain" ? "contain" : "cover");
      el.style.backgroundPosition = "center center, center center";
      el.style.backgroundColor = "transparent";
      return;
    }

    if (mode === "dynamic") {
      const dyn = bg?.dynamic || {};
      const basePref = (dyn.base_mode || "auto").toLowerCase();
      applyBase(basePref);

      ensureDynKeyframes();
      const layer = ensureDynLayer();

      const from = dyn.from || "#16233a";
      const to = dyn.to || "#0e1a2f";
      const rotateS = Math.max(5, Math.min(600, Number(dyn.rotate_s ?? 60)));
      const blurPx = Math.max(0, Math.min(90, Number(dyn.blur_px ?? 18)));
      const opa = Math.max(0, Math.min(1, Number(dyn.opacity ?? 0.9)));
      const layerPos = (dyn.layer || "under").toLowerCase();

      layer.style.position = "fixed";
      layer.style.inset = "0vmin";
      layer.style.zIndex = layerPos === "over" ? "40" : "0";
      layer.style.pointerEvents = "none";
      layer.style.filter = `blur(${blurPx}px)`;
      layer.style.opacity = String(opa);
      layer.style.animation = `dynbg-rotate ${rotateS}s linear infinite`;
      layer.style.background =
        `radial-gradient(72vmax 54vmax at 12% 10%, ${from} 0%, transparent 62%),` +
        `radial-gradient(70vmax 52vmax at 88% 12%, ${to} 0%, transparent 64%),` +
        `conic-gradient(from 220deg at 50% 50%, #0000 0%, #0000 100%)`;
      return;
    }

    // Fallback
    removeDynLayer();
    el.style.backgroundColor = "#0b0f14";
  }

  function applyCountdown() {
    $("#view_clock").style.display = "none";
    const root = $("#view_countdown");
    root.style.display = "flex";
    applyThemeBackground(document.body, state.cfg?.theme?.background);

    if (state.clockTimer) {
      clearInterval(state.clockTimer);
      state.clockTimer = null;
    }
    $("#clock_time").style.display = "none";

    applyDigitsSize();
    applyMessageStyles();

    const c = state.cfg;
    const t = state.tick || {
      state: "idle",
      mode: "normal",
      signed_display_ms: 0,
      blink: false,
      target_hhmm: null,
    };

    const thresholdMs = (c.hms_threshold_minutes ?? 60) * 60 * 1000;
    const msActive = t.state === "countdown" || t.state === "overrun";
    const ms = msActive ? t.signed_display_ms : 0;

    const useHMS = Math.abs(ms) >= thresholdMs;
    const digits = $("#digits");
    digits.textContent = useHMS ? fmtHMS(ms) : fmtMMSS(ms);

    let color = c.color_normal;
    if (c.use_phase_colors) {
      if (t.state === "overrun" || t.signed_display_ms < 0) color = c.color_over || c.color_alert;
      else if (t.mode === "alert") color = c.color_alert;
      else if (t.mode === "warn") color = c.color_warn;
    }
    digits.style.color = color;
    digits.classList.toggle("blink", !!(c.use_blink && t.blink));

    const targetTextPrim =
      c.show_target_time && c.show_message_primary && c.target_time_after === "primary" && t.target_hhmm
        ? ` ${t.target_hhmm}`
        : "";
    const targetTextSec =
      c.show_target_time && c.show_message_secondary && c.target_time_after === "secondary" && t.target_hhmm
        ? ` ${t.target_hhmm}`
        : "";

    const prim = c.show_message_primary ? (c.message_primary || "") + targetTextPrim : "";
    const sec = c.show_message_secondary ? (c.message_secondary || "") + targetTextSec : "";

    const above = c.messages_position === "above";
    $("#msgs_above").style.display = above ? "block" : "none";
    $("#msgs_below").style.display = above ? "none" : "block";
    $("#msg_primary_above").textContent = above ? prim : "";
    $("#msg_secondary_above").textContent = above ? sec : "";
    $("#msg_primary_below").textContent = !above ? prim : "";
    $("#msg_secondary_below").textContent = !above ? sec : "";
    applyOverlays();
  }

  function applyClock() {
    const viewCountdown = $("#view_countdown");
    if (viewCountdown) viewCountdown.style.display = "none";

    const root = document.querySelector("#view_clock, #view_screen");
    const clkEl = document.querySelector("#clock_time, #screen_clock");
    const wrap = $("#clock_msgs");
    const elP = $("#clock_msg_primary");
    const elS = $("#clock_msg_secondary");
    if (!root || !clkEl || !wrap || !elP || !elS) return;

    root.style.display = "flex";

    const SIDE_INSET_VW = 5,
      TOP_BOTTOM_VH = 3;
    root.style.padding = `${TOP_BOTTOM_VH}vh ${SIDE_INSET_VW}vw`;

    applyThemeBackground(document.body, state.cfg?.theme?.background);

    const clk = state.cfg?.clock || {};
    const sizeVmin = Number(clk.size_vmin ?? 12);
    const size = Math.max(6, Math.min(30, sizeVmin));
    clkEl.style.fontSize = `${size}vmin`;
    clkEl.style.fontWeight = "800";
    clkEl.style.display = "block";
    clkEl.style.color = clk.color || "#e6edf3";

    const useOwn = !!clk.use_clock_messages;
    if (!useOwn) {
      // Viktig: eksplisitt default retning når meldinger er av
      root.style.flexDirection = "row";
      wrap.style.display = "none";
    } else {
      const msgP = (clk.message_primary || "").trim();
      const msgS = (clk.message_secondary || "").trim();
      const showP = !!msgP;
      const showS = !!msgS;

      const msgPos = clk.messages_position || "right";
      const msgAlign = clk.messages_align || "center";

      if (msgPos === "left" || msgPos === "right") {
        root.style.flexDirection = "row";
        wrap.style.flexDirection = "column";
        clkEl.style.order = msgPos === "left" ? 2 : 1;
        wrap.style.order = msgPos === "left" ? 1 : 2;
        root.style.gap = "3vmin";
        wrap.style.marginLeft = msgPos === "right" ? "2vmin" : "0";
        wrap.style.marginRight = msgPos === "left" ? "2vmin" : "0";
      } else {
        root.style.flexDirection = "column";
        clkEl.style.order = msgPos === "above" ? 2 : 1;
        wrap.style.order = msgPos === "above" ? 1 : 2;
        wrap.style.flexDirection = "column";
        root.style.gap = "1.25vmin";
        wrap.style.marginLeft = wrap.style.marginRight = "0";
      }

      wrap.style.display = showP || showS ? "flex" : "none";
      wrap.style.alignItems = { start: "flex-start", center: "center", end: "flex-end" }[msgAlign] || "center";
      wrap.style.textAlign = { start: "left", center: "center", end: "right" }[msgAlign] || "center";
      wrap.style.gap = "0.25rem";

      elP.style.display = showP ? "block" : "none";
      elS.style.display = showS ? "block" : "none";

      elP.textContent = msgP;
      elS.textContent = msgS;

      const themeMsg = state.cfg?.theme?.messages || {};
      const pTheme = themeMsg.primary || {};
      const sTheme = themeMsg.secondary || {};
      elP.style.fontSize = `${Number(pTheme.size_vmin ?? 6)}vmin`;
      elP.style.fontWeight = String(pTheme.weight ?? 600);
      elP.style.color = String(pTheme.color ?? "#9aa4b2");
      elS.style.fontSize = `${Number(sTheme.size_vmin ?? 4)}vmin`;
      elS.style.fontWeight = String(sTheme.weight ?? 400);
      elS.style.color = String(sTheme.color ?? "#9aa4b2");
    }
    {
      const clockPos = (state.cfg?.clock?.position || "center").toLowerCase();
      const posMap = {
        center: { ai: "center", jc: "center" },
        "top-left": { ai: "flex-start", jc: "flex-start" },
        "top-right": { ai: "flex-start", jc: "flex-end" },
        "bottom-left": { ai: "flex-end", jc: "flex-start" },
        "bottom-right": { ai: "flex-end", jc: "flex-end" },
        "top-center": { ai: "flex-start", jc: "center" },
        "bottom-center": { ai: "flex-end", jc: "center" },
      };
      let m = posMap[clockPos] || posMap.center;

      // Hvis column: hoved-/tverraksen byttes → swap ai/jc
      const isColumn = (root.style.flexDirection || "row").toLowerCase() === "column";
      if (isColumn) m = { ai: m.jc, jc: m.ai };

      root.style.alignItems = m.ai;
      root.style.justifyContent = m.jc;
    }

    if (state.clockTimer) {
      clearInterval(state.clockTimer);
      state.clockTimer = null;
    }
    const update = () => {
      const d = new Date();
      const HH = String(d.getHours()).padStart(2, "0");
      const MM = String(d.getMinutes()).padStart(2, "0");
      const SS = String(d.getSeconds()).padStart(2, "0");
      clkEl.textContent = clk.with_seconds ? `${HH}:${MM}:${SS}` : `${HH}:${MM}`;
    };
    update();
    state.clockTimer = setInterval(update, clk.with_seconds ? 1000 : 5000);
    applyOverlays();
  }

  async function fetchConfig() {
    const r = await fetch("/api/config");
    const js = await r.json();
    state.cfg = js.config;
    state.lastCfgRev = js.config._updated_at || 0;
    sendHeartbeat();
  }
  async function firstLoad() {
    await fetchConfig();
    const r = await fetch("/tick");
    state.tick = await r.json();
    render();
    sendHeartbeat();
  }
  async function pollTick() {
    const r = await fetch("/tick");
    const t = await r.json();
    state.tick = t;
    if ((t.cfg_rev || 0) !== state.lastCfgRev) await fetchConfig();
    render(true);
  }
  function applyOverlays() {
    const root = document.getElementById("overlays");
    if (!root) return;
    root.innerHTML = "";

    const list = Array.isArray(state.cfg?.overlays) ? state.cfg.overlays : [];
    if (!list.length) return;

    const mode = state.cfg?.mode || "daily";

    function overlayIsVisible(ov, m) {
      const v = ov && ov.visible_in;
      if (!Array.isArray(v)) return true;
      if (v.length === 0) return false;
      return m === "clock" ? v.includes("clock") : v.includes("countdown");
    }
    for (const o of list) {
      if (!overlayIsVisible(o, mode)) continue;
      if (o.type !== "image") continue;
      const url = (o.url || "").trim();
      if (!url) continue;

      const wrap = document.createElement("div");
      wrap.className = "overlay-wrap";
      wrap.setAttribute("data-overlay-id", o.id || "");   // ← NYTT: kobling til config
      wrap.style.position = "absolute";
      wrap.style.pointerEvents = "none";
      wrap.style.display = "inline-block";

      const z = Number.isFinite(o.z_index) ? o.z_index : 10;
      wrap.style.zIndex = String(z);

      const size = Math.max(2, Number(o.size_vmin ?? 12));
      wrap.style.width = `${size}vmin`;

      const pos = String(o.position || "top-right").toLowerCase();
      const offVW = Number(o.offset_vw ?? 2);
      const offVH = Number(o.offset_vh ?? 2);
      const set = (prop, value) => (wrap.style[prop] = value);
      const clr = (...props) => props.forEach((p) => (wrap.style[p] = ""));
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

      const img = document.createElement("img");
      img.src = url;
      img.alt = o.id || "overlay";
      img.className = "overlay-img";
      img.style.display = "block";
      img.style.width = "100%";
      img.style.height = "auto";
      img.style.opacity = String(Math.max(0, Math.min(1, Number(o.opacity ?? 1))));
      img.style.zIndex = String(z);
      img.style.position = "relative";
      wrap.appendChild(img);

      const tint = o.tint || {};
      const tintOpacity = Math.max(0, Math.min(1, Number(tint.opacity ?? 0)));
      if (tintOpacity > 0) {
        const tintColor = (tint.color || "#000000").trim();
        const blend = (tint.blend || "multiply").trim();

        const overlay = document.createElement("div");
        overlay.className = "overlay-tint";
        overlay.style.position = "absolute";
        overlay.style.inset = "0";
        overlay.style.backgroundColor = tintColor;
        overlay.style.opacity = String(tintOpacity);
        overlay.style.zIndex = String(z + 1);
        overlay.style.mixBlendMode = blend;

        overlay.style.webkitMaskImage = `url("${url}")`;
        overlay.style.maskImage = `url("${url}")`;

        wrap.appendChild(overlay);
      }

      root.appendChild(wrap);
      try {
        window.dispatchEvent(new Event("overlays:updated"));
      } catch (_) {}

    }
  }

  function render() {
    const mode = state.cfg?.mode || "daily";
    if (mode === "clock") applyClock();
    else applyCountdown();
  }
  async function pollConfig() {
    try {
      const r = await fetch("/api/config", { cache: "no-store" });
      if (!r.ok) return;
      const js = await r.json();
      const cfg = js.config || {};
      const rev = cfg._updated_at || 0;
      if (rev !== state.lastCfgRev) {
        state.cfg = cfg;
        state.lastCfgRev = rev;
        render();
      }
    } catch (_e) {}
  }

  // Heartbeat
  function sendHeartbeat() {
    const payload = JSON.stringify({
      rev: state.lastCfgRev,
      page: "view",
    });
    if (navigator.sendBeacon) {
      const blob = new Blob([payload], { type: "application/json" });
      navigator.sendBeacon("/debug/view-heartbeat", blob);
    } else {
      fetch("/debug/view-heartbeat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: payload,
      }).catch(() => {});
    }
  }
  setInterval(sendHeartbeat, 10000);

  // Fullscreen
  const fsBtn = document.getElementById("btn_fullscreen");
  function showFsBtn() {
    if (!fsBtn) return;
    if (document.fullscreenElement) return;
    fsBtn.style.display = document.fullscreenEnabled ? "inline-block" : "none";
    fsBtn.style.opacity = "1";
  }
  function hideFsBtn() {
    if (!fsBtn) return;
    if (document.fullscreenElement) return;
    if (document.fullscreenEnabled) fsBtn.style.opacity = "0";
  }
  document.addEventListener("fullscreenchange", () => {
    const on = !!document.fullscreenElement;
    document.documentElement.classList.toggle("is-fullscreen", on);
    if (fsBtn) {
      fsBtn.style.display = on ? "none" : document.fullscreenEnabled ? "inline-block" : "none";
      if (!on) fsBtn.style.opacity = "1";
    }
  });
  function bumpActivity() {
    if (document.fullscreenElement) return;
    lastActivityTs = Date.now();
    showFsBtn();
  }
  ["mousemove", "mousedown", "keydown", "touchstart"].forEach((ev) =>
    document.addEventListener(ev, bumpActivity, { passive: true }),
  );
  setInterval(() => {
    if (!document.fullscreenElement && Date.now() - lastActivityTs > 5000) hideFsBtn();
  }, 1000);
  if (fsBtn) {
    fsBtn.addEventListener("click", async () => {
      try {
        if (!document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        } else {
          await document.exitFullscreen();
        }
      } catch (e) {}
    });
    showFsBtn();
  }

  if (!isPreview) {
    firstLoad().catch(console.error);
    setInterval(pollTick, 1000);
    setInterval(pollConfig, 3000);
  }
  if (isPreview) {
    window.addEventListener("message", (ev) => {
      const d = ev.data;
      if (!d || d.type !== "preview-config" || !d.config) return;
      state.cfg = d.config;
      state.tick = state.tick || {
        mode: d.config.mode || "clock",
        state: "idle",
        signed_display_ms: 0,
        blink: false,
        target_hhmm: null,
      };
      render();
    });
  }
})();
