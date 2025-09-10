// static/js/fullscreen.js
// Viser en knapp som går til fullskjerm når nettleseren ikke allerede er i fullskjerm.
// Har ingen effekt i kiosk (allerede fullskjerm) eller når Fullscreen-API ikke støttes.

(function () {
  // --- Fullscreen helpers ----------------------------------------------------
  const doc = document;
  const de = doc.documentElement;

  function isSupported() {
    return !!(
      de.requestFullscreen ||
      de.webkitRequestFullscreen ||
      de.mozRequestFullScreen ||
      de.msRequestFullscreen
    );
  }

  function isFull() {
    return !!(
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement
    );
  }

  function reqFull() {
    const el = de;
    (el.requestFullscreen ||
      el.webkitRequestFullscreen ||
      el.mozRequestFullScreen ||
      el.msRequestFullscreen).call(el);
  }

  // --- UI --------------------------------------------------------------------
  function ensureStyle() {
    if (doc.getElementById('fs-style')) return;
    const css = `
      .fs-btn {
        position: fixed; right: 16px; bottom: 16px; z-index: 2147483000;
        padding: 10px 14px; border-radius: 12px;
        background: rgba(11, 23, 41, .85);
        color: #dbe7ff; border: 1px solid rgba(255,255,255,.12);
        font: 14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        cursor: pointer; backdrop-filter: blur(8px);
        box-shadow: 0 10px 30px rgba(0,0,0,.25);
      }
      .fs-btn:hover { background: rgba(14, 30, 54, .92); }
      .fs-hide { display: none !important; }
      @media (prefers-reduced-motion: reduce) {
        .fs-btn { transition: none; }
      }
    `;
    const s = doc.createElement('style');
    s.id = 'fs-style';
    s.textContent = css;
    doc.head.appendChild(s);
  }

  function buildButton() {
    if (doc.getElementById('fs-btn')) return doc.getElementById('fs-btn');
    const btn = doc.createElement('button');
    btn.id = 'fs-btn';
    btn.className = 'fs-btn';
    btn.type = 'button';
    btn.textContent = 'Fullskjerm';
    btn.setAttribute('aria-label', 'Gå til fullskjerm');
    btn.addEventListener('click', () => {
      try { reqFull(); } catch (e) { /* ignorer */ }
    });
    doc.body.appendChild(btn);
    return btn;
  }

  function updateVisibility() {
    // Vis kun når API støttes og vi ikke er i fullskjerm
    const show = isSupported() && !isFull();
    const btn = doc.getElementById('fs-btn');
    if (btn) btn.classList.toggle('fs-hide', !show);
  }

  function init() {
    if (!isSupported()) return; // ikke støttet → ingen UI
    ensureStyle();
    buildButton();
    updateVisibility();

    // Lytt til endringer i fullskjermstatus
    doc.addEventListener('fullscreenchange', updateVisibility);
    doc.addEventListener('webkitfullscreenchange', updateVisibility);
    doc.addEventListener('mozfullscreenchange', updateVisibility);
    doc.addEventListener('MSFullscreenChange', updateVisibility);

    // Noen nettlesere endrer høyde ved å gå/ut av FS → oppdater da også
    window.addEventListener('resize', updateVisibility);
    document.addEventListener('visibilitychange', updateVisibility);
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
