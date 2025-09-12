/* static/js/admin-timer.js
   Administrerer timer/oppførsel. Leser full cfg, endrer kun relevante felt, og POSTer full cfg tilbake.
   Hvorfor: unngå å miste andre verdier som ikke finnes på denne siden.
*/
(function(){
  const $  = (s)=>document.querySelector(s);
  const $$ = (s)=>Array.from(document.querySelectorAll(s));

  let CFG = null;   // sist hentede full-konfig
  let TICK = null;

  // --- utils ---
  const headers = () => {
    const pwd = ($("#admin_password")?.value || "").trim();
    const h = {"Content-Type":"application/json"};
    if (pwd) h["X-Admin-Password"] = pwd;
    return h;
  };
  const deepMerge = (dst, src) => {
    if (!src || typeof src!=="object") return dst;
    Object.entries(src).forEach(([k,v])=>{
      if (v && typeof v==="object" && !Array.isArray(v)) {
        if (!dst[k] || typeof dst[k]!=="object") dst[k] = {};
        deepMerge(dst[k], v);
      } else {
        dst[k] = v;
      }
    });
    return dst;
  };
  const num = (sel, d=0)=>{ const el=$(sel); const v = el? parseFloat(el.value) : NaN; return Number.isFinite(v)? v : d; };
  const val = (sel, d="")=>{ const el=$(sel); return el? (el.value ?? d) : d; };
  const checked = (sel)=> !!($(sel)?.checked);

  async function fetchConfig(){
    const r = await fetch("/api/config"); const js = await r.json();
    CFG = js.config; TICK = js.tick || null;
    return CFG;
  }
  async function pushFullConfig(){
    const r = await fetch("/api/config",{method:"POST",headers:headers(),body:JSON.stringify(CFG)});
    if (!r.ok) throw new Error(await r.text());
    const js = await r.json(); CFG = js.config; TICK = js.tick || null;
  }

  function selMode(){ const r=$$("input[name=mode]:checked")[0]; return r? r.value : "daily"; }
  function lock(){
    const m = selMode();
    $("#daily_time").disabled = (m!=="daily");
    $("#once_at").disabled    = (m!=="once");
  }

  function applyToUI(){
    const c = CFG;
    // modus
    const r = document.querySelector(`input[name=mode][value=${c.mode||"daily"}]`);
    if (r) r.checked = true;
    $("#daily_time").value = c.daily_time || "";
    $("#once_at").value = (c.once_at||"").replace("Z","");
    $("#active_mode").textContent = `Aktiv modus: ${c.mode} · Fase: ${TICK?.mode||"—"} (${TICK?.state||"—"})`;
    

    // meldinger
    $("#show_message_primary").checked   = !!c.show_message_primary;
    $("#show_message_secondary").checked = !!c.show_message_secondary;
    $("#message_primary").value   = c.message_primary || "";
    $("#message_secondary").value = c.message_secondary || "";

    // varsler
    $("#warn_minutes").value   = c.warn_minutes ?? 4;
    $("#alert_minutes").value  = c.alert_minutes ?? 2;
    $("#blink_seconds").value  = c.blink_seconds ?? 10;
    $("#overrun_minutes").value= c.overrun_minutes ?? 1;

    // oppførsel
    $("#use_phase_colors").checked = !!c.use_phase_colors;
    $("#use_blink").checked        = !!c.use_blink;
    $("#show_target_time").checked = !!c.show_target_time;
    $("#target_time_after").value  = c.target_time_after || "secondary";
    $("#messages_position").value  = c.messages_position || "below";
    $("#hms_threshold_minutes").value = c.hms_threshold_minutes ?? 60;
    $("#color_normal").value = c.color_normal || "#e6edf3";
    $("#color_warn").value   = c.color_warn   || "#ffd166";
    $("#color_alert").value  = c.color_alert  || "#ff6b6b";
    $("#color_over").value   = c.color_over   || "#9ad0ff";

    lock();
  }

  function collectToConfig(){
    const c = CFG;
    // modus
    const m = selMode();
    c.mode = m;
    if (m==="daily") c.daily_time = val("#daily_time", c.daily_time||"");
    if (m==="once")  c.once_at    = val("#once_at", c.once_at||"");

    // meldinger
    c.show_message_primary   = checked("#show_message_primary");
    c.show_message_secondary = checked("#show_message_secondary");
    c.message_primary   = val("#message_primary", "");
    c.message_secondary = val("#message_secondary", "");

    // varsler
    c.warn_minutes   = Math.max(0, Math.min(720, num("#warn_minutes", c.warn_minutes ?? 4)));
    c.alert_minutes  = Math.max(0, Math.min(720, num("#alert_minutes", c.alert_minutes ?? 2)));
    c.blink_seconds  = Math.max(0, Math.min(300, num("#blink_seconds", c.blink_seconds ?? 10)));
    c.overrun_minutes= Math.max(0, Math.min(720, num("#overrun_minutes", c.overrun_minutes ?? 1)));

    // oppførsel
    c.use_phase_colors = checked("#use_phase_colors");
    c.use_blink        = checked("#use_blink");
    c.show_target_time = checked("#show_target_time");
    c.target_time_after= val("#target_time_after","secondary");
    c.messages_position= val("#messages_position","below");
    c.hms_threshold_minutes = Math.max(0, Math.min(720, num("#hms_threshold_minutes", c.hms_threshold_minutes ?? 60)));
    c.color_normal = val("#color_normal",  c.color_normal||"#e6edf3");
    c.color_warn   = val("#color_warn",    c.color_warn  ||"#ffd166");
    c.color_alert  = val("#color_alert",   c.color_alert ||"#ff6b6b");
    c.color_over   = val("#color_over",    c.color_over  ||"#9ad0ff");
  }

  async function startDuration(){
  const minutes = parseInt($("#start_minutes")?.value || "0", 10);
  if (!Number.isFinite(minutes) || minutes <= 0) { alert("Ugyldig varighet"); return; }

  // robust: prøv bindestrek, fallback til underscore
  const body = JSON.stringify({minutes});
  let r = await fetch("/api/start-duration",{method:"POST",headers:headers(),body});
  if (r.status === 404) {
    r = await fetch("/api/start_duration",{method:"POST",headers:headers(),body});
  }
  if (!r.ok) { alert(await r.text()); return; }
  await fetchConfig(); applyToUI();
}

async function stopSwitchDaily(){
  await fetchConfig();
  CFG.mode = "daily";
  await pushFullConfig();
  applyToUI();
}
async function activateStopScreenNow(){
  await fetchConfig();
  CFG.mode = "screen";               // beholder dagens screen-innstillinger
  await pushFullConfig();
  applyToUI();
  alert("Stopp-skjerm aktivert");
}

  async function saveAll(){
    await fetchConfig(); // defensive: baser endringer på siste cfg
    collectToConfig();
    await pushFullConfig();
    pulse("#save_hint","Lagret");
  }

  async function resetView(){
    // henter defaults og setter kun visningsrelaterte felter tilbake i CFG (ikke tid/modus)
    const r = await fetch("/api/defaults"); const js = await r.json();
    const d = js.defaults;

    await fetchConfig();
    deepMerge(CFG, {
      use_phase_colors: d.use_phase_colors,
      use_blink: d.use_blink,
      show_target_time: d.show_target_time,
      target_time_after: d.target_time_after,
      messages_position: d.messages_position,
      hms_threshold_minutes: d.hms_threshold_minutes,
      color_normal: d.color_normal,
      color_warn: d.color_warn,
      color_alert: d.color_alert,
      color_over: d.color_over,
      warn_minutes: d.warn_minutes,
      alert_minutes: d.alert_minutes,
      blink_seconds: d.blink_seconds,
      overrun_minutes: d.overrun_minutes,
      show_message_primary: d.show_message_primary,
      show_message_secondary: d.show_message_secondary,
      message_primary: d.message_primary,
      message_secondary: d.message_secondary
    });
    await pushFullConfig();
    applyToUI();
    pulse("#save_hint","Tilbakestilt");
  }

  function pulse(sel, text){
    const el=$(sel); if(!el) return;
    el.textContent = text || "";
    el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse");
    setTimeout(()=>{ el.textContent=""; }, 1200);
  }

  async function updateSyncPill(){
    const pill = $("#sync_pill");
    try{
      const r = await fetch("/debug/view-heartbeat"); const js = await r.json();
      const hb = js.heartbeat || {};
      const age = hb.age_seconds ?? 9999;
      const viewRev = hb.rev || 0;
      const cfgRev  = (CFG && CFG._updated_at) ? CFG._updated_at : 0;
      if (age>30 || !hb.ts_iso){ pill.textContent="Synk: visning offline"; pill.className="pill off"; }
      else if (viewRev>=cfgRev){ pill.textContent=`Synk: OK (rev ${viewRev})`; pill.className="pill ok"; }
      else { pill.textContent=`Synk: venter (view ${viewRev} < cfg ${cfgRev})`; pill.className="pill warn"; }
    }catch{ pill.textContent="Synk: —"; pill.className="pill off"; }
  }

  // events
  $$("input[name=mode]").forEach(el=>el.addEventListener("change",lock));
  $$(".preset").forEach(b=>b.addEventListener("click",()=>{ const m = $("#start_minutes"); if (m) m.value = b.dataset.min; }));
  $("#btn_start")?.addEventListener("click", ()=>startDuration().catch(e=>alert(e.message)));
  $("#btn_stop") ?.addEventListener("click", ()=>stopSwitchDaily().catch(e=>alert(e.message)));
  $("#btn_save") ?.addEventListener("click", ()=>saveAll().catch(e=>alert(e.message)));
  $("#btn_refresh")?.addEventListener("click", ()=>fetchConfig().then(applyToUI).catch(e=>alert(e.message)));
  $("#btn_reset_view")?.addEventListener("click", ()=>resetView().catch(e=>alert(e.message)));

  // init
  fetchConfig().then(applyToUI).catch(console.error);
  setInterval(updateSyncPill, 3000);
})();
