/* File: static/js/admin_overlays.js
 * Purpose: Koble overlay-editoren til backend. Persisterer full liste ved alle endringer
 *          (inkl. slett/dupliser/ny) og tillater begge synlighetskryss AV (=> visible_in: []).
 * Depends: window.AdminSync.postConfig fra admin.js
 */

(() => {
  "use strict";

  // -- Juster disse om HTML-strukturen avviker --
  const SELECTORS = {
    editorRoot: ".overlay-editor",
    row: ".overlay-row",
    id:        '[data-bind="overlay.id"], [name="overlay_id"]',
    url:       '[data-bind="overlay.url"], [name="overlay_url"]',
    position:  '[data-bind="overlay.position"], [name="overlay_position"]',
    size:      '[data-bind="overlay.size_vmin"], [name="overlay_size_vmin"]',
    opacity:   '[data-bind="overlay.opacity"], [name="overlay_opacity"]',
    offx:      '[data-bind="overlay.offset_vw"], [name="overlay_offset_vw"]',
    offy:      '[data-bind="overlay.offset_vh"], [name="overlay_offset_vh"]',
    z:         '[data-bind="overlay.z_index"], [name="overlay_zindex"]',
    visCountdown: '[data-bind="overlay.visible.countdown"], [name="overlay_visible_countdown"]',
    visClock:     '[data-bind="overlay.visible.clock"], [name="overlay_visible_clock"]',
    tintColor:  '[data-bind="overlay.tint.color"], [name="overlay_tint_color"]',
    tintOpacity:'[data-bind="overlay.tint.opacity"], [name="overlay_tint_opacity"]',
    tintBlend:  '[data-bind="overlay.tint.blend"], [name="overlay_tint_blend"]',
    btnSaveAll:  '[data-action="overlays-save"]',
    btnAdd:      '[data-action="overlay-add"]',
    btnDup:      'button[data-action="overlay-dup"]',
    btnDel:      'button[data-action="overlay-del"]',
  };

  const $ = (s, r=document)=>r.querySelector(s);
  const $$ = (s, r=document)=>Array.from(r.querySelectorAll(s));
  const clamp = (n, lo, hi)=>{ const v=Number(n); if(!Number.isFinite(v)) return lo; return Math.max(lo, Math.min(hi, v)); };

  function readVisible(row){
    const c = row.querySelector(SELECTORS.visCountdown);
    const k = row.querySelector(SELECTORS.visClock);
    const vis = [];
    if (c && c.checked) vis.push("countdown");
    if (k && k.checked) vis.push("clock");
    return vis; // kan være []
  }

  function val(row, sel, d=""){
    const el = row.querySelector(sel);
    if (!el) return d;
    if (el.type === "checkbox") return !!el.checked;
    const v = el.value ?? d;
    return typeof v === "string" ? v.trim() : v;
  }

  function rowToOverlay(row, idx){
    const id  = val(row, SELECTORS.id) || row.dataset.overlayId || `logo-${idx+1}`;
    const url = val(row, SELECTORS.url, "");
    const pos = (val(row, SELECTORS.position, "top-right") || "top-right").toLowerCase();
    const size = clamp(val(row, SELECTORS.size, 12), 2, 200);
    const opac = clamp(val(row, SELECTORS.opacity, 1), 0, 1);
    const offx = Number(val(row, SELECTORS.offx, 2));
    const offy = Number(val(row, SELECTORS.offy, 2));
    const z    = parseInt(val(row, SELECTORS.z, 10), 10);
    const tcol = val(row, SELECTORS.tintColor, "#000000");
    const topa = clamp(val(row, SELECTORS.tintOpacity, 0.0), 0, 1);
    const tbl  = (val(row, SELECTORS.tintBlend, "multiply") || "multiply").toLowerCase();
    const visible_in = readVisible(row);

    return {
      id: String(id),
      type: "image",
      url: String(url),
      position: String(pos),
      size_vmin: Number(size),
      opacity: Number(opac),
      offset_vw: Number(offx),
      offset_vh: Number(offy),
      z_index: Number.isInteger(z) ? z : 10,
      visible_in, // ← kan være []
      tint: { color: String(tcol), opacity: Number(topa), blend: String(tbl) },
    };
  }

  function readAllOverlays(root=document){
    const container = $(SELECTORS.editorRoot, root) || root;
    return $$(SELECTORS.row, container).map((row, i) => rowToOverlay(row, i));
  }

  async function saveOverlays(){
    const overlays = readAllOverlays(document);
    const patch = { overlays, overlays_mode: "replace" };
    const api = window.AdminSync && window.AdminSync.postConfig;
    if (!api) throw new Error("AdminSync.postConfig mangler (last admin.js først)");
    const res = await api(patch);
    // Tips preview/andre om ny liste:
    window.dispatchEvent(new CustomEvent("overlays:updated", { detail: overlays }));
    return res;
  }

  function bindEditor(){
    const container = $(SELECTORS.editorRoot) || document;

    // Endringer i inputs → lagre
    container.addEventListener("change", (e) => {
      if (!(e.target instanceof HTMLElement)) return;
      if (e.target.closest(SELECTORS.row)) {
        saveOverlays().catch(err => console.error("Lagring overlays feilet:", err));
      }
    });

    // Knapper (add/dup/slett/lagre) → lagre etter DOM-oppdatering
    container.addEventListener("click", (e) => {
      if (!(e.target instanceof HTMLElement)) return;
      if (
        e.target.matches(SELECTORS.btnSaveAll) ||
        e.target.matches(SELECTORS.btnDup) ||
        e.target.matches(SELECTORS.btnDel) ||
        e.target.matches(SELECTORS.btnAdd)
      ) {
        setTimeout(() => { saveOverlays().catch(err => console.error(err)); }, 0);
      }
    });

    // MutationObserver: fanger slett/dupliser som manipulerer DOM direkte
    const mo = new MutationObserver((muts) => {
      let change = false;
      for (const m of muts) {
        if (m.type === "childList" && (m.addedNodes.length || m.removedNodes.length)) { change = true; break; }
      }
      if (change) setTimeout(() => { saveOverlays().catch(err => console.error(err)); }, 16);
    });
    mo.observe(container, { childList: true, subtree: true });
  }

  function init(){ bindEditor(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();
})();
