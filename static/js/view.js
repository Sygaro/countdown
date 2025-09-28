// static/js/view.js
// Wire-up: state, rendering, polling, fullscreen, preview.
// Forutsetter at view.background.js og view.overlays.js lastes først.
(function () {
  "use strict";
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));

  const state = {
    cfg: null,
    tick: null,
    lastCfgRev: 0,
    clockTimer: null,
    isPreview: new URLSearchParams(location.search).get("preview") === "1",
    picsum: { id: null, pollTimer: null },
  };
  if (state.isPreview) document.documentElement.classList.add("is-preview");

  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
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
  const setText = (el, text) => {
    if (el) el.textContent = text;
  };

  function applyDigitsSize() {
    const vmin = Number(state.cfg?.theme?.digits?.size_vmin ?? 14);
    const el = $("#digits");
    if (el) el.style.fontSize = `${vmin}vmin`;
  }
  function applyMessageStyles() {
    const p = state.cfg?.theme?.messages?.primary || {};
    const s = state.cfg?.theme?.messages?.secondary || {};
    const applyTo = (sel, m) => {
      const el = $(sel);
      if (!el) return;
      el.style.fontSize = `${Number(m.size_vmin ?? 6)}vmin`;
      el.style.fontWeight = String(Number(m.weight ?? 400));
      el.style.color = String(m.color ?? "#9aa4b2");
    };
    ["#msg_primary_above", "#msg_primary_below"].forEach((sel) => applyTo(sel, p));
    ["#msg_secondary_above", "#msg_secondary_below"].forEach((sel) => applyTo(sel, s));
  }

  // ---------- Unified Picsum rotate (erstatter picsum-rotate.js) ----------
  function picsumShouldRun() {
    return (state.cfg?.theme?.background?.mode || "").toLowerCase() === "picsum";
  }

  // HARD teardown når vi ikke er i picsum-modus
  function picsumTearDownIfInactive() {
    if (picsumShouldRun()) return;

    // 1) Stopp videre polling
    clearTimeout(state.picsum.pollTimer);
    state.picsum.pollTimer = null;
    state.picsum.id = null;

    // 2) Fjern ev. eldre hooks (om vi skulle ha dem i fremtiden)
    try {
      if (window.ViewBg?.clearPicsum) window.ViewBg.clearPicsum();
      if (window.ViewBg?.disablePicsum) window.ViewBg.disablePicsum();
    } catch {}

    // 3) Hard-reset alle bakgrunns-egenskaper som Picsum kan ha satt
    const el = document.body;
    if (el) {
      el.style.background = "";
      el.style.backgroundColor = "";
      el.style.backgroundImage = "";
      el.style.backgroundRepeat = "";
      el.style.backgroundSize = "";
      el.style.backgroundPosition = "";
    }
  }

  function picsumSchedule(ms) {
    clearTimeout(state.picsum.pollTimer);
    state.picsum.pollTimer = setTimeout(picsumPoll, Math.max(750, Math.min(ms || 5000, 24 * 60 * 60 * 1000)));
  }
  async function picsumPoll() {
    try {
      if (!picsumShouldRun()) {
        picsumSchedule(5000);
        return;
      }
      const r = await fetch("/api/picsum/next", { cache: "no-store" });
      const js = await r.json();

      // Forventet: { ok, id, enabled, interval_seconds, next_in_seconds, updated }
      if (!js || js.ok === false || js.enabled === false) {
        picsumSchedule(5000);
        return;
      }

      // Oppdatér bakgrunn straks når backend sier “updated”
      if (js.updated && Number.isFinite(js.id) && js.id > 0) {
        if (js.id !== state.picsum.id) {
          state.picsum.id = js.id;
          const bg = state.cfg?.theme?.background || {};
          state.cfg.theme = state.cfg.theme || {};
          state.cfg.theme.background = bg;
          bg.picsum = bg.picsum || {};
          bg.picsum.id = js.id;
          window.ViewBg.applyBackground(document.body, bg);
          ensureForeground();
        }
        const wait = clamp((parseInt(js.interval_seconds, 10) || 5) * 1000, 1000, 24 * 60 * 60 * 1000);
        picsumSchedule(wait);
        return;
      }

      // Ikke bytte ennå → poll hurtigere nær slutten
      const nextIn = clamp(parseInt(js.next_in_seconds, 10) || 0, 0, 24 * 60 * 60);
      picsumSchedule(nextIn > 3 ? 5000 : 1000);

      // Første oppstart: ta id selv om updated=false
      if (!state.picsum.id && Number.isFinite(js.id) && js.id > 0) {
        state.picsum.id = js.id;
        const bg = state.cfg?.theme?.background || {};
        bg.picsum = bg.picsum || {};
        bg.picsum.id = js.id;
        window.ViewBg.applyBackground(document.body, bg);
        ensureForeground();
      }
    } catch {
      picsumSchedule(5000);
    }
  }

  // ---------- Sørg for at innhold alltid ligger foran bakgrunnslag ----------
  function ensureForeground() {
    [
      "#view_countdown",
      "#view_clock",
      "#screen",
      "#digits",
      "#msgs_above",
      "#msgs_below",
      "#clock_time",
      "#clock_msgs",
    ]
      .map((sel) => $(sel))
      .filter(Boolean)
      .forEach((el) => {
        if (!el.style.position) el.style.position = "relative";
        el.style.zIndex = "1";
      });

    ["#dynbg-layer", "#bg-layer", ".bg-layer", ".background-layer"].forEach((sel) => {
      $$(sel).forEach((n) => {
        n.style.zIndex = "0";
        n.style.pointerEvents = "none";
      });
    });
  }

  function renderCountdown() {
    picsumTearDownIfInactive();

    $("#view_clock")?.style && ($("#view_clock").style.display = "none");
    const root = $("#view_countdown");
    if (!root) return;
    root.style.display = "flex";

    window.ViewBg.applyBackground(document.body, state.cfg?.theme?.background);
    ensureForeground();

    if (state.clockTimer) {
      clearInterval(state.clockTimer);
      state.clockTimer = null;
    }
    $("#clock_time") && ($("#clock_time").style.display = "none");

    applyDigitsSize();
    applyMessageStyles();

    const c = state.cfg;
    const t = state.tick || { state: "idle", mode: "normal", signed_display_ms: 0, blink: false, target_hhmm: null };

    const thresholdMs = (c.hms_threshold_minutes ?? 60) * 60 * 1000;
    const isActive = t.state === "countdown" || t.state === "overrun";
    const ms = isActive ? t.signed_display_ms : 0;

    const useHMS = Math.abs(ms) >= thresholdMs;
    setText($("#digits"), useHMS ? fmtHMS(ms) : fmtMMSS(ms));

    let color = c.color_normal;
    if (c.use_phase_colors) {
      if (t.state === "overrun" || t.signed_display_ms < 0) color = c.color_over || c.color_alert;
      else if (t.mode === "alert") color = c.color_alert;
      else if (t.mode === "warn") color = c.color_warn;
    }
    const digits = $("#digits");
    if (digits) {
      digits.style.color = color;
      digits.classList.toggle("blink", !!(c.use_blink && t.blink));
    }

    const targetPrim =
      c.show_target_time && c.show_message_primary && c.target_time_after === "primary" && t.target_hhmm
        ? ` ${t.target_hhmm}`
        : "";
    const targetSec =
      c.show_target_time && c.show_message_secondary && c.target_time_after === "secondary" && t.target_hhmm
        ? ` ${t.target_hhmm}`
        : "";

    const prim = c.show_message_primary ? (c.message_primary || "") + targetPrim : "";
    const sec = c.show_message_secondary ? (c.message_secondary || "") + targetSec : "";

    const above = c.messages_position === "above";
    $("#msgs_above").style.display = above ? "block" : "none";
    $("#msgs_below").style.display = above ? "none" : "block";
    setText($("#msg_primary_above"), above ? prim : "");
    setText($("#msg_secondary_above"), above ? sec : "");
    setText($("#msg_primary_below"), !above ? prim : "");
    setText($("#msg_secondary_below"), !above ? sec : "");

    window.ViewOverlays.applyOverlays(state.cfg);
  }

  function renderClock() {
    picsumTearDownIfInactive();
    const viewCountdown = $("#view_countdown");
    if (viewCountdown) viewCountdown.style.display = "none";

    const root = $("#view_clock, #view_screen");
    const clkEl = $("#clock_time, #screen_clock");
    const wrap = $("#clock_msgs");
    const elP = $("#clock_msg_primary");
    const elS = $("#clock_msg_secondary");
    if (!root || !clkEl || !wrap || !elP || !elS) return;

    root.style.display = "flex";
    root.style.padding = `${3}vh ${5}vw`;

    window.ViewBg.applyBackground(document.body, state.cfg?.theme?.background);
    ensureForeground();

    const clk = state.cfg?.clock || {};
    const sizeVmin = clamp(Number(clk.size_vmin ?? 12), 6, 30);
    Object.assign(clkEl.style, {
      fontSize: `${sizeVmin}vmin`,
      fontWeight: "800",
      display: "block",
      color: clk.color || "#e6edf3",
    });

    const useOwn = !!clk.use_clock_messages;
    if (!useOwn) {
      root.style.flexDirection = "row";
      wrap.style.display = "none";
    } else {
      const msgP = (clk.message_primary || "").trim();
      const msgS = (clk.message_secondary || "").trim();
      const showP = !!msgP,
        showS = !!msgS;

      const msgPos = (clk.messages_position || "right").toLowerCase();
      const msgAlign = (clk.messages_align || "center").toLowerCase();

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

      setText(elP, msgP);
      setText(elS, msgS);
      elP.style.display = showP ? "block" : "none";
      elS.style.display = showS ? "block" : "none";

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
    const isColumn = (root.style.flexDirection || "row").toLowerCase() === "column";
    if (isColumn) m = { ai: m.jc, jc: m.ai };
    root.style.alignItems = m.ai;
    root.style.justifyContent = m.jc;

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

    window.ViewOverlays.applyOverlays(state.cfg);
  }

  function render() {
    const mode = (state.cfg?.mode || "daily").toLowerCase();
    if (mode === "clock") renderClock();
    else renderCountdown();
  }

  // Data
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
    // Start unified picsum-polling (kjører kun når bg.mode === "picsum")
    picsumSchedule(200);
  }
  async function pollTick() {
    const r = await fetch("/tick");
    const t = await r.json();
    state.tick = t;
    if ((t.cfg_rev || 0) !== state.lastCfgRev) await fetchConfig();
    render();
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
        if ((cfg?.theme?.background?.mode || "").toLowerCase() !== "picsum") {
          // viktig: bryt picsum-kjede straks config sier vi ikke er i picsum
          picsumTearDownIfInactive();
        }
        render();
      }
    } catch {}
  }

  // Heartbeat
  function sendHeartbeat() {
    const payload = JSON.stringify({ rev: state.lastCfgRev, page: "view" });
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
  const fsBtn = $("#btn_fullscreen");
  let lastActivityTs = Date.now();
  function showFsBtn() {
    if (!fsBtn || document.fullscreenElement) return;
    fsBtn.style.display = document.fullscreenEnabled ? "inline-block" : "none";
    fsBtn.style.opacity = "1";
  }
  function hideFsBtn() {
    if (!fsBtn || document.fullscreenElement) return;
    if (document.fullscreenEnabled) fsBtn.style.opacity = "0";
  }
  document.addEventListener("fullscreenchange", () => {
    const on = !!document.fullscreenElement;
    document.documentElement.classList.toggle("is-fullscreen", on);
    if (!fsBtn) return;
    fsBtn.style.display = on ? "none" : document.fullscreenEnabled ? "inline-block" : "none";
    if (!on) fsBtn.style.opacity = "1";
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
        if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
        else await document.exitFullscreen();
      } catch {}
    });
    showFsBtn();
  }

  // Preview
  if (!state.isPreview) {
    firstLoad().catch(console.error);
    setInterval(pollTick, 1000);
    setInterval(pollConfig, 3000);
  } else {
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

  // Oppdater picsum-resolusjon ved viewport-endring
  let lastSize = { w: 0, h: 0 };
  setInterval(() => {
    if (!state.cfg) return;
    if ((state.cfg?.theme?.background?.mode || "") !== "picsum") return;
    const { vw, vh } = window.ViewBg.viewportPxForPicsum(state.cfg.theme.background?.picsum?.fit || "cover");
    if (vw !== lastSize.w || vh !== lastSize.h) {
      lastSize = { w: vw, h: vh };
      window.ViewBg.applyBackground(document.body, state.cfg?.theme?.background);
      ensureForeground();
    }
  }, 3000);
})();
