// path: static/js/v2/background.js
// Ansvar: bakgrunnsrendring (solid/gradient/image) uten root opacity-lekkasje.

export function resetBackground(el){
  el.style.background = "";
  el.style.backgroundSize = "";
  el.style.backgroundPosition = "";
  el.style.backgroundRepeat = "";
}

function hex2rgbStr(hex){
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((hex||"").trim());
  return m ? `${parseInt(m[1],16)}, ${parseInt(m[2],16)}, ${parseInt(m[3],16)}` : "0,0,0";
}

export function applyBackground(el, bg){
  // Bevisst reset – hindrer "firkant" og heng fra forrige modus.
  resetBackground(el);
  const mode = String(bg?.mode || "solid").toLowerCase();

  if (mode === "solid"){
    el.style.background = bg?.solid?.color || "#0b0f14";
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
    const op = Number(tint.opacity ?? 0);
    const tintLayer = op > 0
      ? `linear-gradient(rgba(${hex2rgbStr(tint.color || "#000")}, ${op}), rgba(${hex2rgbStr(tint.color || "#000")}, ${op})), `
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

export function pickScreenBackground(cfg){
  // Hvorfor: isolert beslutning – enklere å teste.
  const sc = cfg?.screen || {};
  const themeBg = cfg?.theme?.background || null;
  if (sc.use_theme_background && themeBg) return themeBg;
  return sc.background || { mode:"solid", solid:{ color:"#0b0f14" } };
}
