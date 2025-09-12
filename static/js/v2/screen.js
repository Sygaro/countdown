// path: static/js/v2/screen.js
// Ansvar: stopp-skjerm (bakgrunn, innhold, klokke)

import { applyBackground, pickScreenBackground, resetBackground } from "./background.js";
import { setClockPosition, startClock, stopClock } from "./clock.js";

function clamp(n, lo, hi){ return Math.min(hi, Math.max(lo, n)); }

export function renderScreen(cfg, tick, els, timers){
  const sc = cfg?.screen || {};

  // Skjul countdown
  els.viewCountdown.style.display = "none";

  // Klargjør screen
  els.viewScreen.style.display = "flex";
  els.viewScreen.style.alignItems = "center";
  els.viewScreen.style.justifyContent = "center";

  // Rydd innhold
  els.screenInner.innerHTML = "";

  // Blackout: helsvart, eksplisitt reset for å unngå artefakter.
  if (sc.type === "blackout"){
    resetBackground(els.viewScreen);
    els.viewScreen.style.background = "#000";
  } else {
    const bg = pickScreenBackground(cfg);
    applyBackground(els.viewScreen, bg);
  }

  // Klokke
  const clk = sc.clock || {};
  if (clk.show){
    els.screenClock.style.display = "block";
    setClockPosition(els.screenClock, clk.position);
    els.screenClock.style.color = clk.color || "#e6edf3";
    els.screenClock.style.fontSize = `${clamp(Number(clk.size_vh||12),6,30)}vh`;
    startClock(els.screenClock, !!clk.with_seconds, timers);
  } else {
    els.screenClock.style.display = "none";
    stopClock(timers);
  }

  // Innhold – unngå dobbelt-bilde når bakgrunn allerede er image
  if (sc.type === "image"){
    const activeBg = pickScreenBackground(cfg);
    if (String(activeBg?.mode || "solid") !== "image"){
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
