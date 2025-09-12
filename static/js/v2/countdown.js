// path: static/js/v2/countdown.js
// Type: ES module
//
// Hva og hvorfor:
// - Samler visningslogikk i ett modulært sted for å unngå kollisjon med legacy inline-skript.
// - Nullstiller CSS-egenskaper før ny posisjon/bakgrunn for å unngå "speiling", "liten firkant" og heng.
// - Unngår dobbelt-bilde: tegner ikke innhold=bilde hvis bakgrunnen allerede er image.
// - Ingen root opacity ved bilde-bakgrunn; tint legges som lag i background.
//
// Offentlig API:
//   import { init } from "/static/js/v2/countdown.js";
//   init(); // auto-bind mot standard-IDer
//
// Opsjonelt:
//   init({ selectors: { /* override av IDer */ }, pollMs: 1000 });

const DEFAULT_SELECTORS = {
  btnFullscreen:  "#btn_fullscreen",
  viewCountdown:  "#view_countdown",
  digits:         "#digits",
  msgsAbove:      "#msgs_above",
  msgPrimaryAbove:"#msg_primary_above",
  msgSecondaryAbove:"#msg_secondary_above",
  msgsBelow:      "#msgs_below",
  msgPrimaryBelow:"#msg_primary_below",
  msgSecondaryBelow:"#msg_secondary_below",

  viewScreen:     "#view_screen",
  screenInner:    "#screen_inner",
  screenClock:    "#screen_clock",
};

function qsParam(key){ return new URLSearchParams(location.search).get(key); }
const isKiosk   = qsParam("kiosk")==="1";
const wantDebug = qsParam("debug")==="1";

const state = {
  cfg: null,
  tick: null,
  rev: 0,
  clockTimer: null,
  pollTimer: null,
  els: {},
};

function $(sel){ return document.querySelector(sel); }
function clamp(n, lo, hi){ return Math.min(hi, Math.max(lo, n)); }
function hex2rgbStr(hex){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex||"").trim());
  if(!m) return "0,0,0";
  return `${parseInt(m[1],16)}, ${parseInt(m[2],16)}, ${parseInt(m[3],16)}`;
}
function fmtMMSS(ms){
  const neg = ms<0?"-":"";
  ms=Math.abs(ms);
  const t=Math.floor(ms/1000), m=Math.floor(t/60), s=t%60;
  return `${neg}${m}:${String(s).padStart(2,"0")}`;
}
function fmtHMS(ms){
  const neg = ms<0?"-":"";
  ms=Math.abs(ms);
  const t=Math.floor(ms/1000), h=Math.floor(t/3600), r=t%3600, m=Math.floor(r/60), s=r%60;
  const pad=n=>String(n).padStart(2,"0");
  return `${neg}${h}:${pad(m)}:${pad(s)}`;
}

/** Hvorfor: unngå heng/artefakter ved bakgrunnsbytte. */
function resetBackground(el){
  el.style.background = "";
  el.style.backgroundSize = "";
  el.style.backgroundPosition = "";
  el.style.backgroundRepeat = "";
  // Ikke rør opacity; innholdet (klokke/tekst) skal ikke dempes av bakgrunn.
}

function applyThemeBackground(el, bg){
  resetBackground(el);
  const mode = String(bg?.mode || "solid");

  if (mode === "solid"){
    el.style.background = bg.solid?.color || "#0b0f14";
    return;
  }
  if (mode === "gradient"){
    const g = bg.gradient || {};
    const angle = Number(g.angle_deg ?? 180);
    el.style.background = `linear-gradient(${angle}deg, ${g.from || "#142033"}, ${g.to || "#0b0f14"})`;
    return;
  }
  if (mode === "image"){
    const im = bg.image || {};
    const tint = im.tint || {};
    const tintOp = Number(tint.opacity ?? 0);
    const hasTint = tintOp > 0;
    const tintLayer = hasTint
      ? `linear-gradient(rgba(${hex2rgbStr(tint.color || "#000")}, ${tintOp}), rgba(${hex2rgbStr(tint.color || "#000")}, ${tintOp})), `
      : "";
    const url = im.url ? `url("${im.url}")` : "none";
    el.style.background = `${tintLayer}${url}`;
    el.style.backgroundSize = im.fit || "cover";
    el.style.backgroundPosition = "center";
    el.style.backgroundRepeat = "no-repeat";
    return;
  }

  // Fallback
  el.style.background = "#0b0f14";
}

