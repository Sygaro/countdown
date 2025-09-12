import { setBackground } from "./background.js";
import { positionClock, mountClock } from "./clock.js";

// Pure render av stopp-skjerm
export function renderScreen(cfg, els, timers) {
  const sc = cfg.screen || {};
  els.countdown.style.display = "none";
  els.screen.style.display = "flex";
  els.screen.style.alignItems = "center";
  els.screen.style.justifyContent = "center";

  // Rydd
  els.inner.innerHTML = "";

  // Bakgrunn
  if (sc.type === "blackout") {
    els.screen.style.background = "#000";
    els.screen.style.backgroundSize = els.screen.style.backgroundPosition = els.screen.style.backgroundRepeat = "";
  } else {
    const bg = sc.use_theme_background ? (cfg?.theme?.background) : (sc.background || { mode:"solid", solid:{ color:"#0b0f14"}});
    setBackground(els.screen, bg);
  }

  // Klokke
  els.clock.style.display = sc.clock?.show ? "block" : "none";
  if (timers.clock) { timers.clock(); timers.clock=null; } // dispose
  if (sc.clock?.show) {
    els.screen.appendChild(els.clock);
    positionClock(els.clock, sc.clock.position);
    els.clock.style.color = sc.clock.color || "#e6edf3";
    els.clock.style.fontSize = `${Math.max(6, Math.min(30, Number(sc.clock.size_vh || 12)))}vh`;
    timers.clock = mountClock(els.clock, !!sc.clock.with_seconds);
  }

  // Innhold (unngå dobbelt-bilde)
  if (sc.type === "image") {
    const activeBg = sc.use_theme_background ? (cfg?.theme?.background) : sc.background;
    const activeMode = String(activeBg?.mode || "solid");
    if (activeMode !== "image") {
      const wrap=document.createElement("div");
      wrap.style.position="relative"; wrap.style.maxWidth="90vw"; wrap.style.maxHeight="80vh";
      const img=document.createElement("img");
      img.src=sc.image_url||""; img.style.objectFit=sc.image_fit||"cover";
      img.style.width="100%"; img.style.height="100%";
      img.style.opacity=String((sc.image_opacity??100)/100);
      wrap.appendChild(img); els.inner.appendChild(wrap);
    }
  } else if (sc.type === "text") {
    const div=document.createElement("div");
    div.textContent=sc.text||"Pause";
    div.style.color=sc.text_color||"#fff";
    div.style.fontSize=`${Math.max(4, Math.min(30, Number(sc.font_vh??10)))}vh`;
    div.style.fontWeight="800";
    els.inner.appendChild(div);
  }
}
