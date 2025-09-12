// Sikker bakgrunnsbytter: alltid reset før sett
const hex2rgb = (h)=>{
  const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((h||"").trim());
  return m ? `${parseInt(m[1],16)}, ${parseInt(m[2],16)}, ${parseInt(m[3],16)}` : "0,0,0";
};

export function setBackground(rootEl, bg) {
  // reset (hindrer “firkant”/lekk)
  rootEl.style.background = "";
  rootEl.style.backgroundSize = "";
  rootEl.style.backgroundPosition = "";
  rootEl.style.backgroundRepeat = "";

  const mode = String(bg?.mode || "solid");

  if (mode === "solid") {
    rootEl.style.background = bg.solid?.color || "#0b0f14";
    return;
  }
  if (mode === "gradient") {
    const g = bg.gradient || {};
    const a = Number(g.angle_deg ?? 180);
    rootEl.style.background = `linear-gradient(${a}deg, ${g.from || "#142033"}, ${g.to || "#0b0f14"})`;
    return;
  }
  if (mode === "image") {
    const im = bg.image || {};
    const tint = im.tint || {};
    const t = Number(tint.opacity ?? 0);
    const tl = t > 0 ? `linear-gradient(rgba(${hex2rgb(tint.color || "#000")}, ${t}), rgba(${hex2rgb(tint.color || "#000")}, ${t})), ` : "";
    const url = im.url ? `url("${im.url}")` : "none";
    // bevisst ikke bruke root opacity (ellers demper vi klokke/innhold)
    rootEl.style.background = `${tl}${url}`;
    rootEl.style.backgroundSize = im.fit || "cover";
    rootEl.style.backgroundPosition = "center";
    rootEl.style.backgroundRepeat = "no-repeat";
  }
}
