// path: static/js/v2/admin_bind.js
// Binder v2-admin-siden (dagens admin.html) mot API. Ingen avhengighet til legacy admin.js.
import { apiGetConfig, apiPostConfig, apiGetDefaults, apiGetTick } from "/static/js/v2/api.js";

(function(){
  // --- helpers ---
  const $ = (s, r)=> (r||document).querySelector(s);
  const $$= (s, r)=> Array.from((r||document).querySelectorAll(s));
  const val = (id, d="") => { const e=$("#"+id); return e ? (e.value ?? d) : d; };
  const setVal = (id, v) => { const e=$("#"+id); if (e) e.value = v ?? ""; };
  const setChecked = (id, on) => { const e=$("#"+id); if (e) e.checked = !!on; };
  const num = (v, d=0) => { const n=Number(v); return Number.isFinite(n)?n:d; };
  const toast = (msg, tone="ok") => { try { console.info("[admin]", msg); } catch(_){} };

  const R = {  // id-aliasser for les/skriv
    // tider/modus
    daily_time: "daily_time",
    once_at: "once_at",
    start_minutes: "start_minutes",
    // meldinger
    show_message_primary: "show_message_primary",
    message_primary: "message_primary",
    show_message_secondary: "show_message_secondary",
    message_secondary: "message_secondary",
    // varsler
    warn_minutes: "warn_minutes",
    alert_minutes: "alert_minutes",
    blink_seconds: "blink_seconds",
    overrun_minutes: "overrun_minutes",
    // oppførsel
    use_phase_colors: "use_phase_colors",
    use_blink: "use_blink",
    color_normal: "color_normal",
    color_warn: "color_warn",
    color_alert: "color_alert",
    color_over: "color_over",
    show_target_time: "show_target_time",
    target_time_after: "target_time_after",
    messages_position: "messages_position",
    hms_threshold_minutes: "hms_threshold_minutes",
    // theme bg
    bg_mode: 'bg_mode', // radio name="bg_mode" (Ens/Grad/Bilde preset)
    bg_solid_color: "bg_solid_color",
    bg_grad_from: "bg_grad_from",
    bg_grad_to: "bg_grad_to",
    bg_grad_angle: "bg_grad_angle",
    bg_img_url: "bg_img_url",
    bg_img_fit: "bg_img_fit",
    bg_img_op: "bg_img_op",
    bg_img_tint: "bg_img_tint",
    bg_img_tint_op: "bg_img_tint_op",
    // screen
    sc_use_theme_bg: "sc_use_theme_bg",
    sc_bg_mode: "sc_bg_mode", // radio name="sc_bg_mode"
    sc_bg_solid_color: "sc_bg_solid_color",
    sc_bg_grad_from: "sc_bg_grad_from",
    sc_bg_grad_to: "sc_bg_grad_to",
    sc_bg_grad_angle: "sc_bg_grad_angle",
    sc_bg_img_url: "sc_bg_img_url",
    sc_bg_img_fit: "sc_bg_img_fit",
    sc_bg_img_op: "sc_bg_img_op",
    sc_bg_img_tint: "sc_bg_img_tint",
    sc_bg_img_tint_op: "sc_bg_img_tint_op",
    // screen innhold
    screen_type: "screen_type", // radio name="screen_type"
    screen_text: "screen_text",
    screen_text_color: "screen_text_color",
    screen_font_vh: "screen_font_vh",
    screen_image_url: "screen_image_url",
    screen_image_fit: "screen_image_fit",
    screen_image_opacity: "screen_image_opacity",
    // clock
    sc_clock_show: "sc_clock_show",
    sc_clock_secs: "sc_clock_secs",
    sc_clock_color: "sc_clock_color",
    sc_clock_size: "sc_clock_size",
    sc_clock_pos: "sc_clock_pos",
  };

  function readThemeBackground(){
    const modeEl = $('input[name="bg_mode"]:checked');
    const mode = modeEl ? modeEl.value : "solid";
    return {
      mode,
      solid:    { color: val(R.bg_solid_color, "#0b0f14") },
      gradient: { from: val(R.bg_grad_from, "#142033"),
                  to:   val(R.bg_grad_to,   "#0b0f14"),
                  angle_deg: num(val(R.bg_grad_angle, "180"), 180) },
      image:    { url: val(R.bg_img_url, ""),
                  fit: val(R.bg_img_fit, "cover"),
                  opacity: num(val(R.bg_img_op, "1"), 1),
                  tint: { color: val(R.bg_img_tint, "#000000"),
                          opacity: num(val(R.bg_img_tint_op, "0"), 0) } }
    };
  }

  function readScreenBackground(){
    const modeEl = $('input[name="sc_bg_mode"]:checked');
    const mode = modeEl ? modeEl.value : "solid";
    return {
      mode,
      solid:    { color: val(R.sc_bg_solid_color, "#0b0f14") },
      gradient: { from: val(R.sc_bg_grad_from, "#142033"),
                  to:   val(R.sc_bg_grad_to,   "#0b0f14"),
                  angle_deg: num(val(R.sc_bg_grad_angle, "180"), 180) },
      image:    { url: val(R.sc_bg_img_url, ""),
                  fit: val(R.sc_bg_img_fit, "cover"),
                  opacity: num(val(R.sc_bg_img_op, "1"), 1),
                  tint: { color: val(R.sc_bg_img_tint, "#000000"),
                          opacity: num(val(R.sc_bg_img_tint_op, "0"), 0) } }
    };
  }

  function readScreen(){
    const typeEl = $('input[name="screen_type"]:checked');
    const type = typeEl ? typeEl.value : "text";
    return {
      type, // text|image|blackout
      text: val(R.screen_text, "Pause"),
      text_color: val(R.screen_text_color, "#ffffff"),
      font_vh: num(val(R.screen_font_vh, "10"), 10),
      image_url: val(R.screen_image_url, ""),
      image_fit: val(R.screen_image_fit, "cover"),
      image_opacity: num(val(R.screen_image_opacity, "100"), 100),
      use_theme_background: !!$("#"+R.sc_use_theme_bg)?.checked,
      // viktig: eksplisitt bakgrunnsvalg
      background_set_explicitly: true,
      background: readScreenBackground(),
      clock: {
        show: !!$("#"+R.sc_clock_show)?.checked,
        with_seconds: !!$("#"+R.sc_clock_secs)?.checked,
        color: val(R.sc_clock_color, "#e6edf3"),
        size_vh: num(val(R.sc_clock_size, "12"), 12),
        position: val(R.sc_clock_pos, "top-right"),
      }
    };
  }

  function collectPatch(){
    return {
      // tider/modus sendes bare som felt ved patch (modusbytte har eget endepunkt hvis du bruker knapper)
      daily_time: val(R.daily_time, ""),
      once_at: val(R.once_at, ""),
      duration_minutes: num(val(R.start_minutes, "0"), 0) || undefined,

      // meldinger/varsler/oppførsel
      show_message_primary: !!$("#"+R.show_message_primary)?.checked,
      message_primary: val(R.message_primary, ""),
      show_message_secondary: !!$("#"+R.show_message_secondary)?.checked,
      message_secondary: val(R.message_secondary, ""),
      warn_minutes: num(val(R.warn_minutes, "4"), 4),
      alert_minutes: num(val(R.alert_minutes, "2"), 2),
      blink_seconds: num(val(R.blink_seconds, "10"), 10),
      overrun_minutes: num(val(R.overrun_minutes, "2"), 2),
      use_phase_colors: !!$("#"+R.use_phase_colors)?.checked,
      use_blink: !!$("#"+R.use_blink)?.checked,
      color_normal: val(R.color_normal, "#e6edf3"),
      color_warn:   val(R.color_warn,   "#ffd166"),
      color_alert:  val(R.color_alert,  "#ff8787"),
      color_over:   val(R.color_over,   "#ff6b6b"),
      show_target_time: !!$("#"+R.show_target_time)?.checked,
      target_time_after: val(R.target_time_after, "secondary"),
      messages_position: val(R.messages_position, "below"),
      hms_threshold_minutes: num(val(R.hms_threshold_minutes, "60"), 60),

      // theme background
      theme: { background: readThemeBackground() },

      // stopp-skjerm
      screen: readScreen(),
    };
  }

  function applyThemeBackgroundForm(bg){
    // preset radio
    const mode = String(bg?.mode||"solid");
    const radio = $(`input[name="bg_mode"][value="${mode}"]`);
    if (radio) radio.checked = true;

    setVal(R.bg_solid_color, bg?.solid?.color || "#0b0f14");
    setVal(R.bg_grad_from, bg?.gradient?.from || "#142033");
    setVal(R.bg_grad_to, bg?.gradient?.to || "#0b0f14");
    setVal(R.bg_grad_angle, String(bg?.gradient?.angle_deg ?? 180));
    setVal(R.bg_img_url, bg?.image?.url || "");
    setVal(R.bg_img_fit, bg?.image?.fit || "cover");
    setVal(R.bg_img_op, String(bg?.image?.opacity ?? 1));
    setVal(R.bg_img_tint, bg?.image?.tint?.color || "#000000");
    setVal(R.bg_img_tint_op, String(bg?.image?.tint?.opacity ?? 0));
  }

  function applyScreenForm(sc){
    const type = String(sc?.type || "text");
    const r = $(`input[name="screen_type"][value="${type}"]`); if (r) r.checked = true;

    setVal(R.screen_text, sc?.text || "Pause");
    setVal(R.screen_text_color, sc?.text_color || "#ffffff");
    setVal(R.screen_font_vh, String(sc?.font_vh ?? 10));
    setVal(R.screen_image_url, sc?.image_url || "");
    setVal(R.screen_image_fit, sc?.image_fit || "cover");
    setVal(R.screen_image_opacity, String(sc?.image_opacity ?? 100));

    setChecked(R.sc_use_theme_bg, !!sc?.use_theme_background);
    const bg = sc?.background || { mode:"solid", solid:{ color:"#0b0f14" } };
    // screen background radio
    const radio = $(`input[name="sc_bg_mode"][value="${String(bg.mode||'solid')}"]`);
    if (radio) radio.checked = true;
    setVal(R.sc_bg_solid_color, bg?.solid?.color || "#0b0f14");
    setVal(R.sc_bg_grad_from, bg?.gradient?.from || "#142033");
    setVal(R.sc_bg_grad_to, bg?.gradient?.to || "#0b0f14");
    setVal(R.sc_bg_grad_angle, String(bg?.gradient?.angle_deg ?? 180));
    setVal(R.sc_bg_img_url, bg?.image?.url || "");
    setVal(R.sc_bg_img_fit, bg?.image?.fit || "cover");
    setVal(R.sc_bg_img_op, String(bg?.image?.opacity ?? 1));
    setVal(R.sc_bg_img_tint, bg?.image?.tint?.color || "#000000");
    setVal(R.sc_bg_img_tint_op, String(bg?.image?.tint?.opacity ?? 0));

    setChecked(R.sc_clock_show, !!sc?.clock?.show);
    setChecked(R.sc_clock_secs, !!sc?.clock?.with_seconds);
    setVal(R.sc_clock_color, sc?.clock?.color || "#e6edf3");
    setVal(R.sc_clock_size, String(sc?.clock?.size_vh ?? 12));
    setVal(R.sc_clock_pos, String(sc?.clock?.position || "top-right"));
  }

  function applyConfig(cfg){
    // tider/modus
    setVal(R.daily_time, String(cfg?.daily_time || ""));
    setVal(R.once_at,    String(cfg?.once_at    || ""));
    setVal(R.start_minutes, String(cfg?.duration_minutes ?? ""));

    // meldinger/varsler/oppførsel
    setChecked(R.show_message_primary,   !!cfg?.show_message_primary);
    setVal(R.message_primary, String(cfg?.message_primary||""));
    setChecked(R.show_message_secondary, !!cfg?.show_message_secondary);
    setVal(R.message_secondary, String(cfg?.message_secondary||""));

    setVal(R.warn_minutes, String(cfg?.warn_minutes ?? 4));
    setVal(R.alert_minutes, String(cfg?.alert_minutes ?? 2));
    setVal(R.blink_seconds, String(cfg?.blink_seconds ?? 10));
    setVal(R.overrun_minutes, String(cfg?.overrun_minutes ?? 2));

    setChecked(R.use_phase_colors, !!cfg?.use_phase_colors);
    setChecked(R.use_blink,        !!cfg?.use_blink);
    setVal(R.color_normal, String(cfg?.color_normal || "#e6edf3"));
    setVal(R.color_warn,   String(cfg?.color_warn   || "#ffd166"));
    setVal(R.color_alert,  String(cfg?.color_alert  || "#ff8787"));
    setVal(R.color_over,   String(cfg?.color_over   || "#ff6b6b"));

    setChecked(R.show_target_time, !!cfg?.show_target_time);
    setVal(R.target_time_after, String(cfg?.target_time_after || "secondary"));
    setVal(R.messages_position, String(cfg?.messages_position || "below"));
    setVal(R.hms_threshold_minutes, String(cfg?.hms_threshold_minutes ?? 60));

    // theme
    applyThemeBackgroundForm(cfg?.theme?.background || { mode:"solid", solid:{ color:"#0b0f14" } });

    // screen
    applyScreenForm(cfg?.screen || {});
  }

  async function loadAll(){
    const js = await apiGetConfig();
    const cfg = js?.config || js;
    applyConfig(cfg);
    toast("Konfig lastet", "ok");
  }

  async function saveAll(){
    const patch = collectPatch();
    const js = await apiPostConfig(patch);
    const cfg = js?.config || js;
    applyConfig(cfg);
    toast("Lagret", "ok");
  }

  async function startNow(){
    const m = num(val(R.start_minutes, "0"), 0);
    if (!m) { toast("Ugyldig varighet", "bad"); return; }
    await fetch("/api/start-duration", { method:"POST", headers:{ "Content-Type":"application/json" }, body: JSON.stringify({ minutes: Math.floor(m) }) });
    toast("Startet +" + Math.floor(m) + " min", "ok");
  }

  async function stopNow(){
    await fetch("/api/stop", { method:"POST" });
    toast("Stoppet (daglig)", "ok");
  }

  function wire(){
    $("#btn_save")?.addEventListener("click", (e)=>{ e.preventDefault(); saveAll().catch(e=>toast(String(e.message||e),"bad")); });
    $("#btn_refresh")?.addEventListener("click", (e)=>{ e.preventDefault(); loadAll().catch(e=>toast(String(e.message||e),"bad")); });
    $("#btn_start")?.addEventListener("click", (e)=>{ e.preventDefault(); startNow().catch(e=>toast(String(e.message||e),"bad")); });
    $("#btn_stop")?.addEventListener("click", (e)=>{ e.preventDefault(); stopNow().catch(e=>toast(String(e.message||e),"bad")); });
  }

  async function init(){
    wire();
    await loadAll();
    console.info("[admin_bind] ready");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", ()=>{ init().catch(console.error); }, { once:true });
  } else {
    init().catch(console.error);
  }
})();
