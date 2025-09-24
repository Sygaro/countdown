// static/js/admin.js
(() => {
  "use strict";

  // ==== Mini DOM utils =======================================================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // Prøv å hente kontrastmodul (global fra contrast.js). Fallback om mangler.
  const C = (window.Contrast || {
    ratio: (fg, bg) => {
      const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i;
      const toRGB = (h) => {
        const x = m.exec(String(h || "").trim());
        return x ? [parseInt(x[1], 16), parseInt(x[2], 16), parseInt(x[3], 16)] : [230, 237, 243];
      };
      const lum = (rgb) => {
        const a = rgb.map((v) => {
          v /= 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
      };
      const L1 = lum(toRGB(fg)), L2 = lum(toRGB(bg));
      const hi = Math.max(L1, L2), lo = Math.min(L1, L2);
      return (hi + 0.05) / (lo + 0.05);
    },
    // Viktig: gi tilbake struktur som brukes ellers i koden
    advise: (r) => (r >= 3
      ? { tone: "ok",   label: `${r.toFixed(2)} ✔` }
      : { tone: "warn", label: `${r.toFixed(2)} ⚠` }),
  });

  // ==== Toast/status =========================================================
  function showStatusToast(msg, tone = "info", ms = 2500) {
    let el = document.getElementById("status_toast");
    if (!el) { el = document.createElement("div"); el.id = "status_toast"; document.body.appendChild(el); }
    el.className = "";
    el.textContent = String(msg || "");
    el.classList.add(tone || "info", "show");
    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(() => el.classList.remove("show"), Math.max(600, Number(ms) || 1600));
  }

  // ==== Helpers ==============================================================
  const debounce = (fn, ms = 600) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };
  const val = (sel, d = "") => $(sel)?.value ?? d;
  const checked = (sel) => !!$(sel)?.checked;

  // Hex normalisering (#RRGGBB)
  function normalizeHex6(h, fallback = "#000000") {
    const s = String(h || "").trim();
    const m8 = /^#?([0-9a-fA-F]{6})([0-9a-fA-F]{2})$/.exec(s);
    if (m8) return "#" + m8[1].toLowerCase(); // strip alpha
    const m6 = /^#?([0-9a-fA-F]{6})$/.exec(s);
    if (m6) return "#" + m6[1].toLowerCase();
    return fallback;
  }

  function headers() {
    const pwd = ($("#admin_password")?.value || "").trim();
    const h = { "Content-Type": "application/json" };
    if (pwd) h["X-Admin-Password"] = pwd;
    return h;
  }

  async function getJSON(url) {
    try { if (window.ui?.get) return await window.ui.get(url); } catch { /* fallback to fetch */ }
    const r = await fetch(url, { cache: "no-store" });
    const js = await r.json().catch(() => ({}));
    if (!r.ok || js.ok === false) throw new Error(js.error || `HTTP ${r.status}`);
    return js;
  }
  async function postJSON(url, body) {
    try { if (window.ui?.post) return await window.ui.post(url, body); } catch { /* fallback to fetch */ }
    const r = await fetch(url, { method: "POST", headers: headers(), body: JSON.stringify(body || {}) });
    const js = await r.json().catch(() => ({}));
    if (!r.ok || js.ok === false) throw new Error(js.error || `HTTP ${r.status}`);
    return js;
  }

  // ==== State ================================================================
  let lastCfg = null;
  let defaultsCache = null;
  let overlaysLocal = [];
  let picsumCatalogLocal = []; // Picsum-bilder—med ID

  // ==== Defaults / reset view ===============================================
  async function fetchDefaults() {
    if (defaultsCache) return defaultsCache;
    const js = await getJSON("/api/defaults");
    defaultsCache = js.defaults || js;
    return defaultsCache;
  }
  
// 1) Velg hva som skal tilbakestilles her.
// Slå PÅ/AV grupper for å styre hvilke felter som settes ved reset.
const RESET_FLAGS = {
  phaseColors: true,            // #color_* (normal/warn/alert/over)
  uiMessagesText: true,         // #message_primary / #message_secondary
  themeMessages: true,          // #theme_* (sizes/weights/colors for primary/secondary)
  digits: true,                 // #digits_size_vmin
  clockColor: true,             // #clk_color
  clockTexts: false,            // #clk_msg_primary / #clk_msg_secondary
  background: {
    mode: true,                 // radio: input[name="bg_mode"]
    solid: true,                // #bg_solid_*
    gradient: true,             // #bg_grad_*
    image: true,                // #bg_img_* (inkl. tint)
    picsum: true,               // #bg_picsum_* (inkl. tint)
    dynamic: true,              // #bg_dyn_*
    picsumId: false             // om ID skal settes (ofte vil du beholde valgt ID)
  }
};

// Små hjelpere
const setIf = (sel, v) => { const el = document.querySelector(sel); if (el != null) el.value = String(v); };
const checkIf = (sel, on) => { const el = document.querySelector(sel); if (el != null) el.checked = !!on; };

async function handleResetView(buttonEl) {
  const btn = buttonEl;
  const prev = btn.textContent;
  btn.disabled = true; btn.textContent = "Tilbakestiller …";
  try {
    // Hent defaults (kun tema) og lagre på server
    const d = await fetchDefaults();
    const T = d.theme || {};
    await postJSON("/api/config", { theme: T });

    // Pakk ut med trygge fallbacks
    const M = T.messages  || {};
    const D = T.digits    || {};
    const B = T.background|| {};
    const Mp = M.primary   || {};
    const Ms = M.secondary || {};
    const S  = B.solid     || {};
    const G  = B.gradient  || {};
    const I  = B.image     || {};
    const DY = B.dynamic   || {};
    const P  = B.picsum    || {};
    const mode = B.mode || "solid";

    // === Farger som styrer faser (visningstall) ===
    if (RESET_FLAGS.phaseColors) {
      setIf("#color_normal", "#e6edf3");
      setIf("#color_warn",   "#ffd166");
      setIf("#color_alert",  "#ff6b6b");
      setIf("#color_over",   "#9ad0ff");
    }

    // === Overordnede meldinger i visning (tekstfelt) ===
    if (RESET_FLAGS.uiMessagesText) {
      setIf("#message_primary",   "");
      setIf("#message_secondary", "");
    }

    // === Typografi/farge for meldinger (theme.*) ===
    if (RESET_FLAGS.themeMessages) {
      setIf("#theme_p_size_vmin", String(Mp.size_vmin ?? 10));
      setIf("#theme_p_weight",    String(Mp.weight    ?? 700));
      setIf("#theme_p_color",     Mp.color ?? "#9aa4b2");

      setIf("#theme_s_size_vmin", String(Ms.size_vmin ?? 8));
      setIf("#theme_s_weight",    String(Ms.weight    ?? 400));
      setIf("#theme_s_color",     Ms.color ?? "#9aa4b2");
    }

    // === Sifferstørrelse ===
    if (RESET_FLAGS.digits) {
      const digitsVmin = (D.size_vmin != null) ? D.size_vmin : (D.size_vw != null ? D.size_vw : 14);
      setIf("#digits_size_vmin", String(digitsVmin));
    }

    // === Klokke ===
    if (RESET_FLAGS.clockColor) setIf("#clk_color", "#e6edf3");
    if (RESET_FLAGS.clockTexts) {
      setIf("#clk_msg_primary", "Velkommen!");
      setIf("#clk_msg_secondary", "");
    }

    // === Bakgrunn ===
    if (RESET_FLAGS.background.mode) {
      const radio = document.querySelector(`input[name="bg_mode"][value="${mode}"]`);
      if (radio) radio.checked = true;
    }
    if (RESET_FLAGS.background.solid) {
      setIf("#bg_solid_color", S.color ?? "#0b0f14");
    }
    if (RESET_FLAGS.background.gradient) {
      setIf("#bg_grad_from",  G.from ?? "#142033");
      setIf("#bg_grad_to",    G.to   ?? "#0b0f14");
      setIf("#bg_grad_angle", String(G.angle_deg ?? 160));
    }
    if (RESET_FLAGS.background.image) {
      setIf("#bg_img_url",  I.url ?? "");
      setIf("#bg_img_fit",  I.fit ?? "cover");
      setIf("#bg_img_op",   String(I.opacity ?? 1));
      setIf("#bg_img_tint", I.tint?.color ?? "#000000");
      setIf("#bg_img_tint_op", String(I.tint?.opacity ?? 0));
    }
    if (RESET_FLAGS.background.picsum) {
      setIf("#bg_picsum_fit",      P.fit ?? "cover");
      setIf("#bg_picsum_blur",     String(P.blur ?? 0));
      checkIf("#bg_picsum_gray",   !!P.grayscale);
      checkIf("#bg_picsum_lock",   !!P.lock_seed);
      setIf("#bg_picsum_seed",     P.seed ?? "");
      setIf("#bg_picsum_tint",     P.tint?.color ?? "#000000");
      setIf("#bg_picsum_tint_op",  String(P.tint?.opacity ?? 0));
      if (RESET_FLAGS.background.picsumId) setIf("#bg_picsum_id", String(P.id ?? ""));
    }
    if (RESET_FLAGS.background.dynamic) {
      setIf("#bg_dyn_base",    DY.base_mode ?? "auto");
      setIf("#bg_dyn_from",    DY.from ?? "#16233a");
      setIf("#bg_dyn_to",      DY.to   ?? "#0e1a2f");
      setIf("#bg_dyn_rotate",  String(DY.rotate_s ?? 60));
      setIf("#bg_dyn_blur",    String(DY.blur_px  ?? 18));
      setIf("#bg_dyn_opacity", String(DY.opacity  ?? 0.9));
      setIf("#bg_dyn_layer",   DY.layer ?? "under");
    }

    // Oppdater UI-tilstand og hints
    lock();
    updateDigitContrastHints();
    updateMessageContrastHints();
    updateClockContrastHint?.();

    showStatusToast("Visning tilbakestilt ✔", "ok", 1400);
    window.dispatchEvent(new CustomEvent("theme:reset", { detail: T }));
  } catch (e) {
    console.error(e);
    showStatusToast(`Kunne ikke tilbakestille: ${e.message}`, "error", 3500);
    alert("Tilbakestill visning feilet:\n" + (e?.message || e));
  } finally {
    btn.disabled = false; btn.textContent = prev;
  }
}


  // ==== BG & kontrast helpers ===============================================
  const selBgMode = () => $$(`input[name="bg_mode"]:checked`)[0]?.value || "solid";

  function currentPreviewBgColor() {
    const bg = selBgMode();

    if (bg === "solid") {
      return val("#bg_solid_color", "#0b0f14");
    }
    if (bg === "gradient") {
      return val("#bg_grad_to", "#0b0f14");
    }
    if (bg === "image") {
      const op = Number(val("#bg_img_tint_op", "0"));
      return op > 0 ? val("#bg_img_tint", "#000000") : "#0b0f14";
    }
    if (bg === "picsum") {
      const op = Number(val("#bg_picsum_tint_op", "0"));
      return op > 0 ? val("#bg_picsum_tint", "#000000") : "#0b0f14";
    }
    if (bg === "dynamic") {
      const base = val("#bg_dyn_base", "auto");
      if (base === "solid")    return val("#bg_solid_color", "#0b0f14");
      if (base === "gradient") return val("#bg_grad_to", "#0b0f14");
      if (base === "image") {
        const op = Number(val("#bg_img_tint_op", "0"));
        return op > 0 ? val("#bg_img_tint", "#000000") : "#0b0f14";
      }
      const hasImg = (val("#bg_img_url", "").trim().length > 0);
      if (hasImg) {
        const op = Number(val("#bg_img_tint_op", "0"));
        return op > 0 ? val("#bg_img_tint", "#000000") : "#0b0f14";
      }
      const gradTo = val("#bg_grad_to", "");
      return gradTo || val("#bg_solid_color", "#0b0f14");
    }

    return "#0b0f14";
  }

  function updateDigitContrastHints() {
    const bg = currentPreviewBgColor();
    const set = (id, color) => {
      const el = $(id); if (!el) return;
      const r = C.ratio(color, bg); const adv = C.advise(r);
      el.textContent = `kontrast ${r.toFixed(2)}${adv.tone === "ok" ? " ✔" : " ⚠"}`;
      el.style.color = adv.tone === "ok" ? "#69db7c" : "#ffd166";
    };
    set("#c_contrast_normal", val("#color_normal", "#e6edf3"));
    set("#c_contrast_warn",   val("#color_warn",   "#ffd166"));
    set("#c_contrast_alert",  val("#color_alert",  "#ff6b6b"));
    set("#c_contrast_over",   val("#color_over",   "#9ad0ff"));
  }
  function updateMessageContrastHints() {
    const bg = currentPreviewBgColor();
    const set = (id, color) => {
      const el = $(id); if (!el) return;
      const r = C.ratio(color, bg); const adv = C.advise(r);
      el.textContent = `${r.toFixed(2)}${adv.tone === "ok" ? " ✔" : " ⚠"}`;
      el.style.color = adv.tone === "ok" ? "#69db7c" : "#ffd166";
    };
    $("#m_contrast_p") && set("#m_contrast_p", val("#theme_p_color", "#9aa4b2"));
    $("#m_contrast_s") && set("#m_contrast_s", val("#theme_s_color", "#9aa4b2"));
  }
  function updateClockContrastHint() {
    const bg = currentPreviewBgColor();
    const color = val("#clk_color", "#e6edf3");
    const el = $("#clk_contrast");
    if (!el) return;
    const r = C.ratio(color, bg); const adv = C.advise(r);
    el.textContent = `kontrast ${r.toFixed(2)}${adv.tone === "ok" ? " ✔" : " ⚠"}`;
    el.style.color = adv.tone === "ok" ? "#69db7c" : "#ffd166";
  }

  // ==== Lock / UI enabling ===================================================
  const selMode = () => $$(`input[name="mode"]:checked`)[0]?.value || "daily";
  function lock() {
    const bg = selBgMode();
    const onceAt = $("#once_at");
    if (onceAt) onceAt.disabled = selMode() !== "once";
    $("#bg_solid_cfg")  && ($("#bg_solid_cfg").style.display  = bg === "solid"   ? "block" : "none");
    $("#bg_grad_cfg")   && ($("#bg_grad_cfg").style.display   = bg === "gradient"? "block" : "none");
    $("#bg_img_cfg")    && ($("#bg_img_cfg").style.display    = bg === "image"   ? "block" : "none");
    $("#bg_picsum_cfg") && ($("#bg_picsum_cfg").style.display = bg === "picsum"  ? "block" : "none");
    $("#bg_dyn_cfg")    && ($("#bg_dyn_cfg").style.display    = bg === "dynamic" ? "block" : "none");
    const own = !!$("#clk_use_own_msgs")?.checked;
    $("#clk_with_seconds") && ($("#clk_with_seconds").disabled = false);
    $("#clk_color")        && ($("#clk_color").disabled = false);
    $("#clk_size_vmin")    && ($("#clk_size_vmin").disabled = false);
    $("#clk_position")     && ($("#clk_position").disabled = false);
    $("#clk_msg_position") && ($("#clk_msg_position").disabled = false);
    $("#clk_msg_align")    && ($("#clk_msg_align").disabled = false);
    $("#clk_use_own_msgs") && ($("#clk_use_own_msgs").disabled = false);
    $("#clk_msg_primary")  && ($("#clk_msg_primary").disabled = !own);
    $("#clk_msg_secondary")&& ($("#clk_msg_secondary").disabled = !own);
  }

  // ==== Preview ==============================================================
  const debouncePreview = (fn) => debounce(fn, 300);
  function getPreviewWin() { return $("#preview_frame")?.contentWindow || null; }
  function deepMerge(base, patch) {
    if (patch == null || typeof patch !== "object") return base;
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const [k, v] of Object.entries(patch)) {
      out[k] = (v && typeof v === "object" && !Array.isArray(v)) ? deepMerge(out[k] ?? {}, v) : v;
    }
    return out;
  }
  function pushPreview() {
    const win = getPreviewWin();
    if (!win || !lastCfg) return;
    const patch = buildPatch();
    const simulated = deepMerge(lastCfg, patch);
    win.postMessage({ type: "preview-config", config: simulated }, "*");
  }
  const pushPreviewDebounced = debouncePreview(pushPreview);

  // ==== Overlays =============================================================
  function overlayDefaults() {
    return {
      id: `logo-${Date.now()}`,
      type: "image",
      url: "",
      position: "top-right",
      size_vmin: 30,
      opacity: 1.0,
      offset_vw: 2,
      offset_vh: 2,
      z_index: 10,
      visible_in: ["clock", "countdown"],
      tint: { color: "#000000", opacity: 0.0, blend: "multiply" },
    };
  }
  function ovSel() { return $("#ov_select"); }
  function ovIdx() { return Math.max(0, (ovSel()?.selectedIndex ?? 0)); }
  function currentOverlay() { return overlaysLocal[ovIdx()] || null; }
  function renderOverlaysUI(desiredIndex) {
    const sel = ovSel(); if (!sel) return;
    const prev = Number.isInteger(desiredIndex) ? desiredIndex : sel.selectedIndex;
    sel.innerHTML = "";
    overlaysLocal.forEach((o, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = o.id || (`overlay ${i + 1}`);
      sel.appendChild(opt);
    });
    const idx = Math.max(0, Math.min(sel.options.length - 1, prev >= 0 ? prev : 0));
    sel.selectedIndex = idx;
    fillOverlayFields(overlaysLocal[idx] || overlayDefaults());
  }
  function fillOverlayFields(o) {
    $("#ov_id")?.setAttribute("value", o.id || "");
    $("#ov_id") && ($("#ov_id").value = o.id || "");
    $("#ov_type") && ($("#ov_type").value = o.type || "image");
    $("#ov_url") && ($("#ov_url").value = o.url || "");
    $("#ov_pos") && ($("#ov_pos").value = o.position || "top-right");
    $("#ov_size") && ($("#ov_size").value = String(o.size_vmin ?? 12));
    $("#ov_opacity") && ($("#ov_opacity").value = String(o.opacity ?? 1));
    $("#ov_z") && ($("#ov_z").value = String(o.z_index ?? 10));
    $("#ov_off_vw") && ($("#ov_off_vw").value = String(o.offset_vw ?? 2));
    $("#ov_off_vh") && ($("#ov_off_vh").value = String(o.offset_vh ?? 2));
    $("#ov_in_clock") && ($("#ov_in_clock").checked = !!(o.visible_in || []).includes("clock"));
    $("#ov_in_countdown") && ($("#ov_in_countdown").checked = !!(o.visible_in || []).includes("countdown"));
    $("#ov_tint_color") && ($("#ov_tint_color").value = o?.tint?.color || "#000000");
    $("#ov_tint_opacity") && ($("#ov_tint_opacity").value = String(o?.tint?.opacity ?? 0));
    $("#ov_tint_blend") && ($("#ov_tint_blend").value = o?.tint?.blend || "multiply");
  }
  function readOverlayFields() {
    const vis = [];
    if ($("#ov_in_clock")?.checked) vis.push("clock");
    if ($("#ov_in_countdown")?.checked) vis.push("countdown");
    return {
      id: ($("#ov_id")?.value || "").trim(),
      type: $("#ov_type")?.value || "image",
      url: ($("#ov_url")?.value || "").trim(),
      position: $("#ov_pos")?.value || "top-right",
      size_vmin: Number($("#ov_size")?.value || "12"),
      opacity: Number($("#ov_opacity")?.value || "1"),
      z_index: Number($("#ov_z")?.value || "10"),
      offset_vw: Number($("#ov_off_vw")?.value || "2"),
      offset_vh: Number($("#ov_off_vh")?.value || "2"),
      visible_in: vis,
      tint: {
        color: normalizeHex6($("#ov_tint_color")?.value || "#000000", "#000000"),
        opacity: Number($("#ov_tint_opacity")?.value || "0"),
        blend: $("#ov_tint_blend")?.value || "multiply",
      },
    };
  }
  function commitOverlay() { if (!overlaysLocal.length) return; overlaysLocal[ovIdx()] = readOverlayFields(); pushPreviewDebounced(); }
  function addOverlay() { overlaysLocal.push(overlayDefaults()); renderOverlaysUI(overlaysLocal.length - 1); pushPreview(); }
  function dupOverlay() { const cur = currentOverlay(); if (!cur) return addOverlay(); overlaysLocal.push({ ...cur, id: `${cur.id}-copy` }); renderOverlaysUI(overlaysLocal.length - 1); pushPreview(); }
  function delOverlay() { if (!overlaysLocal.length) return; const idx = ovIdx(); overlaysLocal.splice(idx, 1); renderOverlaysUI(Math.min(idx, overlaysLocal.length - 1)); pushPreview(); }

  // ==== Build patch & save ===================================================
  function buildPatch() {
    const m = selMode();

    const clock = (() => {
      const has = $("#clk_with_seconds") || $("#clk_color") || $("#clk_size_vmin") || $("#clk_position") ||
                  $("#clk_msg_position") || $("#clk_msg_align") || $("#clk_use_own_msgs") ||
                  $("#clk_msg_primary") || $("#clk_msg_secondary");
      if (has) {
        return {
          with_seconds: !!$("#clk_with_seconds")?.checked,
          color: normalizeHex6(val("#clk_color", "#e6edf3"), "#e6edf3"),
          size_vmin: Number(val("#clk_size_vmin", "12")),
          position: val("#clk_position", "center"),
          messages_position: val("#clk_msg_position", "right"),
          messages_align: val("#clk_msg_align", "center"),
          use_clock_messages: !!$("#clk_use_own_msgs")?.checked,
          message_primary: val("#clk_msg_primary", ""),
          message_secondary: val("#clk_msg_secondary", ""),
        };
      }
      return lastCfg?.clock || {};
    })();

    const out = {
      mode: m,
      daily_time: val("#daily_time"),
      once_at: val("#once_at"),
      overlays_mode: "replace",
      overlays: overlaysLocal,
      show_message_primary: !!$("#show_message_primary")?.checked,
      show_message_secondary: !!$("#show_message_secondary")?.checked,
      message_primary: val("#message_primary"),
      message_secondary: val("#message_secondary"),
      warn_minutes: Number(val("#warn_minutes", "4")),
      alert_minutes: Number(val("#alert_minutes", "2")),
      blink_seconds: Number(val("#blink_seconds", "10")),
      overrun_minutes: Number(val("#overrun_minutes", "1")),
      use_phase_colors: !!$("#use_phase_colors")?.checked,
      use_blink: !!$("#use_blink")?.checked,
      color_normal: normalizeHex6(val("#color_normal", "#e6edf3"), "#e6edf3"),
      color_warn:   normalizeHex6(val("#color_warn",   "#ffd166"), "#ffd166"),
      color_alert:  normalizeHex6(val("#color_alert",  "#ff6b6b"), "#ff6b6b"),
      color_over:   normalizeHex6(val("#color_over",   "#9ad0ff"), "#9ad0ff"),
      show_target_time: !!$("#show_target_time")?.checked,
      target_time_after: val("#target_time_after", "secondary"),
      messages_position: val("#messages_position", "below"),
      hms_threshold_minutes: parseInt(val("#hms_threshold_minutes", "60"), 10),
      theme: {
        digits: { size_vmin: Number(val("#digits_size_vmin", "14")) },
        messages: {
          primary:   { size_vmin: Number(val("#theme_p_size_vmin", "6")), weight: Number(val("#theme_p_weight", "600")), color: normalizeHex6(val("#theme_p_color", "#9aa4b2"), "#9aa4b2") },
          secondary: { size_vmin: Number(val("#theme_s_size_vmin", "4")), weight: Number(val("#theme_s_weight", "400")), color: normalizeHex6(val("#theme_s_color", "#9aa4b2"), "#9aa4b2") },
        },
        background: {
          mode: selBgMode(),
          solid:    { color: normalizeHex6(val("#bg_solid_color", "#0b0f14"), "#0b0f14") },
          gradient: { from: normalizeHex6(val("#bg_grad_from", "#142033"), "#142033"), to: normalizeHex6(val("#bg_grad_to", "#0b0f14"), "#0b0f14"), angle_deg: Number(val("#bg_grad_angle", "180")) },
          dynamic:  {
            from: normalizeHex6(val("#bg_dyn_from", "#16233a"), "#16233a"),
            to: normalizeHex6(val("#bg_dyn_to", "#0e1a2f"), "#0e1a2f"),
            rotate_s: Number(val("#bg_dyn_rotate", "60")),
            blur_px: Number(val("#bg_dyn_blur", "18")),
            opacity: Number(val("#bg_dyn_opacity", "0.9")),
            base_mode: val("#bg_dyn_base", "auto"),
            layer: val("#bg_dyn_layer", "under"),
          },
          image: {
            url: val("#bg_img_url", ""),
            fit: val("#bg_img_fit", "cover"),
            opacity: Number(val("#bg_img_op", "1")),
            tint: { color: normalizeHex6(val("#bg_img_tint", "#000000"), "#000000"), opacity: Number(val("#bg_img_tint_op", "0")) },
          },
        },
        picsum_catalog: picsumCatalogLocal.map(x => ({ id: Number(x.id), label: String(x.label || "") })),
      },
      clock,
    };

    if (out.theme.background.mode === "picsum") {
      const idRaw = (val("#bg_picsum_id", "") || "").trim();
      const parsedId = idRaw ? parseInt(idRaw, 10) : NaN;
      out.theme.background.picsum = {
        fit: val("#bg_picsum_fit", "cover"),
        blur: Math.max(0, Math.min(10, Number(val("#bg_picsum_blur", "0")))),
        grayscale: !!$("#bg_picsum_gray")?.checked,
        lock_seed: !!$("#bg_picsum_lock")?.checked,
        seed: (val("#bg_picsum_seed", "") || "").trim(),
        tint: {
          color: normalizeHex6(val("#bg_picsum_tint", "#000000"), "#000000"),
          opacity: Math.max(0, Math.min(1, Number(val("#bg_picsum_tint_op", "0")))),
        },
      };
      if (Number.isFinite(parsedId) && parsedId > 0) {
        out.theme.background.picsum.id = parsedId;
      }
    }
    return out;
  }

  async function saveAll() {
    const body = buildPatch();
    const js = await postJSON("/api/config", body);
    lastCfg = js.config || lastCfg;
    apply(js.config, js.tick);
    showStatusToast("Lagret ✔", "ok", 1400);
  }

  // ==== Apply config to form =================================================
  function setVal(sel, value) {
    const el = document.querySelector(sel);
    if (!el) return;
    const prev = el.value;
    el.value = String(value);
    if (prev !== el.value) {
      el.dispatchEvent(new Event("input", { bubbles: true }));
      el.dispatchEvent(new Event("change", { bubbles: true }));
    }
  }

  function apply(cfg, tick) {
    lastCfg = cfg;

    document.querySelector(`input[name="mode"][value="${cfg.mode || "daily"}"]`)?.setAttribute("checked", "true");
    document.querySelector(`input[name="mode"][value="${cfg.mode || "daily"}"]`) && (document.querySelector(`input[name="mode"][value="${cfg.mode || "daily"}"]`).checked = true);

    $("#daily_time") && ($("#daily_time").value = cfg.daily_time || "");
    $("#once_at") && ($("#once_at").value = (cfg.once_at || "").replace("Z", ""));
    $("#active_mode") && ($("#active_mode").textContent = `Aktiv modus: ${cfg.mode} · Fase: ${tick?.mode || "—"} (${tick?.state || "—"})`);
    $("#show_message_primary") && ($("#show_message_primary").checked = !!cfg.show_message_primary);
    $("#show_message_secondary") && ($("#show_message_secondary").checked = !!cfg.show_message_secondary);
    $("#message_primary") && ($("#message_primary").value = cfg.message_primary || "");
    $("#message_secondary") && ($("#message_secondary").value = cfg.message_secondary || "");
    $("#warn_minutes") && ($("#warn_minutes").value = cfg.warn_minutes ?? 4);
    $("#alert_minutes") && ($("#alert_minutes").value = cfg.alert_minutes ?? 2);
    $("#blink_seconds") && ($("#blink_seconds").value = cfg.blink_seconds ?? 10);
    $("#overrun_minutes") && ($("#overrun_minutes").value = cfg.overrun_minutes ?? 1);
    $("#use_phase_colors") && ($("#use_phase_colors").checked = !!cfg.use_phase_colors);
    $("#use_blink") && ($("#use_blink").checked = !!cfg.use_blink);
    $("#color_normal") && ($("#color_normal").value = cfg.color_normal || "#e6edf3");
    $("#color_warn") && ($("#color_warn").value = cfg.color_warn || "#ffd166");
    $("#color_alert") && ($("#color_alert").value = cfg.color_alert || "#ff6b6b");
    $("#color_over") && ($("#color_over").value = cfg.color_over || "#9ad0ff");
    $("#show_target_time") && ($("#show_target_time").checked = !!cfg.show_target_time);
    $("#target_time_after") && ($("#target_time_after").value = cfg.target_time_after || "secondary");
    $("#messages_position") && ($("#messages_position").value = cfg.messages_position || "below");
    $("#hms_threshold_minutes") && ($("#hms_threshold_minutes").value = cfg.hms_threshold_minutes ?? 60);

    const p = cfg?.theme?.messages?.primary || {};
    const s = cfg?.theme?.messages?.secondary || {};
    $("#theme_p_size_vmin") && ($("#theme_p_size_vmin").value = String(p.size_vmin ?? 6));
    $("#theme_p_weight") && ($("#theme_p_weight").value = String(p.weight ?? 600));
    $("#theme_p_color") && ($("#theme_p_color").value = String(p.color ?? "#9aa4b2"));
    $("#theme_s_size_vmin") && ($("#theme_s_size_vmin").value = String(s.size_vmin ?? 4));
    $("#theme_s_weight") && ($("#theme_s_weight").value = String(s.weight ?? 400));
    $("#theme_s_color") && ($("#theme_s_color").value = String(s.color ?? "#9aa4b2"));

    const d = cfg?.theme?.digits || {};
    const sizeVmin = Number(d.size_vmin ?? 14);
    $("#digits_size_vmin") && ($("#digits_size_vmin").value = String(sizeVmin));

    overlaysLocal = Array.isArray(cfg.overlays) ? JSON.parse(JSON.stringify(cfg.overlays)) : [];
    renderOverlaysUI();

    const bg = cfg?.theme?.background || {};
    document.querySelector(`input[name="bg_mode"][value="${bg.mode || "solid"}"]`) && (document.querySelector(`input[name="bg_mode"][value="${bg.mode || "solid"}"]`).checked = true);
    $("#bg_solid_color") && ($("#bg_solid_color").value = bg.solid?.color || "#0b0f14");
    $("#bg_grad_from") && ($("#bg_grad_from").value = bg.gradient?.from || "#142033");
    $("#bg_grad_to") && ($("#bg_grad_to").value = bg.gradient?.to || "#0b0f14");
    $("#bg_grad_angle") && ($("#bg_grad_angle").value = bg.gradient?.angle_deg ?? 180);
    $("#bg_img_url") && ($("#bg_img_url").value = bg.image?.url || "");
    $("#bg_img_fit") && ($("#bg_img_fit").value = bg.image?.fit || "cover");
    $("#bg_img_op") && ($("#bg_img_op").value = bg.image?.opacity ?? 1);
    $("#bg_img_tint") && ($("#bg_img_tint").value = bg.image?.tint?.color || "#000000");
    $("#bg_img_tint_op") && ($("#bg_img_tint_op").value = bg.image?.tint?.opacity ?? 0);
    $("#bg_dyn_base") && ($("#bg_dyn_base").value = bg.dynamic?.base_mode || "auto");
    $("#bg_dyn_from") && ($("#bg_dyn_from").value = bg.dynamic?.from || "#16233a");
    $("#bg_dyn_to") && ($("#bg_dyn_to").value = bg.dynamic?.to || "#0e1a2f");
    $("#bg_dyn_rotate") && ($("#bg_dyn_rotate").value = bg.dynamic?.rotate_s ?? 60);
    $("#bg_dyn_blur") && ($("#bg_dyn_blur").value = bg.dynamic?.blur_px ?? 18);
    $("#bg_dyn_opacity") && ($("#bg_dyn_opacity").value = bg.dynamic?.opacity ?? 0.9);
    $("#bg_dyn_layer") && ($("#bg_dyn_layer").value = bg.dynamic?.layer || "under");

    // Picsum
    $("#bg_picsum_fit")      && ($("#bg_picsum_fit").value      = bg.picsum?.fit || "cover");
    $("#bg_picsum_blur")     && ($("#bg_picsum_blur").value     = bg.picsum?.blur ?? 0);
    $("#bg_picsum_gray")     && ($("#bg_picsum_gray").checked   = !!bg.picsum?.grayscale);
    $("#bg_picsum_lock")     && ($("#bg_picsum_lock").checked   = !!bg.picsum?.lock_seed);
    $("#bg_picsum_seed")     && ($("#bg_picsum_seed").value     = bg.picsum?.seed || "");
    $("#bg_picsum_tint")     && ($("#bg_picsum_tint").value     = bg.picsum?.tint?.color || "#000000");
    $("#bg_picsum_tint_op")  && ($("#bg_picsum_tint_op").value  = bg.picsum?.tint?.opacity ?? 0);
    $("#bg_picsum_id")       && ($("#bg_picsum_id").value       = (bg.picsum?.id ?? ""));

    const clk = cfg?.clock || {};
    $("#clk_with_seconds") && ($("#clk_with_seconds").checked = !!clk.with_seconds);
    $("#clk_color") && ($("#clk_color").value = clk.color || "#e6edf3");
    $("#clk_size_vmin") && ($("#clk_size_vmin").value = clk.size_vmin ?? 12);
    $("#clk_position") && ($("#clk_position").value = clk.position || "center");
    $("#clk_msg_position") && ($("#clk_msg_position").value = cfg?.clock?.messages_position || "right");
    $("#clk_msg_align") && ($("#clk_msg_align").value = cfg?.clock?.messages_align || "center");
    $("#clk_use_own_msgs") && ($("#clk_use_own_msgs").checked = !!cfg?.clock?.use_clock_messages);
    $("#clk_msg_primary") && ($("#clk_msg_primary").value = cfg?.clock?.message_primary || "");
    $("#clk_msg_secondary") && ($("#clk_msg_secondary").value = cfg?.clock?.message_secondary || "");

    const sel = ovSel();
    if (sel && !sel._bound) {
      sel.addEventListener("change", () => { const cur = currentOverlay(); if (cur) fillOverlayFields(cur); });
      ["#ov_id","#ov_type","#ov_url","#ov_pos","#ov_size","#ov_opacity","#ov_z","#ov_off_vw","#ov_off_vh","#ov_in_clock","#ov_in_countdown","#ov_tint_color","#ov_tint_opacity","#ov_tint_blend"].forEach((s) => {
        const el = $(s); if (!el) return;
        el.addEventListener("input", commitOverlay);
        el.addEventListener("change", commitOverlay);
      });
      $("#ov_add") && $("#ov_add").addEventListener("click", addOverlay);
      $("#ov_dup") && $("#ov_dup").addEventListener("click", dupOverlay);
      $("#ov_del") && $("#ov_del").addEventListener("click", delOverlay);
      sel._bound = true;
    }

    picsumCatalogLocal = Array.isArray(cfg?.theme?.picsum_catalog) ? [...cfg.theme.picsum_catalog] : [];
    renderPicsumList();
    bindPicsumListOnce();

    updateClockContrastHint(); lock(); updateDigitContrastHints(); updateMessageContrastHints();
  }

  function renderPicsumList(selectedIndex) {
    const sel = document.getElementById("bg_picsum_list");
    if (!sel) return;
    const prev = Number.isInteger(selectedIndex) ? selectedIndex : sel.selectedIndex;
    sel.innerHTML = "";
    picsumCatalogLocal.forEach((item, i) => {
      const opt = document.createElement("option");
      const id = Number(item?.id);
      const label = String(item?.label || "").trim();
      opt.value = String(i);
      opt.textContent = label ? `${id} — ${label}` : String(id);
      sel.appendChild(opt);
    });
    const idx = Math.max(0, Math.min(sel.options.length - 1, prev >= 0 ? prev : 0));
    sel.selectedIndex = sel.options.length ? idx : -1;
  }

  function bindPicsumListOnce() {
    if (bindPicsumListOnce._bound) return;
    const sel  = document.getElementById("bg_picsum_list");
    const inId = document.getElementById("bg_picsum_item_id");
    const inLb = document.getElementById("bg_picsum_item_label");
    const btnAdd = document.getElementById("bg_picsum_add");
    const btnDel = document.getElementById("bg_picsum_delete");
    const btnUse = document.getElementById("bg_picsum_use");

    if (!sel || !inId || !inLb) return;

    sel.addEventListener("change", () => {
      const i = sel.selectedIndex;
      const item = picsumCatalogLocal[i];
      if (!item) return;
      inId.value = item.id ?? "";
      inLb.value = item.label ?? "";
    });

    btnAdd && btnAdd.addEventListener("click", () => {
      const id = parseInt((inId.value || "").trim(), 10);
      if (!Number.isFinite(id) || id <= 0) { alert("Ugyldig ID"); return; }
      const label = (inLb.value || "").trim();

      const idx = picsumCatalogLocal.findIndex((x) => Number(x.id) === id);
      if (idx >= 0) picsumCatalogLocal[idx] = { id, label };
      else picsumCatalogLocal.push({ id, label });

      picsumCatalogLocal.sort((a, b) => Number(a.id) - Number(b.id));

      renderPicsumList();
      pushPreviewDebounced();
    });

    btnDel && btnDel.addEventListener("click", () => {
      const i = sel.selectedIndex;
      if (i < 0) return;
      picsumCatalogLocal.splice(i, 1);
      renderPicsumList(i);
      pushPreviewDebounced();
    });

    btnUse && btnUse.addEventListener("click", () => {
      const i = sel.selectedIndex;
      const item = picsumCatalogLocal[i];
      if (!item) return;
      const id = Number(item.id);
      const idField = document.getElementById("bg_picsum_id");
      if (idField) idField.value = String(id);
      const radio = document.querySelector(`input[name="bg_mode"][value="picsum"]`);
      if (radio) { radio.checked = true; lock(); }
      pushPreviewDebounced();
    });

    bindPicsumListOnce._bound = true;
  }

  // ==== Loading / sync =======================================================
  async function loadAll() {
    const js = await getJSON("/api/config");
    js.config.tick = js.tick;
    apply(js.config, js.tick);
    pushPreview();
    showStatusToast("Status oppdatert", "info", 1200);
  }
  async function updateSyncPill() {
    const pill = $("#sync_pill"); if (!pill) return;
    try {
      const js = await getJSON("/debug/view-heartbeat");
      const hb = js.heartbeat || {};
      const age = hb.age_seconds ?? 9999;
      const viewRev = hb.rev || 0;
      const cfgRev = lastCfg && lastCfg._updated_at ? lastCfg._updated_at : 0;
      let detailed = "", cls = "off";
      if (age > 30 || !hb.ts_iso) { detailed = "Synk: visning offline"; cls = "off"; }
      else if (viewRev >= cfgRev) { detailed = `Synk: OK (rev ${viewRev})`; cls = "ok"; }
      else { detailed = `Synk: venter (view ${viewRev} < cfg ${cfgRev})`; cls = "warn"; }
      pill.className = `pill dot ${cls}`; pill.title = detailed; pill.textContent = "";
    } catch {
      pill.className = "pill dot off"; pill.title = "Synk: —"; pill.textContent = "";
    }
  }

  // ==== Mode/duration actions ===============================================
  async function patchMode(newMode) {
    await postJSON("/api/config", { mode: newMode });
    const radio = document.querySelector(`input[name="mode"][value="${newMode}"]`);
    if (radio) radio.checked = true;
    await loadAll();
  }
  async function startDuration(argMinutes) {
    const m = argMinutes != null ? Number(argMinutes) : parseInt(val("#start_minutes", "0"), 10);
    if (!Number.isFinite(m) || m <= 0) { alert("Ugyldig varighet"); return; }
    await postJSON("/api/start-duration", { minutes: m }); await loadAll();
  }
  async function stopDuration() { await postJSON("/api/stop", {}); await loadAll(); }

  // ==== Presets ============================================================== 
  function applyPreset() {
    const p = (document.querySelector("#bg_preset")?.value || "none").trim();

    if (p === "none") {
      // noop
    } else if (p === "dark-solid") {
      (document.querySelector(`input[name="bg_mode"][value="solid"]`) || {}).checked = true;
      $("#bg_solid_color") && ($("#bg_solid_color").value = "#0b0f14");
    } else if (p === "dark-grad") {
      (document.querySelector(`input[name="bg_mode"][value="gradient"]`) || {}).checked = true;
      $("#bg_grad_from") && ($("#bg_grad_from").value = "#111827");
      $("#bg_grad_to") && ($("#bg_grad_to").value = "#0b0f14");
      $("#bg_grad_angle") && ($("#bg_grad_angle").value = 160);
    } else if (p === "dynamic") {
      (document.querySelector(`input[name="bg_mode"][value="dynamic"]`) || {}).checked = true;
      $("#bg_dyn_from") && ($("#bg_dyn_from").value = "#16233a");
      $("#bg_dyn_to") && ($("#bg_dyn_to").value = "#0e1a2f");
      $("#bg_dyn_rotate") && ($("#bg_dyn_rotate").value = 25);
      $("#bg_dyn_blur") && ($("#bg_dyn_blur").value = 45);
      $("#bg_dyn_opacity") && ($("#bg_dyn_opacity").value = 0.9);
      $("#bg_dyn_layer") && ($("#bg_dyn_layer").value = "under");
    } else if (p === "photo-tint") {
      (document.querySelector(`input[name="bg_mode"][value="image"]`) || {}).checked = true;
      $("#bg_img_url") && ($("#bg_img_url").value = "https://picsum.photos/1600/900");
      $("#bg_img_fit") && ($("#bg_img_fit").value = "cover");
      $("#bg_img_op") && ($("#bg_img_op").value = 1);
      $("#bg_img_tint") && ($("#bg_img_tint").value = "#471010");
      $("#bg_img_tint_op") && ($("#bg_img_tint_op").value = 0.4);
    } else if (p === "photo-HP") {
      (document.querySelector(`input[name="bg_mode"][value="image"]`) || {}).checked = true;
      $("#bg_img_url") && ($("#bg_img_url").value = "https://static.wixstatic.com/media/8ff0d1_1e540e760d3d4a77af3d5cd39e2be4f8~mv2.jpg");
      $("#bg_img_fit") && ($("#bg_img_fit").value = "cover");
      $("#bg_img_op") && ($("#bg_img_op").value = 1);
      $("#bg_img_tint") && ($("#bg_img_tint").value = "#0d4082");
      $("#bg_img_tint_op") && ($("#bg_img_tint_op").value = 0.35);
    }

    lock();
    updateDigitContrastHints();
    updateMessageContrastHints();
    updateClockContrastHint?.();
    pushPreview();
  }

  // ==== Events ===============================================================
  function bindEvents() {
    $$(`input[name="mode"]`).forEach((el) => el.addEventListener("change", lock));
    $$(`input[name="bg_mode"]`).forEach((el) =>
      el.addEventListener("change", () => { lock(); updateDigitContrastHints(); updateMessageContrastHints(); updateClockContrastHint(); }),
    );
    ["color_normal","color_warn","color_alert","color_over","theme_p_color","theme_s_color"].forEach((id) => {
      const e = document.getElementById(id);
      e && e.addEventListener("input", () => { updateDigitContrastHints(); updateMessageContrastHints(); });
    });
    $$(".preset").forEach((b) => b.addEventListener("click", async () => {
      const m = Number(b.dataset.min);
      const e = $("#start_minutes"); if (e) e.value = String(m);
      await startDuration(m);
    }));
    $("#btn_apply_preset") && $("#btn_apply_preset").addEventListener("click", applyPreset);
    $("#btn_save")    && $("#btn_save").addEventListener("click", () => saveAll().catch((e) => alert(e.message)));
    $("#btn_refresh") && $("#btn_refresh").addEventListener("click", () => loadAll().catch((e) => alert(e.message)));
    $("#btn_reset_view") && $("#btn_reset_view").addEventListener("click", (ev) => handleResetView(ev.currentTarget));
    $("#btn_start") && $("#btn_start").addEventListener("click", () => startDuration().catch((e) => alert(e.message)));
    $("#btn_stop")  && $("#btn_stop").addEventListener("click",  () => stopDuration().catch((e) => alert(e.message)));
    const clkColorEl = $("#clk_color"); clkColorEl && clkColorEl.addEventListener("input", updateClockContrastHint);
    document.addEventListener("input",  pushPreviewDebounced, { passive: true });
    document.addEventListener("change", pushPreviewDebounced, { passive: true });
    $$(".mode-btn").forEach((b) => b.addEventListener("click", () => patchMode(b.dataset.mode)));
    $$(".mode-preset").forEach((b) => b.addEventListener("click", async () => {
      const m = Number(b.dataset.min || "0"); if (!Number.isFinite(m) || m <= 0) return; await startDuration(m);
    }));
    const f = $("#preview_frame"); if (f) f.addEventListener("load", () => setTimeout(pushPreview, 50), { once: true });
    setTimeout(pushPreview, 80);
  }

  // ==== Init =================================================================
  async function init() { bindEvents(); await loadAll().catch(console.error); setInterval(updateSyncPill, 3000); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true }); else init();
})();
