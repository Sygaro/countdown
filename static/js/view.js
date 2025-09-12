/* static/js/view.js
   Robust visning med:
   - Tick-interval fra config (100–2000 ms).
   - Dynamisk digitstørrelse basert på vmin + H:MM:SS-justering.
   - Fullskjermknapp skjules i fullscreen.
   - Én skjermklokke-timer, ikke multiplisert.
*/
(function(){
  const $=s=>document.querySelector(s);
  const digitsEl   = $("#digits");
  const msgAbove   = $("#msg_above");
  const msgBelow   = $("#msg_below");
  const pTop       = $("#msg_primary_top");
  const sTop       = $("#msg_secondary_top");
  const pBottom    = $("#msg_primary_bottom");
  const sBottom    = $("#msg_secondary_bottom");
  const screenLay  = $("#screen_layer");
  const errBar     = $("#err");
  const btnFS      = $("#btn_fs");

  let CFG = null;
  let lastCfgRev = 0;
  let tickTimerId = null;
  let screenClockTimerId = null;
  let currentShowHMS = false;

  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const pad2  = n => String(n).padStart(2,"0");

  const fmtBoth = (ms) => {
    const sgn = ms < 0 ? "-" : "";
    ms = Math.abs(ms);
    let s = Math.floor(ms/1000);
    const h = Math.floor(s/3600); s%=3600;
    const m = Math.floor(s/60); s%=60;
    return { h, m, s, mmss: `${sgn}${Math.floor((h*60)+m)}:${pad2(s)}`, hms: `${sgn}${h}:${pad2(m)}:${pad2(s)}` };
  };

  function setHidden(el, hidden){ if(!el) return; el.classList.toggle("hidden", !!hidden); }
  function showErr(msg){ if(!errBar) return; errBar.textContent = msg; setHidden(errBar, !msg); }

  // -------- Tema / bakgrunn
  function hex(h){ const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((h||"").trim()); return m?[parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)]:[0,0,0]; }
  function applyTheme(c){
    const p = c?.theme?.messages?.primary || {};
    const s = c?.theme?.messages?.secondary || {};
    [pTop, pBottom].forEach(el => { if(!el) return; el.style.fontSize = `${p.size_rem??1}rem`; el.style.fontWeight = String(p.weight??600); el.style.color = p.color ?? "#9aa4b2"; });
    [sTop, sBottom].forEach(el => { if(!el) return; el.style.fontSize = `${s.size_rem??1}rem`; el.style.fontWeight = String(s.weight??400); el.style.color = s.color ?? "#9aa4b2"; });

    // Start med et rimelig utgangspunkt, finjusteres i renderDigits()
    const baseVmin = clamp((c?.theme?.digits?.size_vw ?? 14), 8, 28); // bruker vmin for bedre ratio-tilpasning
    digitsEl.style.fontSize = `${baseVmin}vmin`;
    document.documentElement.style.setProperty("--digits-weight", String(c?.theme?.digits?.weight ?? 800));

    const box = document.body;
    const bg = c?.theme?.background || {};
    if (bg.mode === "solid"){
      box.style.background = bg.solid?.color || "#0b0f14";
      box.style.backgroundSize = ""; box.style.backgroundRepeat=""; box.style.backgroundPosition=""; box.style.opacity="";
    } else if (bg.mode === "gradient"){
      const ang = bg.gradient?.angle_deg ?? 180;
      box.style.background = `linear-gradient(${ang}deg, ${bg.gradient?.from||"#142033"}, ${bg.gradient?.to||"#0b0f14"})`;
      box.style.backgroundSize = ""; box.style.backgroundRepeat=""; box.style.backgroundPosition=""; box.style.opacity="";
    } else if (bg.mode === "image"){
      const url = bg.image?.url || "";
      const fit = bg.image?.fit || "cover";
      const op  = Number(bg.image?.opacity ?? 1);
      const tint = bg.image?.tint?.color || "#000000";
      const to   = Number(bg.image?.tint?.opacity ?? 0);
      const [r,g,b] = hex(tint);
      box.style.background = (to>0)
        ? `linear-gradient(rgba(${r},${g},${b},${to}), rgba(${r},${g},${b},${to})), url('${url}')`
        : `url('${url}')`;
      box.style.backgroundSize = fit;
      box.style.backgroundPosition = "center";
      box.style.backgroundRepeat = "no-repeat";
      box.style.opacity = String(op);
    } else {
      box.style.background = "#0b0f14";
      box.style.backgroundSize = ""; box.style.backgroundRepeat=""; box.style.backgroundPosition=""; box.style.opacity="";
    }
  }

  // -------- Meldinger
  function renderMessages(c, tick){
    const showP = !!c.show_message_primary;
    const showS = !!c.show_message_secondary;

    let primary   = c.message_primary || "";
    let secondary = c.message_secondary || "";

    const targetText = (c.show_target_time && (tick?.target_hhmm || null))
      ? ` ${tick.target_hhmm}` : "";

    if (c.show_target_time) {
      if ((c.target_time_after||"secondary")==="primary") primary = (primary || "").trim() + (targetText || "");
      else secondary = (secondary || "").trim() + (targetText || "");
    }

    const pos = (c.messages_position || "below");
    setHidden(msgAbove, pos!=="above");
    setHidden(msgBelow, pos!=="below");

    [pTop, pBottom, sTop, sBottom].forEach(el => { if(el) el.textContent = ""; });

    if (pos==="above"){
      pTop.textContent = showP ? primary : "";
      sTop.textContent = showS ? secondary : "";
    } else {
      pBottom.textContent = showP ? primary : "";
      sBottom.textContent = showS ? secondary : "";
    }
  }

  // -------- Stopp-skjerm
  function clearScreenClock(){
    if (screenClockTimerId){ clearInterval(screenClockTimerId); screenClockTimerId = null; }
  }
  function renderScreen(c){
    clearScreenClock();

    const sc = c?.screen || {};
    screenLay.style.position = "absolute";
    screenLay.style.inset = "0";
    screenLay.style.display = "grid";
    screenLay.style.placeItems = "center";
    screenLay.style.padding = "4vh 4vw";

    // bakgrunn
    if (sc.use_theme_background){
      screenLay.style.background = "transparent";
      screenLay.style.backgroundSize=""; screenLay.style.backgroundRepeat=""; screenLay.style.backgroundPosition=""; screenLay.style.opacity="";
    } else {
      const bg = sc.background || {};
      if (bg.mode === "solid"){
        screenLay.style.background = bg.solid?.color || "#0b0f14";
        screenLay.style.backgroundSize=""; screenLay.style.backgroundRepeat=""; screenLay.style.backgroundPosition=""; screenLay.style.opacity="";
      } else if (bg.mode === "gradient"){
        const ang = bg.gradient?.angle_deg ?? 180;
        screenLay.style.background = `linear-gradient(${ang}deg, ${bg.gradient?.from||"#142033"}, ${bg.gradient?.to||"#0b0f14"})`;
        screenLay.style.backgroundSize=""; screenLay.style.backgroundRepeat=""; screenLay.style.backgroundPosition=""; screenLay.style.opacity="";
      } else if (bg.mode === "image"){
        const url = bg.image?.url || "";
        const fit = bg.image?.fit || "cover";
        const op  = Number(bg.image?.opacity ?? 1);
        const tint = bg.image?.tint?.color || "#000000";
        const to   = Number(bg.image?.tint?.opacity ?? 0);
        const [r,g,b] = hex(tint);
        screenLay.style.background = (to>0)
          ? `linear-gradient(rgba(${r},${g},${b},${to}), rgba(${r},${g},${b},${to})), url('${url}')`
          : `url('${url}')`;
        screenLay.style.backgroundSize = fit;
        screenLay.style.backgroundPosition = "center";
        screenLay.style.backgroundRepeat = "no-repeat";
        screenLay.style.opacity = String(op);
      } else {
        screenLay.style.background = "#0b0f14";
        screenLay.style.backgroundSize=""; screenLay.style.backgroundRepeat=""; screenLay.style.backgroundPosition=""; screenLay.style.opacity="";
      }
    }

    // innhold
    screenLay.innerHTML = "";

    if (sc.type === "blackout"){
      /* svart / kun bakgrunn */
    } else if (sc.type === "image"){
      const img = document.createElement("img");
      img.src = sc.image_url || "";
      img.style.maxWidth = "100%"; img.style.maxHeight = "100%";
      img.style.objectFit = sc.image_fit || "cover";
      img.style.opacity = String((sc.image_opacity??100)/100);
      screenLay.appendChild(img);
    } else { // text
      const div = document.createElement("div");
      div.textContent = sc.text || "Pause";
      div.style.color = sc.text_color || "#ffffff";
      div.style.fontSize = `${clamp(sc.font_vh ?? 10, 4, 30)}vh`;
      div.style.textAlign = "center";
      screenLay.appendChild(div);
    }

    // klokke
    if (sc.clock?.show){
      const clk = document.createElement("div");
      clk.id = "screen_clock";
      clk.style.position = "absolute";
      clk.style.right = "3vw";
      clk.style.top = "2vh";
      clk.style.fontWeight = "800";
      clk.style.color = sc.clock.color || "#e6edf3";
      clk.style.fontSize = `${clamp(sc.clock.size_vh ?? 12, 6, 30)}vh`;
      screenLay.appendChild(clk);

      const tickClock = () => {
        const d = new Date();
        const HH = pad2(d.getHours()), MM = pad2(d.getMinutes()), SS = pad2(d.getSeconds());
        clk.textContent = sc.clock.with_seconds ? `${HH}:${MM}:${SS}` : `${HH}:${MM}`;
      };
      tickClock();
      screenClockTimerId = setInterval(tickClock, 500);
    }
  }

  // -------- Digits
  function applyDigitFontSize(showHMS){
    // vmin skalerer naturlig med ratio; H:MM:SS er bredere → litt mindre font
    const base = clamp((CFG?.theme?.digits?.size_vw ?? 14), 8, 28);
    const factor = showHMS ? 0.86 : 1.0; // hvorfor: mer plass til timer
    digitsEl.style.fontSize = `${(base*factor).toFixed(2)}vmin`;
    currentShowHMS = showHMS;
  }

  function renderDigits(c, tick){
    const both = fmtBoth(tick.signed_display_ms);
    const thresholdMin = Number(c.hms_threshold_minutes ?? 60);
    const over = tick.signed_display_ms < 0;

    const showHMS = (Math.abs(tick.signed_display_ms) >= thresholdMin*60*1000);
    if (showHMS !== currentShowHMS) applyDigitFontSize(showHMS);
    digitsEl.textContent = showHMS ? both.hms : both.mmss;

    let color = c.color_normal || "#e6edf3";
    if (c.use_phase_colors){
      if (over) color = c.color_over || "#9ad0ff";
      else if (tick.alert_ms && tick.signed_display_ms <= tick.alert_ms) color = c.color_alert || "#ff6b6b";
      else if (tick.warn_ms  && tick.signed_display_ms <= tick.warn_ms)  color = c.color_warn  || "#ffd166";
    }
    digitsEl.style.color = color;

    const doBlink = !!c.use_blink && !over && (Number(c.blink_seconds||0) > 0)
      && (Math.abs(tick.signed_display_ms) <= (Number(c.blink_seconds)*1000));
    digitsEl.classList.toggle("blink", doBlink);
  }

  // -------- Henting
  async function fetchConfig(){
    const r = await fetch("/api/config");
    if (!r.ok) throw new Error(`config ${r.status}`);
    const js = await r.json();
    CFG = js.config || js;
    lastCfgRev = CFG?._updated_at || 0;
    applyTheme(CFG);
    applyDigitFontSize(false); // init
    restartTickLoop();         // oppdater intervall ved ny config
  }

  async function tick(){
    const r = await fetch("/tick");
    if (!r.ok) throw new Error(`tick ${r.status}`);
    const t = await r.json();

    try {
      fetch("/debug/heartbeat", {method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ts: Date.now(), rev: lastCfgRev, from: "view" })});
    } catch {}

    if ((t.mode||"") === "screen"){
      setHidden(screenLay, false);
      setHidden(digitsEl, true);
      setHidden(msgAbove, true);
      setHidden(msgBelow, true);
      renderScreen(CFG||{});
      showErr("");
      return;
    } else {
      clearScreenClock();
      setHidden(screenLay, true);
      setHidden(digitsEl, false);
    }

    renderMessages(CFG||{}, t);
    renderDigits(CFG||{}, t);
    showErr("");
  }

  // -------- Tick-loop
  function getTickInterval(){
    const raw = Number(CFG?.view?.tick_interval_ms ?? CFG?.tick_interval_ms ?? 400);
    return clamp(isFinite(raw) ? raw : 400, 100, 2000);
  }
  function restartTickLoop(){
    if (tickTimerId) { clearInterval(tickTimerId); tickTimerId = null; }
    const iv = getTickInterval();
    tick(); // spark i gang raskt
    tickTimerId = setInterval(()=>tick().catch(e=>showErr(String(e))), iv);
  }

  // -------- Fullskjerm
  function toggleFullScreenBtn(){
    const fs = !!document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement;
    setHidden(btnFS, fs);
  }
  btnFS?.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) {
        await (document.documentElement.requestFullscreen?.() ||
               document.documentElement.webkitRequestFullscreen?.() ||
               document.documentElement.mozRequestFullScreen?.() ||
               document.documentElement.msRequestFullscreen?.());
      } else {
        await (document.exitFullscreen?.() ||
               document.webkitExitFullscreen?.() ||
               document.mozCancelFullScreen?.() ||
               document.msExitFullscreen?.());
      }
    } catch {}
  });
  ["fullscreenchange","webkitfullscreenchange","mozfullscreenchange","MSFullscreenChange"]
    .forEach(ev => document.addEventListener(ev, toggleFullScreenBtn));

  window.addEventListener("resize", ()=>{ applyDigitFontSize(currentShowHMS); });

  // -------- Init
  async function boot(){
    try {
      await fetchConfig();
      await tick();
      toggleFullScreenBtn(); // skjul knapp i fullscreen
    } catch (e) {
      showErr(String(e));
    }
  }
  boot();
})();