function setClockPosition(el, pos){
  // Hvorfor: sikre deterministisk posisjonering mellom skifter.
  el.style.top = el.style.right = el.style.bottom = el.style.left = "auto";
  el.style.transform = "none";

  switch(String(pos||"top-right")){
    case "top-left":     el.style.top="3vh";    el.style.left="4vw"; break;
    case "top-right":    el.style.top="3vh";    el.style.right="4vw"; break;
    case "bottom-left":  el.style.bottom="3vh"; el.style.left="4vw"; break;
    case "bottom-right": el.style.bottom="3vh"; el.style.right="4vw"; break;
    case "top":          el.style.top="3vh";    el.style.left="50%"; el.style.transform="translateX(-50%)"; break;
    case "bottom":       el.style.bottom="3vh"; el.style.left="50%"; el.style.transform="translateX(-50%)"; break;
    case "center":       el.style.top="50%";    el.style.left="50%"; el.style.transform="translate(-50%,-50%)"; break;
    default:             el.style.top="3vh";    el.style.right="4vw";
  }
}

function applyMessageStyles(cfg, sel, model){
  const el = state.els[sel];
  if(!el) return;
  const sz = Number(model.size_rem ?? 1.0);
  el.style.fontSize = `${sz}rem`;
  el.style.fontWeight = String(Number(model.weight ?? 400));
  el.style.color = model.color || "#9aa4b2";
}

function renderCountdown(){
  const c = state.cfg, t = state.tick;
  const els = state.els;

  // Lukk screen
  els.viewScreen.style.display = "none";
  if (state.clockTimer){ clearInterval(state.clockTimer); state.clockTimer=null; }
  els.screenClock.style.display = "none";

  // Bakgrunn for nedtellingsvisningen bruker theme
  applyThemeBackground(document.body, c?.theme?.background);

  // Meldingsstil
  applyMessageStyles(c, "msgPrimaryAbove",   c?.theme?.messages?.primary   || {});
  applyMessageStyles(c, "msgPrimaryBelow",   c?.theme?.messages?.primary   || {});
  applyMessageStyles(c, "msgSecondaryAbove", c?.theme?.messages?.secondary || {});
  applyMessageStyles(c, "msgSecondaryBelow", c?.theme?.messages?.secondary || {});

  // Digitstørrelse; litt mindre ved H:MM:SS
  const thresholdMs=(c.hms_threshold_minutes??60)*60*1000;
  const msActive=(t.state==="countdown"||t.state==="overrun");
  const ms = msActive ? t.signed_display_ms : 0;
  const useHMS = Math.abs(ms) >= thresholdMs;
  const base = Number(c?.theme?.digits?.size_vw ?? 14);
  els.digits.style.fontSize = `${(base*(useHMS?0.86:1)).toFixed(2)}vmin`;

  // Tekst
  els.viewCountdown.style.display = "flex";
  els.digits.textContent = useHMS ? fmtHMS(ms) : fmtMMSS(ms);

  // Farge & blink
  let color = c.color_normal || "#e6edf3";
  if (c.use_phase_colors) {
    if (t.state === "overrun" || t.signed_display_ms < 0) color = c.color_over || c.color_alert || color;
    else if (t.mode === "alert") color = c.color_alert || color;
    else if (t.mode === "warn")  color = c.color_warn  || color;
  }
  els.digits.style.color = color;
  els.digits.classList.toggle("blink", !!(c.use_blink && t.blink));

  // Meldinger & målklokkeslett
  const targetText = (c.show_target_time && t.target_hhmm) ? ` ${t.target_hhmm}` : "";
  const prim = (c.show_message_primary ? (c.message_primary||"") : "") + ((c.target_time_after==="primary") ? targetText : "");
  const sec  = (c.show_message_secondary ? (c.message_secondary||"") : "") + ((c.target_time_after==="secondary") ? targetText : "");

  const above = c.messages_position === "above";
  els.msgsAbove.style.display = above ? "block" : "none";
  els.msgsBelow.style.display = above ? "none"  : "block";

  els.msgPrimaryAbove.textContent   = above ? prim : "";
  els.msgSecondaryAbove.textContent = above ? sec  : "";
  els.msgPrimaryBelow.textContent   = !above ? prim : "";
  els.msgSecondaryBelow.textContent = !above ? sec  : "";
}

