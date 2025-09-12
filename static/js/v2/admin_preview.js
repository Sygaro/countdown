// path: static/js/v2/admin_preview.js
// Admin-forhåndsvisning som bruker samme renderer som visningen (screen.js).

import { renderScreen } from "/static/js/v2/screen.js";
import { apiGetConfig } from "/static/js/v2/api.js";


const $  = (s)=>document.querySelector(s);
const $$ = (s)=>Array.from(document.querySelectorAll(s));
const num = (v, d=0)=>{ const n=parseFloat(v); return Number.isFinite(n)?n:d; };

let themeBgCache = null;
async function getThemeBackground(){
  if (themeBgCache) return themeBgCache;
  try{
    const js = await apiGetConfig();
    themeBgCache = js?.config?.theme?.background || { mode:"solid", solid:{ color:"#0b0f14" } };
  }catch{
    themeBgCache = { mode:"solid", solid:{ color:"#0b0f14" } };
  }
  return themeBgCache;
}

function readScreenDraftSync(){
  const scUseTheme = $("#sc_use_theme_bg")?.checked ?? false;

  const bgModeRadio = $$("input[name=sc_bg_mode]:checked")[0];
  const bgMode = bgModeRadio ? bgModeRadio.value : "solid";

  const sc = {
    type: $$("input[name=screen_type]:checked")[0]?.value || "text",
    text: $("#screen_text")?.value || "Pause",
    text_color: $("#screen_text_color")?.value || "#ffffff",
    font_vh: num($("#screen_font_vh")?.value ?? 10, 10),

    image_url: $("#screen_image_url")?.value || "",
    image_fit: $("#screen_image_fit")?.value || "cover",
    image_opacity: num($("#screen_image_opacity")?.value ?? 100, 100),

    use_theme_background: scUseTheme,
    background: {
      mode: bgMode,
      solid:    { color: $("#sc_bg_solid_color")?.value || "#0b0f14" },
      gradient: { from: $("#sc_bg_grad_from")?.value || "#142033",
                  to:   $("#sc_bg_grad_to")?.value   || "#0b0f14",
                  angle_deg: num($("#sc_bg_grad_angle")?.value ?? 180, 180) },
      image:    { url: $("#sc_bg_img_url")?.value || "",
                  fit: $("#sc_bg_img_fit")?.value || "cover",
                  opacity: num($("#sc_bg_img_op")?.value ?? 1, 1),
                  tint: { color:  $("#sc_bg_img_tint")?.value || "#000000",
                          opacity: num($("#sc_bg_img_tint_op")?.value ?? 0, 0) } }
    },
    clock: {
      show: $("#sc_clock_show")?.checked ?? false,
      with_seconds: $("#sc_clock_secs")?.checked ?? false,
      color: $("#sc_clock_color")?.value || "#e6edf3",
      size_vh: num($("#sc_clock_size")?.value ?? 12, 12),
      position: $("#sc_clock_pos")?.value || "top-right",
    }
  };

  return sc;
}

async function buildCfgForPreview(){
  const sc = readScreenDraftSync();
  const themeBg = await getThemeBackground();
  return {
    mode: "screen",
    theme: { background: themeBg },
    screen: sc,
  };
}

/** Knytter preview-elementene i Admin til screen-renderer. */
export function initAdminPreview(opts={}){
  const pvRoot  = opts.pvRoot  || $("#pv_root");
  const pvInner = opts.pvInner || $("#pv_inner");
  const pvClock = opts.pvClock || $("#pv_clock");

  if (!pvRoot || !pvInner || !pvClock) {
    console.warn("admin_preview: mangler preview-elementer");
    return;
  }

  const els = {
    // Countdown-noder (ikke brukt i preview)
    viewCountdown: document.createElement("div"),
    digits: document.createElement("div"),
    msgsAbove: document.createElement("div"),
    msgPrimaryAbove: document.createElement("div"),
    msgSecondaryAbove: document.createElement("div"),
    msgsBelow: document.createElement("div"),
    msgPrimaryBelow: document.createElement("div"),
    msgSecondaryBelow: document.createElement("div"),
    // Screen-noder (preview)
    viewScreen: pvRoot,
    screenInner: pvInner,
    screenClock: pvClock,
  };
  const timers = { clockTimer: null };

  async function render(){
    const cfg = await buildCfgForPreview();
    // Disable “innhold=bilde” når bakgrunn=image for å speile visningens regel
    const activeBgMode = cfg.screen.use_theme_background ? (cfg?.theme?.background?.mode || "solid")
                                                         : (cfg?.screen?.background?.mode || "solid");
    const imgRadio = $("#screen_type_img");
    const hint     = $("#screen_image_hint");
    const disable  = (String(activeBgMode) === "image");
    if (imgRadio) imgRadio.disabled = disable;
    if (hint)     hint.style.display = disable ? "block" : "none";

    renderScreen(cfg, { mode:"screen", state:"screen" }, els, timers);
  }

  // Lytt på alle relevante kontroller
  const ids = [
    "sc_use_theme_bg","sc_bg_solid_color","sc_bg_grad_from","sc_bg_grad_to","sc_bg_grad_angle",
    "sc_bg_img_url","sc_bg_img_fit","sc_bg_img_op","sc_bg_img_tint","sc_bg_img_tint_op",
    "screen_text","screen_text_color","screen_font_vh",
    "screen_image_url","screen_image_fit","screen_image_opacity",
    "sc_clock_show","sc_clock_secs","sc_clock_color","sc_clock_size","sc_clock_pos"
  ];
  ids.forEach(id=>{
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener("input", render);
    el.addEventListener("change", render);
  });
  $$("input[name=sc_bg_mode]").forEach(el=>{ el.addEventListener("change", render); });
  $$("input[name=screen_type]").forEach(el=>{ el.addEventListener("change", render); });

  // Første render
  render().catch(console.error);
}

// Auto-init når admin-siden lastes
if (document.currentScript?.type === "module") {
  if (document.readyState === "loading"){
    document.addEventListener("DOMContentLoaded", ()=>initAdminPreview());
  } else {
    initAdminPreview();
  }
}
