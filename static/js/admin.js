// static/js/admin.js
// Admin-panel logikk: lasting, lagring, varighetsstart/stopp, overlays, preview, kontrast-hints, sync-pill m.m.

import { ui } from "/static/js/ui.js";

(function () {
  // --- små helpers ---
  const el = (id) => document.getElementById(id);
  const val = (id, def = "") => (el(id) ? el(id).value : def);
  const setVal = (id, v) => el(id) && (el(id).value = v);
  const setChecked = (id, on) => el(id) && (el(id).checked = !!on);
  const checked = (id) => !!(el(id) && el(id).checked);
  const numOr = (v, d) => {
    const n = Number(v);
    return isFinite(n) ? n : d;
  };

  let lastCfg = null;
  let overlaysLocal = [];

  // --- overlays ---
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

  function currentOverlay() {
    const sel = el("ov_select");
    if (!sel) return null;
    return overlaysLocal[sel.selectedIndex] || null;
  }

  function fillOverlayFields(o) {
    setVal("ov_id", o.id || "");
    setVal("ov_type", o.type || "image");
    setVal("ov_url", o.url || "");
    setVal("ov_pos", o.position || "top-right");
    setVal("ov_size", String(o.size_vmin ?? 30));
    setVal("ov_opacity", String(o.opacity ?? 1));
    setVal("ov_z", String(o.z_index ?? 10));
    setVal("ov_off_vw", String(o.offset_vw ?? 2));
    setVal("ov_off_vh", String(o.offset_vh ?? 2));
    setChecked("ov_in_clock", (o.visible_in || []).includes("clock"));
    setChecked("ov_in_countdown", (o.visible_in || []).includes("countdown"));
    setVal("ov_tint_color", o.tint?.color || "#000000");
    setVal("ov_tint_opacity", String(o.tint?.opacity ?? 0));
    setVal("ov_tint_blend", o.tint?.blend || "multiply");
  }

  function readOverlayFields() {
    const vis = [];
    if (checked("ov_in_clock")) vis.push("clock");
    if (checked("ov_in_countdown")) vis.push("countdown");
    return {
      id: val("ov_id"),
      type: val("ov_type", "image"),
      url: val("ov_url"),
      position: val("ov_pos", "top-right"),
      size_vmin: Number(val("ov_size", "30")),
      opacity: Number(val("ov_opacity", "1")),
      z_index: Number(val("ov_z", "10")),
      offset_vw: Number(val("ov_off_vw", "2")),
      offset_vh: Number(val("ov_off_vh", "2")),
      visible_in: vis.length ? vis : ["countdown", "clock"],
      tint: {
        color: val("ov_tint_color", "#000000"),
        opacity: Number(val("ov_tint_opacity", "0")),
        blend: val("ov_tint_blend", "multiply"),
      },
    };
  }

  function renderOverlaysUI(desiredIndex) {
    const sel = el("ov_select");
    if (!sel) return;
    sel.innerHTML = "";
    overlaysLocal.forEach((o, i) => {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = o.id || `(overlay ${i + 1})`;
      sel.appendChild(opt);
    });
    const idx = Math.max(
      0,
      Math.min(sel.options.length - 1, desiredIndex ?? sel.selectedIndex ?? 0),
    );
    sel.selectedIndex = idx;
    fillOverlayFields(overlaysLocal[idx] || overlayDefaults());
  }

  function commitOverlay() {
    if (!overlaysLocal.length) return;
    overlaysLocal[el("ov_select").selectedIndex] = readOverlayFields();
    pushPreview();
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
    overlaysLocal.splice(el("ov_select").selectedIndex, 1);
    renderOverlaysUI();
    pushPreview();
  }

  // --- preview ---
  function getPreviewWin() {
    return document.getElementById("preview_frame")?.contentWindow || null;
  }
  function pushPreview() {
    const win = getPreviewWin();
    if (!win || !lastCfg) return;
    const patch = buildPatch();
    const simulated = { ...lastCfg, ...patch };
    win.postMessage({ type: "preview-config", config: simulated }, "*");
  }

  // --- kontrastberegning ---
  function hexToRgb(h) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(h.trim());
    return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [230, 237, 243];
  }
  function luminance([r, g, b]) {
    const a = [r, g, b].map((v) => {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
  }
  function contrast(c1, c2) {
    const L1 = luminance(hexToRgb(c1));
    const L2 = luminance(hexToRgb(c2));
    const [hi, lo] = L1 > L2 ? [L1, L2] : [L2, L1];
    return (hi + 0.05) / (lo + 0.05);
  }

  // --- patch og lagring ---
  function buildPatch() {
    return {
      mode: document.querySelector("input[name=mode]:checked")?.value || "daily",
      daily_time: val("daily_time"),
      once_at: val("once_at"),
      overlays: overlaysLocal,
      message_primary: val("message_primary"),
      message_secondary: val("message_secondary"),
      show_message_primary: checked("show_message_primary"),
      show_message_secondary: checked("show_message_secondary"),
      warn_minutes: numOr(val("warn_minutes"), 4),
      alert_minutes: numOr(val("alert_minutes"), 2),
      blink_seconds: numOr(val("blink_seconds"), 10),
      overrun_minutes: numOr(val("overrun_minutes"), 1),
      use_phase_colors: checked("use_phase_colors"),
      use_blink: checked("use_blink"),
      color_normal: val("color_normal", "#e6edf3"),
      color_warn: val("color_warn", "#ffd166"),
      color_alert: val("color_alert", "#ff6b6b"),
      color_over: val("color_over", "#9ad0ff"),
      show_target_time: checked("show_target_time"),
      target_time_after: val("target_time_after", "secondary"),
      messages_position: val("messages_position", "below"),
      hms_threshold_minutes: numOr(val("hms_threshold_minutes"), 60),
      theme: {
        digits: { size_vw: numOr(val("digits_size_preset"), 14) },
        messages: {
          primary: {
            size_rem: numOr(val("theme_p_size"), 1.0),
            weight: numOr(val("theme_p_weight"), 600),
            color: val("theme_p_color", "#9aa4b2"),
          },
          secondary: {
            size_rem: numOr(val("theme_s_size"), 1.0),
            weight: numOr(val("theme_s_weight"), 400),
            color: val("theme_s_color", "#9aa4b2"),
          },
        },
      },
      clock: {
        with_seconds: checked("clk_with_seconds"),
        color: val("clk_color", "#e6edf3"),
        size_vmin: numOr(val("clk_size_vmin"), 12),
        position: val("clk_position", "center"),
        messages_position: val("clk_msg_position", "right"),
        messages_align: val("clk_msg_align", "center"),
        use_clock_messages: checked("clk_use_own_msgs"),
        message_primary: val("clk_msg_primary"),
        message_secondary: val("clk_msg_secondary"),
      },
    };
  }

  async function loadConfig() {
    try {
      const resp = await ui.get("/api/config");
      const cfg = resp.config;
      lastCfg = cfg;
      // overlays
      overlaysLocal = Array.isArray(cfg.overlays) ? [...cfg.overlays] : [];
      renderOverlaysUI();
      ui.toast("Konfig lastet", "ok");
    } catch (err) {
      ui.toast("Kunne ikke laste config: " + err.message, "bad");
    }
  }

  async function saveConfig() {
    try {
      const patch = buildPatch();
      await ui.post("/api/config", patch, {
        password: val("admin_password"),
      });
      ui.toast("Lagret", "ok");
      loadConfig();
    } catch (err) {
      ui.toast("Lagre feilet: " + err.message, "bad");
    }
  }

  async function startDuration(minutes) {
    try {
      await ui.post("/api/start-duration", { minutes }, { password: val("admin_password") });
      ui.toast("Startet +" + minutes + " min", "ok");
    } catch (err) {
      ui.toast("Start feilet: " + err.message, "bad");
    }
  }

  // --- events ---
  function wire() {
    el("btn-save")?.addEventListener("click", saveConfig);
    el("btn-load")?.addEventListener("click", loadConfig);
    el("start_now")?.addEventListener("click", () => {
      const m = Number(val("start_minutes"));
      if (!isFinite(m) || m <= 0) return ui.toast("Ugyldig varighet", "bad");
      startDuration(m);
    });
    document.querySelectorAll("button[data-qs]").forEach((b) =>
      b.addEventListener("click", () => startDuration(Number(b.dataset.qs))),
    );

    el("ov_add")?.addEventListener("click", addOverlay);
    el("ov_dup")?.addEventListener("click", dupOverlay);
    el("ov_del")?.addEventListener("click", delOverlay);
    el("ov_select")?.addEventListener("change", () => {
      const cur = currentOverlay();
      if (cur) fillOverlayFields(cur);
    });
    [
      "ov_id",
      "ov_type",
      "ov_url",
      "ov_pos",
      "ov_size",
      "ov_opacity",
      "ov_z",
      "ov_off_vw",
      "ov_off_vh",
      "ov_in_clock",
      "ov_in_countdown",
      "ov_tint_color",
      "ov_tint_opacity",
      "ov_tint_blend",
    ].forEach((id) => el(id)?.addEventListener("input", commitOverlay));

    document.addEventListener("input", pushPreview);
    document.addEventListener("change", pushPreview);
  }

  function init() {
    ui.activateNav("/admin");
    wire();
    loadConfig();
    console.info("[admin] initialized");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
