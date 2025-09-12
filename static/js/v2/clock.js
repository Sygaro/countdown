// path: static/js/v2/clock.js
// Ansvar: klokkevisning (posisjon + tidsoppdatering)

export function resetClockPosition(el){
  el.style.top = el.style.right = el.style.bottom = el.style.left = "auto";
  el.style.transform = "none";
}

export function setClockPosition(el, pos){
  resetClockPosition(el);
  switch (String(pos || "top-right")) {
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

export function startClock(el, withSeconds, timers){
  // Hvorfor: én timer av gangen – unngå duplisert oppdatering.
  stopClock(timers);
  const update = ()=>{
    const d = new Date();
    const HH = String(d.getHours()).padStart(2,"0");
    const MM = String(d.getMinutes()).padStart(2,"0");
    const SS = String(d.getSeconds()).padStart(2,"0");
    el.textContent = withSeconds ? `${HH}:${MM}:${SS}` : `${HH}:${MM}`;
  };
  update();
  timers.clockTimer = setInterval(update, withSeconds ? 1000 : 5000);
}

export function stopClock(timers){
  if (timers?.clockTimer) { clearInterval(timers.clockTimer); timers.clockTimer = null; }
}
