/* static/js/view.js
   Driftssikker visning: leser /api/config, pinger /tick, rendrer klokke/meldinger og stoppskjerm.
   Defansiv mot nettverksfeil. Oppdaterer heartbeat (best-effort).
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

  // --- utils ---
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const pad2  = n => String(n).padStart(2,"0");
  const fmtBoth = (ms) => {
    const sgn = ms < 0 ? "-" : "";
    ms = Math.abs(ms);
    let s = Math.floor(ms/1000);
    const h = Math.floor(s/3600); s%=3600;
    const m = Math.floor(s/60); s%=60;
    return {
      h: h, m: m, s: s,
      mmss: `${sgn}${Math.floor((h*60)+m)}:${pad2(s)}`,
      hms: `${sgn}${h}:${pad2(m)}:${pad2(s)}`
    };
  };
  function setHidden(el, hidden){ if(!el) return; el.classList.toggle("hidden", !!hidden); }
  function showErr(msg){ if(!errBar) return; errBar.textContent = msg; setHidden(errBar, !msg); }

  // --- background / theme ---
  function applyTheme(c){
    // messages typography
    const p = c?.theme?.messages?.primary || {};
    const s = c?.theme?.messages?.secondary || {};
    [pTop, pBottom].forEach(el => { if(!el) return; el.style.fontSize = `${p.size_rem??1}rem`; el.style.fontWeight = String(p.weight??600); el.style.color = p.color ?? "#9aa4b2"; });
    [sTop, sBottom].forEach(el => { if(!el) return; el.style.fontSize = `${s.size_rem??1}rem`; el.style.fontWeight = String(s.weight??400); el.style.color = s.color ?? "#9aa4b2"; });
    // digits size/weight
    digitsEl.style.fontSize = `min(20vw, ${clamp((c?.theme?.digits?.size_vw ?? 14), 8, 28)}vw)`;
    document.documentElement.style.setProperty("--digits-weight", String(c?.theme?.digits?.weight ?? 800));

    // background
    const box = document.body;
    const bg = c?.theme?.background || {};
    if (bg.mode === "solid"){
      box.style.background = bg.solid?.color || "#0b0f14";
    } else if (bg.mode === "gradient"){
      const ang = bg.gradient?.angle_deg ?? 180;
      const from = bg.gradient?.from || "#142033";
      const to   = bg.gradient?.to   || "#0b0f14";
      box.style.background = `linear-gradient(${ang}deg, ${from}, ${to})`;
    } else if (bg.mode === "image"){
      const url = bg.image?.url || "";
      const fit = bg.image?.fit || "cover";
      const op  = Number(bg.image?.opacity ?? 1);
      const tint = bg.image?.tint?.color || "#000000";
      const to   = Number(bg.image?.tint?.opacity ?? 0);
      box.style.background = (to>0)
        ? `linear-gradient(rgba(${hex(tint).join(",")},${to}), rgba(${hex(tint).join(",")},${to})), url('${url}')`
        : `url('${url}')`;
      box.style.backgroundSize = fit;
      box.style.backgroundPosition = "center";
      box.style.backgroundRepeat = "no-repeat";
      box.style.opacity = String(op);
    } else {
      box.style.background = "#0b0f14";
    }
  }
  function hex(h){ const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((h||"").trim()); return m?[parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)]:[0,0,0]; }

  // --- messages / placement ---
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

    const pos = (c.messages_position || "below"); // above|below
    setHidden(msgAbove, pos!=="above");
    setHidden(msgBelow, pos!=="below");

    // clear
    [pTop, pBottom, sTop, sBottom].forEach(el => { if(el) el.textContent = ""; });

    if (pos==="above"){
      pTop.textContent = showP ? primary : "";
      sTop.textContent = showS ? secondary : "";
    } else {
      pBottom.textContent = showP ? primary : "";
      sBottom.textContent = showS ? secondary : "";
    }
  }

  // --- screen (pause) layer ---
  function renderScreen(c){
    const sc = c?.screen || {};
    screenLay.style.position = "absolute";
    screenLay.style.inset = "0";
    screenLay.style.display = "grid";
    screenLay.style.placeItems = "center";
    screenLay.style.padding = "4vh 4vw";

    // background
    if (sc.use_theme_background){
      // reuse theme background already applied to body → transparent layer
      screenLay.style.background = "transparent";
    } else {
      const bg = sc.background || {};
      if (bg.mode === "solid"){
        screenLay.style.background = bg.solid?.color || "#0b0f14";
      } else if (bg.mode === "gradient"){
        const ang = bg.gradient?.angle_deg ?? 180;
        screenLay.style.background = `linear-gradient(${ang}deg, ${bg.gradient?.from||"#142033"}, ${bg.gradient?.to||"#0b0f14"})`;
      } else if (bg.mode === "image"){
        const url = bg.image?.url || "";
        const fit = bg.image?.fit || "cover";
        const op  = Number(bg.image?.opacity ?? 1);
        const tint = bg.image?.tint?.color || "#000000";
        const to   = Number(bg.image?.tint?.opacity ?? 0);
        screenLay.style.background = (to>0)
          ? `linear-gradient(rgba(${hex(tint).join(",")},${to}), rgba(${hex(tint).join(",")},${to})), url('${url}')`
          : `url('${url}')`;
        screenLay.style.backgroundSize = fit;
        screenLay.style.backgroundPosition = "center";
        screenLay.style.backgroundRepeat = "no-repeat";
        screenLay.style.opacity = String(op);
      } else {
        screenLay.style.background = "#0b0f14";
      }
    }

    // content
    screenLay.innerHTML = "";
    if (sc.type === "blackout"){
      /* bevisst tomt */
    } else if (sc.type === "image"){
      const img = document.createElement("img");
      img.src = sc.image_url || "";
      img.style.maxWidth = "100%"; img.style.maxHeight = "100%";
      img.style.objectFit = sc.image_fit || "cover";
      img.style.opacity = String((sc.image_opacity??100)/100);
      screenLay.appendChild(img);
    } else { // text default
      const div = document.createElement("div");
      div.textContent = sc.text || "Pause";
      div.style.color = sc.text_color || "#ffffff";
      div.style.fontSize = `${clamp(sc.font_vh ?? 10, 4, 30)}vh`;
      div.style.textAlign = "center";
      screenLay.appendChild(div);
    }

    // optional clock
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
      // tick every sec
      setInterval(()=>{
        const d = new Date();
        const HH = pad2(d.getHours()), MM = pad2(d.getMinutes()), SS = pad2(d.getSeconds());
        clk.textContent = sc.clock.with_seconds ? `${HH}:${MM}:${SS}` : `${HH}:${MM}`;
      }, 500);
    }
  }

  // --- digits / color / blink ---
  function renderDigits(c, tick){
    const both = fmtBoth(tick.signed_display_ms);
    const thresholdMin = Number(c.hms_threshold_minutes ?? 60);
    const over = tick.signed_display_ms < 0;

    const showHMS = (Math.abs(tick.signed_display_ms) >= thresholdMin*60*1000);
    digitsEl.textContent = showHMS ? both.hms : both.mmss;

    // color
    let color = c.color_normal || "#e6edf3";
    if (c.use_phase_colors){
      if (over) color = c.color_over || "#9ad0ff";
      else if (tick.alert_ms && tick.signed_display_ms <= tick.alert_ms) color = c.color_alert || "#ff6b6b";
      else if (tick.warn_ms  && tick.signed_display_ms <= tick.warn_ms)  color = c.color_warn  || "#ffd166";
    }
    digitsEl.style.color = color;

    // blink
    const doBlink = !!c.use_blink && !over && (Number(c.blink_seconds||0) > 0)
      && (Math.abs(tick.signed_display_ms) <= (Number(c.blink_seconds)*1000));
    digitsEl.classList.toggle("blink", doBlink);
  }

  // --- fetchers ---
  async function fetchConfig(){
    const r = await fetch("/api/config");
    if (!r.ok) throw new Error(`config ${r.status}`);
    const js = await r.json();
    CFG = js.config || js; // backend kan svare {config, tick}
    lastCfgRev = CFG?._updated_at || 0;
    applyTheme(CFG);
  }

  async function tick(){
    const r = await fetch("/tick");
    if (!r.ok) throw new Error(`tick ${r.status}`);
    const t = await r.json();

    // heartbeat best-effort
    try {
      fetch("/debug/heartbeat", {method:"POST", headers:{"Content-Type":"application/json"},
        body: JSON.stringify({ ts: Date.now(), rev: lastCfgRev, from: "view" })});
    } catch {}

    // mode=screen ⇒ vis stoppskjerm; ellers digits+meldinger
    if ((t.mode||"") === "screen"){
      setHidden(screenLay, false);
      setHidden(digitsEl, true);
      setHidden(msgAbove, true);
      setHidden(msgBelow, true);
      renderScreen(CFG||{});
      showErr("");
      return;
    } else {
      setHidden(screenLay, true);
      setHidden(digitsEl, false);
    }

    renderMessages(CFG||{}, t);
    renderDigits(CFG||{}, t);
    showErr("");
  }

  // --- init ---
  async function boot(){
    try {
      await fetchConfig();
      await tick(); // første paint raskt
      setInterval(()=>tick().catch(e=>showErr(String(e))), 400);
    } catch (e) {
      showErr(String(e));
    }
  }

  // fullscreen
  btnFS?.addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
      else await document.exitFullscreen();
    } catch {}
  });

  boot();
})();
