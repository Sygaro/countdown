// path: static/js/v2/countdown.js
// Orkestrering for visning (nedtelling + stopp-skjerm). ES module.

import { applyBackground } from "./background.js";
import { renderScreen } from "./screen.js";

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

function $(sel){ return document.querySelector(sel); }
function clamp(n, lo, hi){ return Math.min(hi, Math.max(lo, n)); }
function qsParam(key){ return new URLSearchParams(location.search).get(key); }
const isKiosk   = qsParam("kiosk")==="1";
const wantDebug = qsParam("debug")==="1";

const state = {
  cfg: null,
  tick: null,
  rev: 0,
  timers: { clockTimer: null, pollTimer: null },
  els: {},
};

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

function applyMessageStyles(cfg, el, model){
  const m = model || {};
  el.style.fontSize   = `${Number(m.size_rem ?? 1.0)}rem`;
  el.style.fontWeight = String(Number(m.weight ?? 400));
  el.style.color      = String(m.color ?? "#9aa4b2");
}

function renderCountdown(){
  const c = state.cfg, t = state.tick, els = state.els;

  // Skjul screen
  els.viewScreen.style.display = "none";

  // Bakgrunn på selve siden (theme)
  applyBackground(document.body, c?.theme?.background || {mode:"solid",solid:{color:"#0b0f14"}});

  // Meldingsstiler
  applyMessageStyles(c, els.msgPrimaryAbove,   c?.theme?.messages?.primary   || {});
  applyMessageStyles(c, els.msgPrimaryBelow,   c?.theme?.messages?.primary   || {});
  applyMessageStyles(c, els.msgSecondaryAbove, c?.theme?.messages?.secondary || {});
  applyMessageStyles(c, els.msgSecondaryBelow, c?.theme?.messages?.secondary || {});

  // Digitstørrelse
  const thresholdMs=(c.hms_threshold_minutes??60)*60*1000;
  const msActive=(t.state==="countdown"||t.state==="overrun");
  const ms = msActive ? t.signed_display_ms : 0;
  const useHMS = Math.abs(ms) >= thresholdMs;
  const base = Number(c?.theme?.digits?.size_vw ?? 14);
  els.digits.style.fontSize = `${(base*(useHMS?0.86:1)).toFixed(2)}vmin`;

  // Tekst/farge/blink
  els.viewCountdown.style.display = "flex";
  els.digits.textContent = useHMS ? fmtHMS(ms) : fmtMMSS(ms);

  let color = c.color_normal || "#e6edf3";
  if (c.use_phase_colors) {
    if (t.state === "overrun" || t.signed_display_ms < 0) color = c.color_over || c.color_alert || color;
    else if (t.mode === "alert") color = c.color_alert || color;
    else if (t.mode === "warn")  color = c.color_warn  || color;
  }
  els.digits.style.color = color;
  els.digits.classList.toggle("blink", !!(c.use_blink && t.blink));

  // Meldinger/target
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

function render(){
  const mode = state.cfg?.mode || "daily";
  if (mode === "screen") renderScreen(state.cfg, state.tick, state.els, state.timers);
  else renderCountdown();
}

async function fetchConfig(){
  const r = await fetch("/api/config", { cache:"no-store" });
  const js = await r.json();
  state.cfg = js.config;
  state.rev = js.config?._updated_at || 0;
  sendHeartbeat();
}

async function fetchTick(){
  const r = await fetch("/tick", { cache:"no-store" });
  state.tick = await r.json();
}

function sendHeartbeat(){
  const payload = JSON.stringify({ rev: state.rev, page: "view" });
  if (navigator.sendBeacon){
    const blob = new Blob([payload], {type:"application/json"});
    navigator.sendBeacon("/debug/view-heartbeat", blob);
  } else {
    fetch("/debug/view-heartbeat",{method:"POST",headers:{"Content-Type":"application/json"},body:payload}).catch(()=>{});
  }
}

function mountDebug(){
  if (!wantDebug) return;
  let dbg = $("#dbg");
  if (!dbg){
    dbg = document.createElement("div");
    dbg.id="dbg";
    Object.assign(dbg.style,{
      position:"fixed", left:"8px", bottom:"8px", zIndex:"10",
      font:"12px/1.3 system-ui, sans-serif",
      background:"rgba(0,0,0,.55)", color:"#e6edf3",
      padding:"6px 8px", borderRadius:"8px", border:"1px solid rgba(255,255,255,.1)"
    });
    document.body.appendChild(dbg);
  }
  const sc = state.cfg?.screen || {};
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
  // Finn elementer
  state.els = (() => {
    const s = { ...DEFAULT_SELECTORS, ...(options.selectors||{}) };
    const out = {};
    for (const [k, sel] of Object.entries(s)) {
      const el = document.querySelector(sel);
      if (!el) throw new Error(`Mangler nødvendig element for '${k}' (selector: ${sel})`);
      out[k] = el;
    }
    return out;
  })();

  // Fullskjerm-knapp
  bindFullscreen($(DEFAULT_SELECTORS.btnFullscreen));

  // Første last
  await fetchConfig();
  await fetchTick();
  render();
  sendHeartbeat();
  mountDebug();

  // Poll
  const pollMs = clamp(Number(options.pollMs || 1000), 250, 5000);
  if (state.timers.pollTimer) clearInterval(state.timers.pollTimer);
  state.timers.pollTimer = setInterval(async ()=>{
    await fetchTick();
    if ((state.tick?.cfg_rev||0) !== state.rev) { await fetchConfig(); }
    render();
    mountDebug();
  }, pollMs);
}

// Auto-init
if (document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", ()=>{ init().catch(console.error); });
} else {
  init().catch(console.error);
}