function renderScreen(){
  const cfg = state.cfg;
  const sc = cfg?.screen || {};
  const els = state.els;

  // Skjul countdown
  els.viewCountdown.style.display = "none";

  // Klargjør screen
  els.viewScreen.style.display = "flex";
  els.viewScreen.style.alignItems = "center";
  els.viewScreen.style.justifyContent = "center";

  // Rydd innhold først
  els.screenInner.innerHTML = "";

  // Blackout først: helsvart uten artefakter
  if (sc.type === "blackout"){
    resetBackground(els.viewScreen);
    els.viewScreen.style.background = "#000";
  } else {
    // Velg bakgrunn (theme eller egen)
    const activeBg = sc.use_theme_background ? (cfg?.theme?.background) : (sc.background || {mode:"solid",solid:{color:"#0b0f14"}});
    applyThemeBackground(els.viewScreen, activeBg);
  }

  // Klokke
  const clk = sc.clock || {};
  if (clk.show) {
    els.screenClock.style.display = "block";
    setClockPosition(els.screenClock, clk.position);
    els.screenClock.style.color = clk.color || "#e6edf3";
    els.screenClock.style.fontSize = `${clamp(Number(clk.size_vh||12),6,30)}vh`;

    if (state.clockTimer) { clearInterval(state.clockTimer); state.clockTimer = null; }
    const updateClock = () => {
      const d = new Date();
      const HH = String(d.getHours()).padStart(2,"0");
      const MM = String(d.getMinutes()).padStart(2,"0");
      const SS = String(d.getSeconds()).padStart(2,"0");
      els.screenClock.textContent = clk.with_seconds ? `${HH}:${MM}:${SS}` : `${HH}:${MM}`;
    };
    updateClock();
    state.clockTimer = setInterval(updateClock, clk.with_seconds ? 1000 : 5000);
  } else {
    els.screenClock.style.display = "none";
    if (state.clockTimer) { clearInterval(state.clockTimer); state.clockTimer = null; }
  }

  // Innhold (unngå dobbelt-bilde)
  if (sc.type === "image"){
    const activeBg = sc.use_theme_background ? (cfg?.theme?.background) : sc.background;
    const activeBgMode = String(activeBg?.mode || "solid");
    if (activeBgMode !== "image"){
      const wrap = document.createElement("div");
      wrap.style.position = "relative";
      wrap.style.maxWidth = "90vw";
      wrap.style.maxHeight = "80vh";

      const img = document.createElement("img");
      img.src = sc.image_url || "";
      img.style.objectFit = sc.image_fit || "cover";
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.opacity = String((sc.image_opacity ?? 100)/100);

      wrap.appendChild(img);
      els.screenInner.appendChild(wrap);
    }
  } else if (sc.type === "text"){
    const div = document.createElement("div");
    div.className = "text";
    div.textContent = sc.text || "Pause";
    div.style.color = sc.text_color || "#fff";
    div.style.fontSize = `${clamp(Number(sc.font_vh ?? 10), 4, 30)}vh`;
    els.screenInner.appendChild(div);
  }
}

function render(){
  const mode = state.cfg?.mode || "daily";
  if (mode === "screen") renderScreen();
  else renderCountdown();
}

async function fetchConfig(){
  const r = await fetch("/api/config", { cache: "no-store" });
  const js = await r.json();
  state.cfg = js.config;
  state.rev = js.config?._updated_at || 0;
  sendHeartbeat();
}

