// Klokka må forankres riktig og resettes hver gang
export function positionClock(el, pos) {
  el.style.top = el.style.right = el.style.bottom = el.style.left = "auto";
  el.style.transform = "none";
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
export function mountClock(el, withSeconds) {
  const update = ()=>{
    const d=new Date(), hh=String(d.getHours()).padStart(2,"0"), mm=String(d.getMinutes()).padStart(2,"0"), ss=String(d.getSeconds()).padStart(2,"0");
    el.textContent = withSeconds ? `${hh}:${mm}:${ss}` : `${hh}:${mm}`;
  };
  update();
  const t = setInterval(update, withSeconds ? 1000 : 5000);
  return () => clearInterval(t); // disposer
}
