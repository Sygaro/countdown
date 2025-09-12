/* static/js/admin-style.js
   Administrerer visuell stil (meldinger/digits, bakgrunn, stopp-skjerm og klokke) + forhåndsvisning.
   Hvorfor: isolere utseende fra timer-logikken.
*/
(function(){
  const $  = (s)=>document.querySelector(s);
  const $$ = (s)=>Array.from(document.querySelectorAll(s));

  let CFG = null, TICK = null;

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

  const val = (sel, d="")=>{ const el=$(sel); return el? (el.value ?? d) : d; };
  const num = (sel, d=0)=>{ const el=$(sel); const v=el?parseFloat(el.value):NaN; return Number.isFinite(v)?v:d; };
  const checked = (sel)=> !!($(sel)?.checked);
  const selBgMode   = ()=> ($$("input[name=bg_mode]:checked")[0]?.value)||"solid";
  const selScBgMode = ()=> ($$("input[name=sc_bg_mode]:checked")[0]?.value)||"solid";
  const selScreenType=()=> ($$("input[name=screen_type]:checked")[0]?.value)||"text";

  async function fetchConfig(){
    const r = await fetch("/api/config"); const js = await r.json();
    CFG = js.config; TICK = js.tick || null;
  }
  async function pushFullConfig(){
    const r = await fetch("/api/config",{method:"POST",headers:headers(),body:JSON.stringify(CFG)});
    if (!r.ok) throw new Error(await r.text());
    const js = await r.json(); CFG = js.config; TICK = js.tick || null;
  }

  function lock(){
    const st = selScreenType();
    $("#screen_text_cfg").style.display  = st==="text"  ? "block":"none";
    $("#screen_image_cfg").style.display = st==="image" ? "block":"none";

    const useTheme = checked("#sc_use_theme_bg");
    $("#sc_bg_cfg").style.display = useTheme ? "none" : "block";

    const bg = selBgMode();   $("#bg_solid_cfg").style.display = bg==="solid"?"block":"none"; $("#bg_grad_cfg").style.display = bg==="gradient"?"block":"none"; $("#bg_img_cfg").style.display = bg==="image"?"block":"none";
    const sbg= selScBgMode(); $("#sc_bg_solid").style.display = sbg==="solid"?"block":"none"; $("#sc_bg_grad").style.display = sbg==="gradient"?"block":"none"; $("#sc_bg_img").style.display = sbg==="image"?"block":"none";
  }

  function applyToUI(){
    const c = CFG;
    // theme messages/digits
    const p = c?.theme?.messages?.primary   || {};
    const s = c?.theme?.messages?.secondary || {};
    $("#theme_p_size").value = String(p.size_rem ?? 1.0);
    $("#theme_p_weight").value = String(p.weight ?? 600);
    $("#theme_p_color").value = String(p.color ?? "#9aa4b2");
    $("#theme_s_size").value = String(s.size_rem ?? 1.0);
    $("#theme_s_weight").value = String(s.weight ?? 400);
    $("#theme_s_color").value = String(s.color ?? "#9aa4b2");
    $("#digits_size_preset").value = String(c?.theme?.digits?.size_vw ?? 14);

    // background (theme)
    const bg = c?.theme?.background || {};
    ($(`input[name=bg_mode][value=${(bg.mode||"solid")}]`)||{}).checked = true;
    $("#bg_solid_color").value = bg.solid?.color || "#0b0f14";
    $("#bg_grad_from").value   = bg.gradient?.from || "#142033";
    $("#bg_grad_to").value     = bg.gradient?.to   || "#0b0f14";
    $("#bg_grad_angle").value  = bg.gradient?.angle_deg ?? 180;
    $("#bg_img_url").value     = bg.image?.url  || "";
    $("#bg_img_fit").value     = bg.image?.fit  || "cover";
    $("#bg_img_op").value      = bg.image?.opacity ?? 1;
    $("#bg_img_tint").value    = bg.image?.tint?.color || "#000000";
    $("#bg_img_tint_op").value = bg.image?.tint?.opacity ?? 0;

    // stop-screen content
    const sc = c?.screen || {};
    ($(`input[name=screen_type][value=${sc.type||"text"}]`)||{}).checked = true;
    $("#screen_text").value = sc.text || "Pause";
    $("#screen_text_color").value = sc.text_color || "#ffffff";
    $("#screen_font_vh").value = sc.font_vh ?? 10;
    $("#screen_image_url").value = sc.image_url || "";
    $("#screen_image_opacity").value = sc.image_opacity ?? 100;
    $("#screen_image_fit").value = sc.image_fit || "cover";

    // stop-screen background & clock
    $("#sc_use_theme_bg").checked = !!sc.use_theme_background;
    const sbg = sc.background || {};
    ($(`input[name=sc_bg_mode][value=${(sbg.mode||"solid")}]`)||{}).checked = true;
    $("#sc_bg_solid_color").value = sbg.solid?.color || "#0b0f14";
    $("#sc_bg_grad_from").value   = sbg.gradient?.from || "#142033";
    $("#sc_bg_grad_to").value     = sbg.gradient?.to   || "#0b0f14";
    $("#sc_bg_grad_angle").value  = sbg.gradient?.angle_deg ?? 180;
    $("#sc_bg_img_url").value     = sbg.image?.url  || "";
    $("#sc_bg_img_fit").value     = sbg.image?.fit  || "cover";
    $("#sc_bg_img_op").value      = sbg.image?.opacity ?? 1;
    $("#sc_bg_img_tint").value    = sbg.image?.tint?.color || "#000000";
    $("#sc_bg_img_tint_op").value = sbg.image?.tint?.opacity ?? 0;

    $("#sc_clock_show").checked = !!(sc.clock?.show);
    $("#sc_clock_secs").checked = !!(sc.clock?.with_seconds);
    $("#sc_clock_color").value = sc.clock?.color || "#e6edf3";
    $("#sc_clock_size").value  = sc.clock?.size_vh ?? 12;

    lock();
    renderPreview();
  }

  function collectToConfig(){
    const c = CFG;

    // theme
    deepMerge(c, {
      theme: {
        digits: { size_vw: Number(val("#digits_size_preset","14")) },
        messages: {
          primary:   { size_rem: Number(val("#theme_p_size","1.0")), weight: Number(val("#theme_p_weight","600")), color: val("#theme_p_color","#9aa4b2") },
          secondary: { size_rem: Number(val("#theme_s_size","1.0")), weight: Number(val("#theme_s_weight","400")), color: val("#theme_s_color","#9aa4b2") }
        },
        background: {
          mode: selBgMode(),
          solid:    { color: val("#bg_solid_color","#0b0f14") },
          gradient: { from: val("#bg_grad_from","#142033"), to: val("#bg_grad_to","#0b0f14"), angle_deg: Number(val("#bg_grad_angle","180")) },
          image:    { url: val("#bg_img_url",""), fit: val("#bg_img_fit","cover"), opacity: Number(val("#bg_img_op","1")), tint: { color: val("#bg_img_tint","#000000"), opacity: Number(val("#bg_img_tint_op","0")) } }
        }
      }
    });

    // stop-screen
    deepMerge(c, {
      screen: {
        type: selScreenType(),
        text: val("#screen_text","Pause"),
        text_color: val("#screen_text_color","#ffffff"),
        font_vh: parseInt(val("#screen_font_vh","10"),10),
        image_url: val("#screen_image_url",""),
        image_fit: val("#screen_image_fit","cover"),
        image_opacity: parseInt(val("#screen_image_opacity","100"),10),
        use_theme_background: checked("#sc_use_theme_bg"),
        background: {
          mode: selScBgMode(),
          solid:    { color: val("#sc_bg_solid_color","#0b0f14") },
          gradient: { from: val("#sc_bg_grad_from","#142033"), to: val("#sc_bg_grad_to","#0b0f14"), angle_deg: Number(val("#sc_bg_grad_angle","180")) },
          image:    { url: val("#sc_bg_img_url",""), fit: val("#sc_bg_img_fit","cover"), opacity: Number(val("#sc_bg_img_op","1")), tint: { color: val("#sc_bg_img_tint","#000000"), opacity: Number(val("#sc_bg_img_tint_op","0")) } }
        },
        clock: { show: checked("#sc_clock_show"), with_seconds: checked("#sc_clock_secs"), color: val("#sc_clock_color","#e6edf3"), size_vh: Number(val("#sc_clock_size","12")) }
      }
    });
  }

  function applyPreviewBackground(){
    const box = $("#pv_box");
    const mode = selBgMode();
    if (mode==="solid"){
      box.style.background = val("#bg_solid_color","#0b0f14");
    } else if (mode==="gradient"){
      box.style.background = `linear-gradient(${Number(val("#bg_grad_angle","180"))}deg, ${val("#bg_grad_from","#142033")}, ${val("#bg_grad_to","#0b0f14")})`;
    } else {
      const url = val("#bg_img_url","");
      const fit = val("#bg_img_fit","cover");
      const op  = Number(val("#bg_img_op","1"));
      const tint= val("#bg_img_tint","#000000");
      const to  = Number(val("#bg_img_tint_op","0"));
      box.style.background = (to>0)
        ? `linear-gradient(${hexToRgba(tint,to)}, ${hexToRgba(tint,to)}), url('${url}')`
        : `url('${url}')`;
      box.style.backgroundSize=fit; box.style.backgroundPosition="center"; box.style.backgroundRepeat="no-repeat";
      box.style.opacity=String(op);
    }
  }
  function hexToRgb(h){ const m=/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec((h||"")); if(!m) return [0,0,0]; return [parseInt(m[1],16),parseInt(m[2],16),parseInt(m[3],16)]; }
  function hexToRgba(h,a){ const [r,g,b]=hexToRgb(h); return `rgba(${r},${g},${b},${a})`; }

  function renderPreview(){
    applyPreviewBackground();
    const vw = Number(val("#digits_size_preset","14"));
    $("#pv_digits").style.fontSize = `clamp(4vw, ${vw*0.55}vw, ${vw*0.8}vw)`;

    const p = { size_rem:Number(val("#theme_p_size","1.0")), weight:Number(val("#theme_p_weight","600")), color:val("#theme_p_color","#9aa4b2") };
    const s = { size_rem:Number(val("#theme_s_size","1.0")), weight:Number(val("#theme_s_weight","400")), color:val("#theme_s_color","#9aa4b2") };
    [["#pv_prim_above","#pv_prim_below"]].flat().forEach(sel=>{ const el=$(sel); el.style.fontSize=`${p.size_rem}rem`; el.style.fontWeight=String(p.weight); el.style.color=p.color; el.textContent="Velkommen til bibelskole!"; });
    [["#pv_sec_above","#pv_sec_below"]].flat().forEach(sel=>{ const el=$(sel); el.style.fontSize=`${s.size_rem}rem`; el.style.fontWeight=String(s.weight); el.style.color=s.color; el.textContent="Vi starter kl: 19:00"; });

    // digit-farge sim
    const state = ($$("input[name=pv_state]:checked")[0]?.value)||"normal";
    const map = { normal: "#e6edf3", warn:"#ffd166", alert:"#ff6b6b", overrun:"#9ad0ff" };
    $("#pv_digits").style.color = map[state] || map.normal;
    $("#pv_digits").classList.toggle("blink", $("#pv_blink")?.checked);
  }

  function applyPreset(){
    const p = val("#bg_preset","none");
    if (p==="dark-solid"){
      ($(`input[name=bg_mode][value=solid]`)).checked=true;
      $("#bg_solid_color").value="#0b0f14";
    } else if (p==="dark-grad"){
      ($(`input[name=bg_mode][value=gradient]`)).checked=true;
      $("#bg_grad_from").value="#111827"; $("#bg_grad_to").value="#0b0f14"; $("#bg_grad_angle").value=180;
    } else if (p==="photo-tint"){
      ($(`input[name=bg_mode][value=image]`)).checked=true;
      $("#bg_img_url").value="https://picsum.photos/1600/900";
      $("#bg_img_fit").value="cover"; $("#bg_img_op").value=1;
      $("#bg_img_tint").value="#000000"; $("#bg_img_tint_op").value=0.4;
    }
    lock(); renderPreview();
  }

  function pulse(sel, text){
    const el=$(sel); if(!el) return;
    el.textContent = text || "";
    el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse");
    setTimeout(()=>{ el.textContent=""; }, 1200);
  }

  async function saveAll(){
    await fetchConfig(); // baser på siste
    collectToConfig();
    await pushFullConfig();
    pulse("#save_hint","Lagret");
  }

  async function resetView(){
    const r = await fetch("/api/defaults"); const js = await r.json();
    const d = js.defaults;
    await fetchConfig();
    deepMerge(CFG, {
      theme: d.theme,
      screen: d.screen
    });
    await pushFullConfig();
    applyToUI();
    pulse("#save_hint","Tilbakestilt");
  }

  async function updateSyncPill(){
    const pill = $("#sync_pill");
    try{
      const r=await fetch("/debug/view-heartbeat"); const js=await r.json();
      const hb=js.heartbeat||{}; const age=hb.age_seconds??9999;
      const viewRev=hb.rev||0; const cfgRev=(CFG&&CFG._updated_at)?CFG._updated_at:0;
      if (age>30 || !hb.ts_iso) { pill.textContent="Synk: visning offline"; pill.className="pill off"; }
      else if (viewRev>=cfgRev) { pill.textContent=`Synk: OK (rev ${viewRev})`; pill.className="pill ok"; }
      else { pill.textContent=`Synk: venter (view ${viewRev} < cfg ${cfgRev})`; pill.className="pill warn"; }
    }catch{ pill.textContent="Synk: —"; pill.className="pill off"; }
  }

  // events
  $$("input[name=screen_type]").forEach(el=>el.addEventListener("change",()=>{ lock(); renderPreview(); }));
  $$("input[name=bg_mode]").forEach(el=>el.addEventListener("change",()=>{ lock(); renderPreview(); }));
  $$("input[name=sc_bg_mode]").forEach(el=>el.addEventListener("change",()=>{ lock(); renderPreview(); }));
  $("#sc_use_theme_bg")?.addEventListener("change",()=>{ lock(); renderPreview(); });
  ["theme_p_size","theme_p_weight","theme_p_color","theme_s_size","theme_s_weight","theme_s_color","digits_size_preset",
   "bg_solid_color","bg_grad_from","bg_grad_to","bg_grad_angle","bg_img_url","bg_img_fit","bg_img_op","bg_img_tint","bg_img_tint_op",
   "sc_bg_solid_color","sc_bg_grad_from","sc_bg_grad_to","sc_bg_grad_angle","sc_bg_img_url","sc_bg_img_fit","sc_bg_img_op","sc_bg_img_tint","sc_bg_img_tint_op",
   "screen_text","screen_text_color","screen_font_vh","screen_image_url","screen_image_opacity","screen_image_fit",
   "pv_blink"].forEach(id=>{ const el=$( "#"+id ); if(el) el.addEventListener("input", renderPreview); });
  $$("input[name=pv_state]").forEach(el=>el.addEventListener("change", renderPreview));

  $("#btn_apply_preset")?.addEventListener("click", applyPreset);
  $("#btn_save")?.addEventListener("click", ()=>saveAll().catch(e=>alert(e.message)));
  $("#btn_refresh")?.addEventListener("click", ()=>fetchConfig().then(()=>{ applyToUI(); }).catch(e=>alert(e.message)));
  $("#btn_reset_view")?.addEventListener("click", ()=>resetView().catch(e=>alert(e.message)));

  // init
  fetchConfig().then(()=>{ applyToUI(); }).catch(console.error);
  setInterval(updateSyncPill, 3000);
})();