async function fetchTick(){
  const r = await fetch("/tick", { cache: "no-store" });
  state.tick = await r.json();
}

function sendHeartbeat(){
  const payload = JSON.stringify({ rev: state.rev, page: "view" });
  if (navigator.sendBeacon){
    const blob = new Blob([payload], { type: "application/json" });
    navigator.sendBeacon("/debug/view-heartbeat", blob);
  } else {
    fetch("/debug/view-heartbeat", { method: "POST", headers:{ "Content-Type":"application/json" }, body: payload }).catch(()=>{});
  }
}

/** Hvorfor: fjerne avhengighet til hardkodede IDs ved behov. */
function resolveSelectors(userSelectors){
  const s = { ...DEFAULT_SELECTORS, ...(userSelectors||{}) };
  const els = {};
  for (const [k, sel] of Object.entries(s)) {
    const el = document.querySelector(sel);
    if (!el) throw new Error(`Mangler nødvendig element for '${k}' (selector: ${sel})`);
    els[k] = el;
  }
  return els;
}

function mountDebug(){
  if (!wantDebug) return;
  let dbg = document.getElementById("dbg");
  if (!dbg){
    dbg = document.createElement("div");
    dbg.id = "dbg";
    dbg.style.position="fixed";
    dbg.style.left="8px"; dbg.style.bottom="8px";
    dbg.style.font="12px/1.3 system-ui, sans-serif";
    dbg.style.background="rgba(0,0,0,.55)";
    dbg.style.color="#e6edf3";
    dbg.style.padding="6px 8px";
    dbg.style.borderRadius="8px";
    dbg.style.border="1px solid rgba(255,255,255,.1)";
    dbg.style.zIndex="10";
    document.body.appendChild(dbg);
  }
  const sc = state.cfg?.screen||{};
  const bg = sc.use_theme_background ? (state.cfg?.theme?.background) : (sc.background || {mode:"—"});
  dbg.innerHTML =
    `<div>mode=<code>${state.cfg?.mode}</code> · phase=<code>${state.tick?.mode}/${state.tick?.state}</code></div>`+
    `<div>screen.type=<code>${sc.type}</code> use_theme_bg=<code>${!!sc.use_theme_background}</code> bg.mode=<code>${bg?.mode}</code></div>`+
    `<div>clock: pos=<code>${sc.clock?.position}</code> secs=<code>${!!sc.clock?.with_seconds}</code> size_vh=<code>${sc.clock?.size_vh}</code></div>`;
}

function bindFullscreen(btn){
  if (!btn) return;
  const inFs = ()=> !!(document.fullscreenElement || document.webkitFullscreenElement || document.msFullscreenElement);
  const update = ()=> { btn.style.display = (isKiosk || inFs()) ? "none" : "inline-block"; btn.style.opacity="1"; };
  ["fullscreenchange","webkitfullscreenchange","MSFullscreenChange"].forEach(ev=>document.addEventListener(ev, update));
  btn.addEventListener("click", async () => {
    try{
      if (!document.fullscreenElement) { await document.documentElement.requestFullscreen(); }
      else { await document.exitFullscreen(); }
    }catch(_){}
  });
  update();
}

export async function init(options={}){
  state.els = resolveSelectors(options.selectors);

  // Fullskjerm-knapp (valgfri)
  bindFullscreen(document.querySelector(DEFAULT_SELECTORS.btnFullscreen));

  await fetchConfig();
  await fetchTick();
  render();
  sendHeartbeat();
  mountDebug();

  // Polling
  const pollMs = clamp(Number(options.pollMs || 1000), 250, 5000);
  if (state.pollTimer) clearInterval(state.pollTimer);
  state.pollTimer = setInterval(async ()=>{
    await fetchTick();
    // Oppdater cfg hvis rev endret
    if ((state.tick?.cfg_rev||0) !== state.rev) { await fetchConfig(); }
    render();
    mountDebug();
  }, pollMs);
}

// Auto-init når siden har standard DOM-struktur
if (document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", ()=>{ try { init(); } catch(e){ console.error(e); }});
} else {
  try { init(); } catch(e){ console.error(e); }
}
