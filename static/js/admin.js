// filepath: static/js/admin.js
(() => {
  "use strict";

  // ==== Mini DOM utils =======================================================
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  // Prøv å hente kontrastmodul (global fra contrast.js). Fallback om mangler.
  const C = window.Contrast || {
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
      const L1 = lum(toRGB(fg)),
        L2 = lum(toRGB(bg));
      const hi = Math.max(L1, L2),
        lo = Math.min(L1, L2);
      return (hi + 0.05) / (lo + 0.05);
    },
    advise: (r) =>
      r >= 3 ? { tone: "ok", label: `${r.toFixed(2)} ✔` } : { tone: "warn", label: `${r.toFixed(2)} ⚠` },
  };

  // ==== Toast/status =========================================================
  function showStatusToast(msg, tone = "info", ms = 2500) {
    const el = document.getElementById("status_toast");
    if (!el) return;

    // Behold base-klassen "toast" for posisjonering/styling
    el.className = "toast";
    el.textContent = String(msg || "");
    el.hidden = false;

    // tone = "ok" | "warn" | "error" | "info" → legg som ekstra klasse
    if (tone) el.classList.add(String(tone));

    // Vis (styres av .toast.show i CSS)
    el.classList.add("show");

    clearTimeout(el._hideTimer);
    el._hideTimer = setTimeout(
      () => {
        el.classList.remove("show", "ok", "warn", "error", "info");
        // behold "toast" videre
      },
      Math.max(600, Number(ms) || 1600),
    );
  }

  // ==== Helpers ==============================================================
  const debounce = (fn, ms = 600) => {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  };
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
    const pwd = ($("#admin_password")?.value || "").trim() || (localStorage.getItem("admin_password") || "").trim();
    const h = { "Content-Type": "application/json" };
    if (pwd) h["X-Admin-Password"] = pwd;
    return h;
  }

  async function getJSON(url) {
    try {
      if (window.ui?.get) return await window.ui.get(url);
    } catch {
      /* fallback */
    }
    const r = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    const js = await r.json().catch(() => ({}));
    if (!r.ok || js.ok === false) throw new Error(js.error || `HTTP ${r.status}`);
    return js;
  }

  async function postJSON(url, body) {
    try {
      if (window.ui?.post) return await window.ui.post(url, body);
    } catch {
      /* fallback */
    }
    const r = await fetch(url, {
      method: "POST",
      headers: { ...headers(), Accept: "application/json" },
      body: JSON.stringify(body || {}),
      credentials: "same-origin",
    });
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

  // Bruk kun backend for reset – ingen frontend-profiler/JS-defaults her.
  async function handleResetView(buttonEl) {
    const btn = buttonEl;
    const prev = btn.textContent;
    btn.disabled = true;
    btn.textContent = "Tilbakestiller …";
    try {
      const profile = (document.getElementById("reset_profile")?.value || "visual").toLowerCase();
      await postJSON("/api/reset-visual", { profile });
      await loadAll();
      lock();
      updateDigitContrastHints();
      updateMessageContrastHints();
      updateClockContrastHint?.();
      showStatusToast("Visning tilbakestilt ✔", "ok", 1400);
      window.dispatchEvent(new CustomEvent("theme:reset", { detail: { profile } }));
    } catch (e) {
      console.error(e);
      showStatusToast(`Kunne ikke tilbakestille: ${e.message}`, "error", 3500);
      alert("Tilbakestill visning feilet:\n" + (e?.message || e));
    } finally {
      btn.disabled = false;
      btn.textContent = prev;
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
      if (base === "solid") {
        return val("#bg_solid_color", "#0b0f14");
      }
      if (base === "gradient") {
        return val("#bg_grad_to", "#0b0f14");
      }
      if (base === "image") {
        const op = Number(val("#bg_img_tint_op", "0"));
        return op > 0 ? val("#bg_img_tint", "#000000") : "#0b0f14";
      }
      if (base === "picsum") {
        // NEW: use picsum tint color if present to compute contrast hints
        const op = Number(val("#bg_picsum_tint_op", "0"));
        return op > 0 ? val("#bg_picsum_tint", "#000000") : "#0b0f14";
      }
      // auto → fall back heuristics (image → gradient → solid)
      const hasImg = val("#bg_img_url", "").trim().length > 0;
      if (hasImg) {
        const op = Number(val("#bg_img_tint_op", "0"));
        return op > 0 ? val("#bg_img_tint", "#000000") : "#0b0f14";
      }
      const gradTo = val("#bg_grad_to", "");
      return gradTo || val("#bg_solid_color", "#0b0f14");
    }

    return "#0b0f14";
  }

  function getUiDefault(path, hardcoded) {
    try {
      let cur = defaultsCache;
      for (const k of path) {
        if (!cur || !(k in cur)) return hardcoded;
        cur = cur[k];
      }
      return cur ?? hardcoded;
    } catch {
      return hardcoded;
    }
  }

  function updateDigitContrastHints() {
    const bg = currentPreviewBgColor();
    const set = (id, color) => {
      const el = $(id);
      if (!el) return;
      const r = C.ratio(color, bg);
      const adv = C.advise(r);
      el.textContent = `kontrast ${r.toFixed(2)}${adv.tone === "ok" ? " ✔" : " ⚠"}`;
      el.style.color = adv.tone === "ok" ? "#69db7c" : "#ffd166";
    };
    const defNormal = getUiDefault(["color_normal"], "#e6edf3");
    const defWarn = getUiDefault(["color_warn"], "#ffd166");
    const defAlert = getUiDefault(["color_alert"], "#ff6b6b");
    const defOver = getUiDefault(["color_over"], "#9ad0ff");

    set("#c_contrast_normal", val("#color_normal", defNormal));
    set("#c_contrast_warn", val("#color_warn", defWarn));
    set("#c_contrast_alert", val("#color_alert", defAlert));
    set("#c_contrast_over", val("#color_over", defOver));
  }

  function updateMessageContrastHints() {
    const bg = currentPreviewBgColor();
    const set = (id, color) => {
      const el = $(id);
      if (!el) return;
      const r = C.ratio(color, bg);
      const adv = C.advise(r);
      el.textContent = `${r.toFixed(2)}${adv.tone === "ok" ? " ✔" : " ⚠"}`;
      el.style.color = adv.tone === "ok" ? "#69db7c" : "#ffd166";
    };
    const defP = getUiDefault(["theme", "messages", "primary", "color"], "#9aa4b2");
    const defS = getUiDefault(["theme", "messages", "secondary", "color"], "#9aa4b2");
    $("#m_contrast_p") && set("#m_contrast_p", val("#theme_p_color", defP));
    $("#m_contrast_s") && set("#m_contrast_s", val("#theme_s_color", defS));
  }

  function updateClockContrastHint() {
    const bg = currentPreviewBgColor();
    const defClk = getUiDefault(["clock", "color"], "#e6edf3");
    const color = val("#clk_color", defClk);
    const el = $("#clk_contrast");
    if (!el) return;
    const r = C.ratio(color, bg);
    const adv = C.advise(r);
    el.textContent = `kontrast ${r.toFixed(2)}${adv.tone === "ok" ? " ✔" : " ⚠"}`;
    el.style.color = adv.tone === "ok" ? "#69db7c" : "#ffd166";
  }

  // ==== Lock / UI enabling ===================================================
  const selMode = () => $$(`input[name="mode"]:checked`)[0]?.value || "daily";
  function lock() {
    const bg = selBgMode();
    const base = val("#bg_dyn_base", "auto");

    // Basic mode toggles
    $("#bg_solid_cfg") && ($("#bg_solid_cfg").style.display = bg === "solid" ? "block" : "none");
    $("#bg_grad_cfg") && ($("#bg_grad_cfg").style.display = bg === "gradient" ? "block" : "none");
    $("#bg_img_cfg") && ($("#bg_img_cfg").style.display = bg === "image" ? "block" : "none");
    $("#bg_picsum_cfg") &&
      ($("#bg_picsum_cfg").style.display =
        bg === "picsum" || (bg === "dynamic" && base === "picsum") ? "block" : "none");
    $("#bg_dyn_cfg") && ($("#bg_dyn_cfg").style.display = bg === "dynamic" ? "block" : "none");

    const own = !!$("#clk_use_own_msgs")?.checked;
    $("#clk_with_seconds") && ($("#clk_with_seconds").disabled = false);
    $("#clk_color") && ($("#clk_color").disabled = false);
    $("#clk_size_vmin") && ($("#clk_size_vmin").disabled = false);
    $("#clk_position") && ($("#clk_position").disabled = false);
    $("#clk_msg_position") && ($("#clk_msg_position").disabled = false);
    $("#clk_msg_align") && ($("#clk_msg_align").disabled = false);
    $("#clk_use_own_msgs") && ($("#clk_use_own_msgs").disabled = false);
    $("#clk_msg_primary") && ($("#clk_msg_primary").disabled = !own);
    $("#clk_msg_secondary") && ($("#clk_msg_secondary").disabled = !own);
  }

  // ==== Preview ==============================================================
  const debouncePreview = (fn) => debounce(fn, 300);
  function getPreviewWin() {
    return $("#preview_frame")?.contentWindow || null;
  }
  function deepMerge(base, patch) {
    if (patch == null || typeof patch !== "object") return base;
    const out = Array.isArray(base) ? [...base] : { ...base };
    for (const [k, v] of Object.entries(patch)) {
      out[k] = v && typeof v === "object" && !Array.isArray(v) ? deepMerge(out[k] ?? {}, v) : v;
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
  function ovSel() {
    return $("#ov_select");
  }
  function ovIdx() {
    return Math.max(0, ovSel()?.selectedIndex ?? 0);
  }
  function currentOverlay() {
    return overlaysLocal[ovIdx()] || null;
  }
  function renderOverlaysUI(desiredIndex) {
    const sel = ovSel();
    if (!sel) return;
    const prev = Number.isInteger(desiredIndex) ? desiredIndex : sel.selectedIndex;
    sel.innerHTML = "";
    overlaysLocal.forEach((o, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = o.id || `overlay ${i + 1}`;
      sel.appendChild(opt);
    });
    const idx = Math.max(0, Math.min(sel.options.length - 1, prev >= 0 ? prev : 0));
    sel.selectedIndex = idx;
    fillOverlayFields(overlaysLocal[idx] || overlayDefaults());
  }
  function fillOverlayFields(o) {
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
  function commitOverlay() {
    if (!overlaysLocal.length) return;
    overlaysLocal[ovIdx()] = readOverlayFields();
    pushPreviewDebounced();
  }
  function addOverlay() {
    overlaysLocal.push(overlayDefaults());
    renderOverlaysUI(overlaysLocal.length - 1);
    pushPreview();
  }
  function dupOverlay() {
    const cur = currentOverlay();
    if (!cur) return addOverlay();
    overlaysLocal.push({ ...cur, id: `${cur.id}-copy` });
    renderOverlaysUI(overlaysLocal.length - 1);
    pushPreview();
  }
  function delOverlay() {
    if (!overlaysLocal.length) return;
    const idx = ovIdx();
    overlaysLocal.splice(idx, 1);
    renderOverlaysUI(Math.min(idx, overlaysLocal.length - 1));
    pushPreview();
  }

  // ==== Build patch & save ===================================================
  function buildPatch() {
    const m = selMode();

    const clock = (() => {
      const has =
        $("#clk_with_seconds") ||
        $("#clk_color") ||
        $("#clk_size_vmin") ||
        $("#clk_position") ||
        $("#clk_msg_position") ||
        $("#clk_msg_align") ||
        $("#clk_use_own_msgs") ||
        $("#clk_msg_primary") ||
        $("#clk_msg_secondary");
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
      color_warn: normalizeHex6(val("#color_warn", "#ffd166"), "#ffd166"),
      color_alert: normalizeHex6(val("#color_alert", "#ff6b6b"), "#ff6b6b"),
      color_over: normalizeHex6(val("#color_over", "#9ad0ff"), "#9ad0ff"),
      show_target_time: !!$("#show_target_time")?.checked,
      target_time_after: val("#target_time_after", "secondary"),
      messages_position: val("#messages_position", "above"),
      hms_threshold_minutes: parseInt(val("#hms_threshold_minutes", "60"), 10),
      theme: {
        digits: { size_vmin: Number(val("#digits_size_vmin", "14")) },
        messages: {
          primary: {
            size_vmin: Number(val("#theme_p_size_vmin", "6")),
            weight: Number(val("#theme_p_weight", "600")),
            color: normalizeHex6(val("#theme_p_color", "#9aa4b2"), "#9aa4b2"),
          },
          secondary: {
            size_vmin: Number(val("#theme_s_size_vmin", "4")),
            weight: Number(val("#theme_s_weight", "400")),
            color: normalizeHex6(val("#theme_s_color", "#9aa4b2"), "#9aa4b2"),
          },
        },
        background: {
          mode: selBgMode(),
          solid: { color: normalizeHex6(val("#bg_solid_color", "#0b0f14"), "#0b0f14") },
          gradient: {
            from: normalizeHex6(val("#bg_grad_from", "#142033"), "#142033"),
            to: normalizeHex6(val("#bg_grad_to", "#0b0f14"), "#0b0f14"),
            angle_deg: Number(val("#bg_grad_angle", "180")),
          },
          dynamic: {
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
            tint: {
              color: normalizeHex6(val("#bg_img_tint", "#000000"), "#000000"),
              opacity: Number(val("#bg_img_tint_op", "0")),
            },
          },
        },
        // kuratert liste lagres på theme-nivå
        picsum_catalog: picsumCatalogLocal.map((x) => ({ id: Number(x.id), label: String(x.label || "") })),
      },
      clock,
    };
    // 🔧 VIKTIG: behold aktiv varighets-state i preview
  if (m === "duration") {
    const dm = Number.isFinite(lastCfg?.duration_minutes) ? lastCfg.duration_minutes : undefined;
    const ds = Number.isFinite(lastCfg?.duration_started_ms) ? lastCfg.duration_started_ms : undefined;
    if (dm != null) out.duration_minutes = dm;
    if (ds != null && ds > 0) out.duration_started_ms = ds;
  }

  // 🔧 (valgfritt, men nyttig) – behold _updated_at i simulasjonen
  if (Number.isFinite(lastCfg?._updated_at)) out._updated_at = lastCfg._updated_at;


    // Picsum spesial
    // Picsum – alltid persister verdiene fra UI (backend slår dem av når mode != picsum)
{
  const idStr = (val("#bg_picsum_id", "") || "").trim();
  const idNum = idStr ? parseInt(idStr, 10) : NaN;
  const idVal = Number.isFinite(idNum) && idNum > 0 ? idNum : null;

  const arEnabled = !!$("#bg_picsum_auto_enabled")?.checked;
  const rawVal = parseInt(val("#bg_picsum_auto_interval", "5") || "5", 10);
  const unit = (val("#bg_picsum_auto_unit", "m") || "m").toLowerCase();
  let intervalSec = Number.isFinite(rawVal) ? rawVal : 5;
  intervalSec = Math.max(5, Math.min(24 * 60 * 60, unit === "m" ? intervalSec * 60 : intervalSec));

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
    id: idVal,
    auto_rotate: {
      enabled: arEnabled,
      interval_seconds: intervalSec,
      strategy: val("#bg_picsum_auto_strategy", "shuffle") || "shuffle",
    },
    
  };
  const unitSel = document.getElementById("bg_picsum_auto_unit");
if (unitSel) {
  unitSel.addEventListener("change", () => {
  window.updatePicsumAutoIntervalConstraints && window.updatePicsumAutoIntervalConstraints();
  pushPreviewDebounced?.();
});

}

}


    return out;
  }

  // ==== Save config ==========================================================
  async function saveAll() {
    try {
      const body = buildPatch();
      await postJSON("/api/config", body);

      // VIKTIG: alltid les tilbake persistert config etter lagring,
      // så vi får med backend-normalisering (f.eks. auto-rotate OFF når mode != picsum).
      await loadAll();

      showStatusToast("Lagret ✔", "ok", 1400);
      // Push preview (konfig er allerede oppdatert i loadAll → apply → pushPreview)
      pushPreview();
    } catch (e) {
      console.error(e);
      showStatusToast(`Kunne ikke lagre: ${e.message}`, "error", 3500);
      alert("Lagring feilet:\n" + (e?.message || e));
    }
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

    const modeRadio = document.querySelector(`input[name="mode"][value="${cfg.mode || "daily"}"]`);
    if (modeRadio) modeRadio.checked = true;

    $("#daily_time") && ($("#daily_time").value = cfg.daily_time || "");
    $("#once_at") && ($("#once_at").value = (cfg.once_at || "").replace("Z", ""));
    $("#active_mode") &&
      ($("#active_mode").textContent = `Aktiv modus: ${cfg.mode} · Fase: ${tick?.mode || "—"} (${tick?.state || "—"})`);
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
    $("#messages_position") && ($("#messages_position").value = cfg.messages_position || "above");
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
    const bgRadio = document.querySelector(`input[name="bg_mode"][value="${bg.mode || "solid"}"]`);
    if (bgRadio) bgRadio.checked = true;
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
    $("#bg_picsum_fit") && ($("#bg_picsum_fit").value = bg.picsum?.fit || "cover");
    $("#bg_picsum_blur") && ($("#bg_picsum_blur").value = bg.picsum?.blur ?? 0);
    $("#bg_picsum_gray") && ($("#bg_picsum_gray").checked = !!bg.picsum?.grayscale);
    $("#bg_picsum_lock") && ($("#bg_picsum_lock").checked = !!bg.picsum?.lock_seed);
    $("#bg_picsum_seed") && ($("#bg_picsum_seed").value = bg.picsum?.seed || "");
    $("#bg_picsum_tint") && ($("#bg_picsum_tint").value = bg.picsum?.tint?.color || "#000000");
    $("#bg_picsum_tint_op") && ($("#bg_picsum_tint_op").value = bg.picsum?.tint?.opacity ?? 0);
    $("#bg_picsum_id") && ($("#bg_picsum_id").value = bg.picsum?.id ?? "");

    // Auto-rotate (om UI finnes)
    const ar = cfg?.theme?.background?.picsum?.auto_rotate || {};
    const arEnabledEl = document.getElementById("bg_picsum_auto_enabled");
    const arIntEl = document.getElementById("bg_picsum_auto_interval");
    const arUnitEl = document.getElementById("bg_picsum_auto_unit");
    const arStratEl = document.getElementById("bg_picsum_auto_strategy");
    if (arEnabledEl && arIntEl && arUnitEl && arStratEl) {
      arEnabledEl.checked = !!ar.enabled;
      const secs = Number(ar.interval_seconds ?? 300);
      if (secs % 60 === 0) {
        arUnitEl.value = "m";
        arIntEl.value = String(secs / 60);
      } else {
        arUnitEl.value = "s";
        arIntEl.value = String(secs);
      }
          if (typeof window.updatePicsumAutoIntervalConstraints === "function") {
    window.updatePicsumAutoIntervalConstraints();
  }


window.updatePicsumAutoIntervalConstraints && window.updatePicsumAutoIntervalConstraints();
      arStratEl.value = ar.strategy || "shuffle";
    }

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
      sel.addEventListener("change", () => {
        const cur = currentOverlay();
        if (cur) fillOverlayFields(cur);
      });
      [
        "#ov_id",
        "#ov_type",
        "#ov_url",
        "#ov_pos",
        "#ov_size",
        "#ov_opacity",
        "#ov_z",
        "#ov_off_vw",
        "#ov_off_vh",
        "#ov_in_clock",
        "#ov_in_countdown",
        "#ov_tint_color",
        "#ov_tint_opacity",
        "#ov_tint_blend",
      ].forEach((s) => {
        const el = $(s);
        if (!el) return;
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

    updateClockContrastHint();
    lock();
    updateDigitContrastHints();
    updateMessageContrastHints();
  }

  // --- Auto-rotate UI (opprett én gang) ---
  (function ensurePicsumAutoRotateUI() {
    const host = document.getElementById("bg_picsum_cfg");
    if (!host || host._autoRotateBound) return;

    const wrap = document.createElement("div");
    wrap.id = "picsum_auto_rotate_ui";
    wrap.style.marginTop = "8px";
    wrap.innerHTML = `
      <div class="row">
        <label style="display:flex;align-items:center;gap:8px;">
          <input type="checkbox" id="bg_picsum_auto_enabled">
          <span>Bytt bilde automatisk</span>
        </label>
      </div>
      <div class="row" style="display:flex;gap:8px;align-items:center;margin-top:6px;">
        <label>Intervall</label>
<input type="number" id="bg_picsum_auto_interval" min="1" max="${24 * 60 * 60}" step="1" value="300" style="width:110px">
        <select id="bg_picsum_auto_unit">
          <option value="s">sekunder</option>
          <option value="m" selected>minutter</option>
        </select>
        <label>Strategi</label>
        <select id="bg_picsum_auto_strategy">
          <option value="shuffle">Tilfeldig</option>
          <option value="sequential">Sekvensielt</option>
        </select>
      </div>
      <p style="opacity:.8;margin:6px 0 0;">Kilde: «Kuratert Picsum-liste». Når aktivt, kan visningen kalle <code>/api/picsum/next</code> periodisk.</p>
    `;
    // Justér min-/step for intervallfeltet basert på valgt enhet (globalt tilgjengelig)
window.updatePicsumAutoIntervalConstraints = function () {
  const unitEl = document.getElementById("bg_picsum_auto_unit");
  const intEl  = document.getElementById("bg_picsum_auto_interval");
  if (!unitEl || !intEl) return;

  if ((unitEl.value || "m") === "m") {
    // Minutter: lov 1 min
    intEl.min = "1";
    intEl.step = "1";
  } else {
    // Sekunder: min 5 sek
    intEl.min = "5";
    intEl.step = "1";
    if (Number(intEl.value) < 5) intEl.value = "5";
  }
};


    host.appendChild(wrap);

    const syncFromCfg = () => {
      const ar = lastCfg?.theme?.background?.picsum?.auto_rotate || {};
      $("#bg_picsum_auto_enabled").checked = !!ar.enabled;
      const secs = Number(ar.interval_seconds ?? 300);
      if (secs % 60 === 0) {
        $("#bg_picsum_auto_unit").value = "m";
        $("#bg_picsum_auto_interval").value = String(secs / 60);
      } else {
        $("#bg_picsum_auto_unit").value = "s";
        $("#bg_picsum_auto_interval").value = String(secs);
      }
      $("#bg_picsum_auto_strategy").value = ar.strategy || "shuffle";
    };

    ["#bg_picsum_auto_enabled", "#bg_picsum_auto_interval", "#bg_picsum_auto_unit", "#bg_picsum_auto_strategy"].forEach(
      (s) => {
        const el = $(s);
        if (!el) return;
        el.addEventListener("input", pushPreviewDebounced);
        el.addEventListener("change", pushPreviewDebounced);
      },
    );

    syncFromCfg();
    host._autoRotateBound = true;
  })();

  // === KURATERT PICSUM GALLERI (modal for picsumCatalogLocal) ==================
function ensureCuratedPicsumUI() {
  // 1) Legg til knapp under Picsum-konfig
  if (!document.getElementById("btn_picsum_curated")) {
    const host = document.getElementById("bg_picsum_cfg") || document.body;
    const bar = document.createElement("div");
    bar.style.margin = "6px 0";
    const btn = document.createElement("button");
    btn.id = "btn_picsum_curated";
    btn.type = "button";
    btn.textContent = "Åpne kuratert galleri…";
    btn.addEventListener("click", openCuratedPicsumPicker);
    bar.appendChild(btn);
    host.appendChild(bar);
  }

  // 2) Lag modal-dialog om den ikke finnes
  if (!document.getElementById("curated_modal")) {
    const dlg = document.createElement("dialog");
    dlg.id = "curated_modal";
    dlg.style.padding = "0";
    dlg.style.border = "none";
    dlg.style.maxWidth = "92vw";
    dlg.style.width = "min(1200px, 92vw)";
    dlg.style.maxHeight = "86vh";

    dlg.innerHTML = `
  <div style="display:flex; flex-direction:column; height:86vh;">
    <div style="padding:10px 12px; border-bottom:1px solid #2a2f37; display:flex; align-items:center; gap:12px; flex-wrap:wrap;">
      <strong style="font-size:1.05rem;">Kuratert Picsum-liste</strong>
      <span id="cur_status" style="opacity:.8;"></span>

      <div style="display:flex; gap:8px; align-items:center; margin-left:auto; flex-wrap:wrap;">
        <label style="display:flex; gap:6px; align-items:center;">
          <span style="opacity:.8;">Sorter</span>
          <select id="cur_sort_by">
            <option value="id">ID</option>
            <option value="name">Navn</option>
          </select>
          <select id="cur_sort_dir">
            <option value="asc">Stigende</option>
            <option value="desc">Synkende</option>
          </select>
        </label>

        <button type="button" id="cur_btn_export">Eksporter JSON</button>

        <input type="file" id="cur_import_file" accept="application/json" style="display:none;">
        <button type="button" id="cur_btn_import">Importer JSON…</button>

        <button type="button" id="cur_close">Lukk</button>
      </div>
    </div>

    <div id="cur_scroll" style="overflow:auto; padding:12px;">
      <div id="cur_grid" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(220px,1fr)); gap:12px;"></div>
    </div>
  </div>
`;

    document.body.appendChild(dlg);

    // Bind lukking
    dlg.addEventListener("click", (ev) => {
      if (ev.target === dlg) closeCuratedPicsumPicker(); // klikk utenfor
    });
    dlg.addEventListener("cancel", (e) => { e.preventDefault(); closeCuratedPicsumPicker(); });
    dlg.addEventListener("close", () => { /* ingen ekstra state nødvendig */ });
    dlg.querySelector("#cur_close")?.addEventListener("click", closeCuratedPicsumPicker);
    // Sorteringsendringer
const sortByEl  = dlg.querySelector("#cur_sort_by");
const sortDirEl = dlg.querySelector("#cur_sort_dir");
if (sortByEl && sortDirEl) {
  const applySort = () => {
    sortPicsumCatalog(sortByEl.value || "id", sortDirEl.value || "asc");
    renderPicsumList();
    renderCuratedGrid();
    pushPreviewDebounced?.();
  };
  sortByEl.addEventListener("change", applySort);
  sortDirEl.addEventListener("change", applySort);
}

// Eksport
dlg.querySelector("#cur_btn_export")?.addEventListener("click", exportCuratedPicsumList);

// Import
const importInput = dlg.querySelector("#cur_import_file");
dlg.querySelector("#cur_btn_import")?.addEventListener("click", () => importInput?.click());
importInput?.addEventListener("change", async (e) => {
  const file = e.currentTarget.files?.[0];
  if (!file) return;
  // Velg sammenslåing eller erstatting
  const merge = confirm("Importer: Vil du slå sammen med eksisterende liste? (OK = slå sammen, Cancel = erstatt)");
  if (!merge) picsumCatalogLocal = []; // blank hvis ikke merge
  await importCuratedPicsumListFromFile(file, { merge });
  e.currentTarget.value = ""; // reset file input
});

  }
  
}

function openCuratedPicsumPicker() {
  ensureCuratedPicsumUI();
  const dlg = document.getElementById("curated_modal");
  if (!dlg) return;
  if (typeof dlg.showModal === "function") dlg.showModal();
  else dlg.setAttribute("open", "");
  renderCuratedGrid();
}

function closeCuratedPicsumPicker() {
  const dlg = document.getElementById("curated_modal");
  if (!dlg) return;
  if (typeof dlg.close === "function") dlg.close();
  else dlg.removeAttribute("open");
}

function renderCuratedGrid() {
  const grid = document.getElementById("cur_grid");
  const statusEl = document.getElementById("cur_status");
  if (!grid) return;

  grid.innerHTML = "";
  const items = Array.isArray(picsumCatalogLocal) ? picsumCatalogLocal : [];
  if (statusEl) statusEl.textContent = items.length ? `(${items.length} bilde${items.length === 1 ? "" : "r"})` : "(tom)";

  if (!items.length) {
    const p = document.createElement("p");
    p.textContent = "Kuratert liste er tom. Bruk «Åpne Picsum-galleri…» for å legge til bilder.";
    p.style.opacity = ".8";
    grid.appendChild(p);
    return;
  }

  const W = 240, H = 160;
  items.forEach((it, idx) => {
    const id = Number(it?.id);
    const label = String(it?.label || "");
    if (!Number.isFinite(id) || id <= 0) return;

    const url = `https://picsum.photos/id/${id}/${W}/${H}`;

    const tile = document.createElement("div");
    tile.className = "tile curated";
    tile.style.border = "1px solid #2a2f37";
    tile.style.borderRadius = "6px";
    tile.style.overflow = "hidden";
    tile.style.background = "#0d1117";
    tile.innerHTML = `
      <div style="position:relative; aspect-ratio:${W}/${H}; background:#0b0f14;">
        <img src="${url}" alt="Picsum #${id}" style="width:100%; height:100%; object-fit:cover; display:block;">
        <div style="position:absolute; left:8px; top:8px; font-size:.8rem; background:#111827cc; color:#e5e7eb; padding:2px 6px; border-radius:4px;">#${id}</div>
      </div>
      <div style="padding:8px; display:flex; flex-direction:column; gap:6px;">
        <label style="display:flex; flex-direction:column; gap:4px;">
          <span style="opacity:.8; font-size:.85rem;">Navn / label</span>
          <input type="text" data-role="label" value="${label.replace(/"/g, "&quot;")}" style="padding:6px 8px; border:1px solid #2a2f37; background:#0b0f14; color:#e6edf3; border-radius:4px;">
        </label>
        <div style="display:flex; gap:8px; justify-content:flex-end;">
          <button type="button" data-role="use">Bruk</button>
          <button type="button" data-role="delete" style="background:#7f1d1d; color:#fff;">Slett</button>
        </div>
      </div>
    `;

    // Endre navn
    const inp = tile.querySelector('input[data-role="label"]');
    inp?.addEventListener("input", (e) => {
      const v = String(e.currentTarget.value || "");
      picsumCatalogLocal[idx] = { id, label: v };
      pushPreviewDebounced?.();
    });

    // Bruk dette bildet
    tile.querySelector('button[data-role="use"]')?.addEventListener("click", () => {
      const idField = document.getElementById("bg_picsum_id");
      if (idField) idField.value = String(id);
      const radio = document.querySelector('input[name="bg_mode"][value="picsum"]');
      if (radio) {
        radio.checked = true;
        lock();
      }
      pushPreviewDebounced?.();
    });

    // Slett fra lista
    tile.querySelector('button[data-role="delete"]')?.addEventListener("click", () => {
      // Fjern valgt entry
      picsumCatalogLocal.splice(idx, 1);
      renderPicsumList();      // oppdater <select>-lista også
      renderCuratedGrid();     // re-build modalgrid
      pushPreviewDebounced?.();
    });

    grid.appendChild(tile);
  });
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
    const sel = document.getElementById("bg_picsum_list");
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

    btnAdd &&
      btnAdd.addEventListener("click", () => {
        const id = parseInt((inId.value || "").trim(), 10);
        if (!Number.isFinite(id) || id <= 0) {
          alert("Ugyldig ID");
          return;
        }
        const label = (inLb.value || "").trim();

        const idx = picsumCatalogLocal.findIndex((x) => Number(x.id) === id);
        if (idx >= 0) picsumCatalogLocal[idx] = { id, label };
        else picsumCatalogLocal.push({ id, label });

        picsumCatalogLocal.sort((a, b) => Number(a.id) - Number(b.id));

        renderPicsumList();
        pushPreviewDebounced();
      });

    btnDel &&
      btnDel.addEventListener("click", () => {
        const i = sel.selectedIndex;
        if (i < 0) return;
        picsumCatalogLocal.splice(i, 1);
        renderPicsumList(i);
        pushPreviewDebounced();
      });

    btnUse &&
      btnUse.addEventListener("click", () => {
        const i = sel.selectedIndex;
        const item = picsumCatalogLocal[i];
        if (!item) return;
        const id = Number(item.id);
        const idField = document.getElementById("bg_picsum_id");
        if (idField) idField.value = String(id);
        const radio = document.querySelector(`input[name="bg_mode"][value="picsum"]`);
        if (radio) {
          radio.checked = true;
          lock();
        }
        pushPreviewDebounced();
      });

    bindPicsumListOnce._bound = true;
  }

  // === PICSUM GALLERI (modal + henting + kuratering) ==========================
  const PICSUM_API = "https://picsum.photos/v2/list";
  const PICSUM_THUMB_W = 240;
  const PICSUM_THUMB_H = 160;

  const picsumPicker = {
    open: false,
    page: 1,
    perPage: 24,
    items: [],
    selected: new Set(),
    loading: false,
  };

  function ensurePicsumBrowseButton() {
    if (document.getElementById("btn_picsum_browse")) return;
    const host = document.getElementById("bg_picsum_cfg") || document.body;
    const bar = document.createElement("div");
    bar.style.margin = "8px 0 6px 0";
    const btn = document.createElement("button");
    btn.id = "btn_picsum_browse";
    btn.type = "button";
    btn.textContent = "Åpne Picsum-galleri…";
    btn.addEventListener("click", () => (window.openPicsumPicker ? window.openPicsumPicker() : null));
    bar.appendChild(btn);
    host.appendChild(bar);
  }

  // --- Picsum modal: bind mot eksisterende <dialog id="picsum_modal"> ---
  function ensurePicsumModal() {
    const dlg = document.getElementById("picsum_modal");
    if (!dlg || dlg._bound) return;

    // Lukk ved klikk utenfor boksen
    dlg.addEventListener("click", (ev) => {
      if (ev.target === dlg) closePicsumPicker();
    });

    // "Esc" → close (standard), men sørg for å rydde status
    dlg.addEventListener("cancel", (e) => {
      e.preventDefault();
      closePicsumPicker();
    });

    // Rydd state når dialog lukkes
    dlg.addEventListener("close", () => {
      picsumPicker.open = false;
      picsumPicker.selected.clear();
    });

    // Knapper og inputfelt i dialogen (finnes allerede i admin.html)
    document.getElementById("pg_close")?.addEventListener("click", closePicsumPicker);

    document.getElementById("pg_prev")?.addEventListener("click", () => {
      if (picsumPicker.page > 1) {
        picsumPicker.page--;
        fetchPicsumPage();
      }
    });

    document.getElementById("pg_next")?.addEventListener("click", () => {
      picsumPicker.page++;
      fetchPicsumPage();
    });

    document.getElementById("pg_page")?.addEventListener("change", () => {
      const p = parseInt(document.getElementById("pg_page").value || "1", 10);
      picsumPicker.page = Math.max(1, Number.isFinite(p) ? p : 1);
      fetchPicsumPage();
    });

    document.getElementById("pg_per_page")?.addEventListener("change", () => {
      picsumPicker.perPage = parseInt(document.getElementById("pg_per_page").value, 10) || 24;
      fetchPicsumPage();
    });

    document.getElementById("pg_add")?.addEventListener("click", () => addSelectedToCurated(false));
    document.getElementById("pg_add_use")?.addEventListener("click", () => addSelectedToCurated(true));

    dlg._bound = true;
  }

  function openPicsumPicker() {
    ensurePicsumModal();
    const dlg = document.getElementById("picsum_modal");
    if (!dlg) return;

    picsumPicker.open = true;
    picsumPicker.selected = new Set();

    // Åpne riktig – dette gir korrekt backdrop + scrolling
    if (typeof dlg.showModal === "function") dlg.showModal();
    else dlg.setAttribute("open", ""); // fallback

    // Synk UI og last side
    const pg = document.getElementById("pg_page");
    const pp = document.getElementById("pg_per_page");
    if (pg) pg.value = String(picsumPicker.page);
    if (pp) pp.value = String(picsumPicker.perPage);

    fetchPicsumPage();
  }

  function closePicsumPicker() {
    const dlg = document.getElementById("picsum_modal");
    if (!dlg) return;
    picsumPicker.open = false;

    if (typeof dlg.close === "function") dlg.close();
    else dlg.removeAttribute("open"); // fallback
  }

  // eksponer for "Åpne Picsum-galleri…" knappen
  window.openPicsumPicker = openPicsumPicker;
  window.closePicsumPicker = closePicsumPicker;

  async function fetchPicsumPage() {
    if (!picsumPicker.open) return;
    picsumPicker.loading = true;
    renderPicsumGrid();
    const url = `${PICSUM_API}?page=${picsumPicker.page}&limit=${picsumPicker.perPage}`;
    try {
      const r = await fetch(url, { cache: "no-store" });
      const arr = await r.json();
      picsumPicker.items = Array.isArray(arr) ? arr : [];
      picsumPicker.loading = false;
      renderPicsumGrid();
    } catch {
      picsumPicker.items = [];
      picsumPicker.loading = false;
      const s = document.getElementById("pg_status");
      if (s) s.textContent = "Kunne ikke hente fra picsum.photos";
    }
  }

  function renderPicsumGrid() {
    const grid = document.getElementById("pg_grid");
    const s = document.getElementById("pg_status");
    if (!grid) return;
    grid.innerHTML = "";
    if (s)
      s.textContent = picsumPicker.loading
        ? "Laster…"
        : `Side ${picsumPicker.page} · ${picsumPicker.items.length} bilder`;

    picsumPicker.items.forEach((it) => {
      const id = Number(it.id);
      const author = String(it.author || "").trim();
      const url = `https://picsum.photos/id/${id}/${PICSUM_THUMB_W}/${PICSUM_THUMB_H}`;

      // static/js/admin.js — REPLACE tile building inside renderPicsumGrid()
      const tile = document.createElement("div");
      tile.className = "tile";
      tile.innerHTML = `
  <img src="${url}" alt="Picsum #${id}">
  <div class="check">#${id}</div>
  <div class="meta"><strong>${author || "Ukjent"}</strong></div>
`;
      const mark = () => {
        if (picsumPicker.selected.has(id)) {
          picsumPicker.selected.delete(id);
          tile.classList.remove("selected");
        } else {
          picsumPicker.selected.add(id);
          tile.classList.add("selected");
        }
      };
      tile.addEventListener("click", mark);
      grid.appendChild(tile);
    });
  }

  function addSelectedToCurated(useFirst) {
    if (!picsumPicker.selected.size) {
      alert("Ingen bilder valgt.");
      return;
    }
    const picked = Array.from(picsumPicker.selected.values());
    const byId = new Map(picsumCatalogLocal.map((x) => [Number(x.id), x]));
    picsumPicker.items.forEach((it) => {
      const id = Number(it.id);
      if (picsumPicker.selected.has(id)) {
        byId.set(id, { id, label: String(it.author || "") });
      }
    });
    picsumCatalogLocal = Array.from(byId.values()).sort((a, b) => Number(a.id) - Number(b.id));
    renderPicsumList();
    pushPreviewDebounced();
    showStatusToast(`${picked.length} bilde(r) lagt i kuratert liste`, "ok", 1800);

    if (useFirst) {
      const first = picked[0];
      const idField = document.getElementById("bg_picsum_id");
      if (idField) idField.value = String(first);
      const radio = document.querySelector(`input[name="bg_mode"][value="picsum"]`);
      if (radio) {
        radio.checked = true;
        lock();
      }
      pushPreviewDebounced();
    }
    closePicsumPicker();
  }

  // ==== Loading / sync =======================================================
  async function loadAll() {
    const js = await getJSON("/api/config");
    js.config.tick = js.tick;
    apply(js.config, js.tick);
    pushPreview();
    showStatusToast("Status oppdatert", "info", 1200);
  }
  // ==== Sync-pill (robust) =====================================================
  async function updateSyncPill() {
    // Sørg for at elementet finnes
    let pill = document.getElementById("sync_pill");
    if (!pill) {
      const host = document.getElementById("admin_toolbar") || document.body;
      pill = document.createElement("span");
      pill.id = "sync_pill";
      pill.className = "pill dot off";
      pill.title = "Synk: —";
      host.appendChild(pill);
    }

    try {
      const js = await getJSON("/debug/view-heartbeat");
      const hb = js.heartbeat || {};
      const age = hb.age_seconds ?? 9999;
      const viewRev = hb.rev || 0;
      const cfgRev = lastCfg && lastCfg._updated_at ? lastCfg._updated_at : 0;

      let tone = "off";
      let title = "Synk: —";

      if (age > 30 || !hb.ts_iso) {
        tone = "off";
        title = "Synk: visning offline";
      } else if (viewRev >= cfgRev) {
        tone = "ok";
        title = `Synk: OK (rev ${viewRev})`;
      } else {
        tone = "warn";
        title = `Synk: venter (view ${viewRev} < cfg ${cfgRev})`;
      }

      pill.className = `pill dot ${tone}`;
      pill.title = title;
      pill.textContent = "";
    } catch {
      pill.className = "pill dot off";
      pill.title = "Synk: —";
      pill.textContent = "";
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
    if (!Number.isFinite(m) || m <= 0) {
      alert("Ugyldig varighet");
      return;
    }
    await postJSON("/api/start-duration", { minutes: m });
    await loadAll();
  }
  async function stopDuration() {
    await postJSON("/api/stop", {});
    await loadAll();
  }

  // ==== Presets ==============================================================
  function applyPreset() {
    const p = (document.querySelector("#bg_preset")?.value || "none").trim();

    if (p === "none") {
      // noop
    } else if (p === "dark-solid") {
      (document.querySelector(`input[name="bg_mode"][value="solid"]`) || {}).checked = true;
      $("#bg_solid_color") && ($("#bg_solid_color").value = "#061126");
    } else if (p === "dark-grad") {
      (document.querySelector(`input[name="bg_mode"][value="gradient"]`) || {}).checked = true;
      $("#bg_grad_from") && ($("#bg_grad_from").value = "#274779");
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
      $("#bg_img_url") &&
        ($("#bg_img_url").value = "https://static.wixstatic.com/media/8ff0d1_1e540e760d3d4a77af3d5cd39e2be4f8~mv2.jpg");
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
      el.addEventListener("change", () => {
        lock();
        updateDigitContrastHints();
        updateMessageContrastHints();
        updateClockContrastHint();
      }),
    );
    const baseSel = $("#bg_dyn_base");
  if (baseSel) {
    baseSel.addEventListener("change", () => {
      lock();                           // vis/skjul korrekt konfigseksjon
      updateDigitContrastHints();       // korrekt kontrast mot valgt base
      updateMessageContrastHints();
      updateClockContrastHint();
      pushPreviewDebounced?.();         // (valgfritt) oppdater live preview
    });
  }
    ["color_normal", "color_warn", "color_alert", "color_over", "theme_p_color", "theme_s_color"].forEach((id) => {
      const e = document.getElementById(id);
      e &&
        e.addEventListener("input", () => {
          updateDigitContrastHints();
          updateMessageContrastHints();
        });
    });
    $$(".preset").forEach((b) =>
      b.addEventListener("click", async () => {
        const m = Number(b.dataset.min);
        const e = $("#start_minutes");
        if (e) e.value = String(m);
        await startDuration(m);
      }),
    );
    $("#btn_apply_preset") && $("#btn_apply_preset").addEventListener("click", applyPreset);
    $("#btn_save") && $("#btn_save").addEventListener("click", () => saveAll().catch((e) => alert(e.message)));
    $("#btn_refresh") && $("#btn_refresh").addEventListener("click", () => loadAll().catch((e) => alert(e.message)));
    $("#btn_reset_view") && $("#btn_reset_view").addEventListener("click", (ev) => handleResetView(ev.currentTarget));
    $("#btn_start") && $("#btn_start").addEventListener("click", () => startDuration().catch((e) => alert(e.message)));
    $("#btn_stop") && $("#btn_stop").addEventListener("click", () => stopDuration().catch((e) => alert(e.message)));
    const clkColorEl = $("#clk_color");
    clkColorEl && clkColorEl.addEventListener("input", updateClockContrastHint);
    document.addEventListener("input", pushPreviewDebounced, { passive: true });
    document.addEventListener("change", pushPreviewDebounced, { passive: true });
    $$(".mode-btn").forEach((b) => b.addEventListener("click", () => patchMode(b.dataset.mode)));
    $$(".mode-preset").forEach((b) =>
      b.addEventListener("click", async () => {
        const m = Number(b.dataset.min || "0");
        if (!Number.isFinite(m) || m <= 0) return;
        await startDuration(m);
      }),
    );
    const f = $("#preview_frame");
    if (f) f.addEventListener("load", () => setTimeout(pushPreview, 50), { once: true });
    setTimeout(pushPreview, 80);
  }
  function ensureDynamicBaseOptions() {
    const sel = document.getElementById("bg_dyn_base");
    if (!sel) return;
    const wanted = [
      ["auto", "(auto: bilde → gradient → ensfarget)"],
      ["solid", "Ensfarget"],
      ["gradient", "Gradient"],
      ["image", "Bilde"],
      ["picsum", "Picsum (kuratert)"], // NEW
    ];
    const have = new Set(Array.from(sel.options).map((o) => o.value));
    for (const [val, label] of wanted) {
      if (!have.has(val)) {
        const opt = document.createElement("option");
        opt.value = val;
        opt.textContent = label;
        sel.appendChild(opt);
      }
    }
  }
// --- Sort / Export / Import helpers -----------------------------------------
function sortPicsumCatalog(by = "id", dir = "asc") {
  const norm = (s) => String(s || "").trim().toLowerCase();
  const m = by === "name" ? "label" : "id";
  picsumCatalogLocal.sort((a, b) => {
    if (m === "id") {
      const x = Number(a.id) - Number(b.id);
      return dir === "desc" ? -x : x;
    }
    // name
    const x = norm(a.label) < norm(b.label) ? -1 : norm(a.label) > norm(b.label) ? 1 : 0;
    return dir === "desc" ? -x : x;
  });
}

function exportCuratedPicsumList() {
  // Lag én-linje-objekter og pakk dem i en JSON-array med komma mellom linjene
  const items = picsumCatalogLocal.map(({ id, label }) => ({
    id: Number(id),
    label: String(label || ""),
  }));

  const lines = items.map((o) => "  " + JSON.stringify(o)); // 2-space indent
  const content = "[\n" + lines.map((l, i) => l + (i < lines.length - 1 ? "," : "")).join("\n") + "\n]\n";

  const blob = new Blob([content], { type: "application/json" });
  const name = `picsum-curated-${new Date().toISOString().slice(0, 10)}.json`;
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 0);
}



// Robust import av kuratert Picsum-liste (JSON array eller JSONL-lignende)
async function importCuratedPicsumList(fileOrText) {
  const text = typeof fileOrText === "string" ? fileOrText : await fileOrText.text();

  function processItems(items) {
    if (!Array.isArray(items)) throw new Error("Forventet en JSON-array av {id,label}");
    const byId = new Map(picsumCatalogLocal.map((x) => [Number(x.id), { id: Number(x.id), label: String(x.label || "") }]));
    for (const it of items) {
      if (!it || typeof it !== "object") continue;
      const id = Number(it.id);
      if (!Number.isFinite(id) || id <= 0) continue;
      const label = String(it.label || "");
      byId.set(id, { id, label });
    }
    picsumCatalogLocal = Array.from(byId.values()).sort((a, b) => a.id - b.id);
    renderPicsumList();
    pushPreviewDebounced?.();
  }

  // 1) Prøv ren JSON-array først
  try {
    const parsed = JSON.parse(text);
    processItems(parsed);
    showStatusToast("Importert kuratert liste ✔", "ok", 1500);
    return;
  } catch {
    // fallthrough
  }

  // 2) Tolerant parser: JSONL/én-linje-per-objekt, med/uten komma
  try {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(
        (l) =>
          l &&
          l !== "[" &&
          l !== "]" &&
          l !== "," &&
          !/^\/\/.*/.test(l) && // drop JS-kommentarer
          !/^#/.test(l), // drop evt. shell-kommentarer
      );

    const items = [];
    for (let line of lines) {
      // Fjern trailing komma og hengende komma etter } eller ]
      line = line.replace(/,+$/, "");
      try {
        items.push(JSON.parse(line));
      } catch {
        // prøv å plukke ut {...} i tilfelle linja inneholder “index: {...}”
        const m = line.match(/\{.*\}/);
        if (m) {
          items.push(JSON.parse(m[0]));
        } else {
          // ignorer linja hvis den ikke er parsebar
        }
      }
    }

    processItems(items);
    showStatusToast("Importert kuratert liste ✔", "ok", 1500);
  } catch (e) {
    console.error(e);
    showStatusToast("Kunne ikke importere kuratert liste", "error", 3000);
    alert("Import feilet:\n" + (e?.message || e));
  }
}

// Koble til en “Importer”-knapp (og et skjult file input). Kall fra init().
function bindPicsumImport() {
  const btn = document.getElementById("btn_picsum_import");
  if (!btn || btn._bound) return;

  let fileIn = document.getElementById("picsum_import_file");
  if (!fileIn) {
    fileIn = document.createElement("input");
    fileIn.type = "file";
    fileIn.accept = ".json,application/json,text/plain";
    fileIn.id = "picsum_import_file";
    fileIn.style.display = "none";
    document.body.appendChild(fileIn);
  }

  btn.addEventListener("click", () => fileIn.click());
  fileIn.addEventListener("change", async (ev) => {
    const f = ev.target.files && ev.target.files[0];
    if (!f) return;
    try {
      await importCuratedPicsumList(f);
    } finally {
      // nullstill for å tillate ny import av samme filnavn
      fileIn.value = "";
    }
  });

  btn._bound = true;
}



  // ==== Init =================================================================
  async function init() {
    bindEvents();
    ensureDynamicBaseOptions();
    ensurePicsumBrowseButton();
    ensurePicsumModal();
    ensureCuratedPicsumUI();
bindPicsumImport();
    await loadAll().catch(console.error);
    await updateSyncPill().catch(() => {});
    setInterval(updateSyncPill, 3000);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
