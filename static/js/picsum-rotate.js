// static/js/picsum-rotate.js
(() => {
  "use strict";

  // --- Konfig ---------------------------------------------------------------
  const API_URL = "/api/picsum/next";
  const POLL_FAST_MS = 1000; // poll hvert sekund (backend avgjør når bytte skjer)
  const POLL_SLOW_MS = 5000; // tregere når auto-rotate er av/slått av i cfg
  const MAX_DIM = 4000;      // unngå ekstremt store bilder

  // --- State ---------------------------------------------------------------
  let currentId = null;
  let lastAppliedUrl = "";
  let lastOpts = { fit: "cover", grayscale: false, blur: 0, tint: { color: "#000000", opacity: 0 } };

  // --- DOM: bakgrunnslag + tint --------------------------------------------
  const LAYER_ID = "bg-picsum-layer";
  const TINT_ID  = "bg-picsum-tint";

  function ensureLayers() {
    let layer = document.getElementById(LAYER_ID);
    if (!layer) {
      layer = document.createElement("div");
      layer.id = LAYER_ID;
      Object.assign(layer.style, {
        position: "fixed",
        inset: "0",
        zIndex: "-1",            // under alt innhold; justér ved behov
        pointerEvents: "none",
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center center",
        backgroundSize: "cover",
        transition: "background-image .25s ease, opacity .25s ease",
      });
      document.body.appendChild(layer);
    }

    let tint = document.getElementById(TINT_ID);
    if (!tint) {
      tint = document.createElement("div");
      tint.id = TINT_ID;
      Object.assign(tint.style, {
        position: "fixed",
        inset: "0",
        zIndex: "0",             // over bildet, under øvrig UI om du har annen layout
        pointerEvents: "none",
        backgroundColor: "transparent",
        transition: "background-color .25s ease, opacity .25s ease",
      });
      document.body.appendChild(tint);
    }
    return { layer, tint };
  }

  // --- Utils ----------------------------------------------------------------
  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  function hexToRGBA(hex, alpha) {
    // #RRGGBB -> rgba(r,g,b,alpha)
    const s = String(hex || "").trim();
    const m = /^#?([0-9a-f]{6})$/i.exec(s);
    if (!m) return `rgba(0,0,0,${clamp(Number(alpha) || 0, 0, 1)})`;
    const i = parseInt(m[1], 16);
    const r = (i >> 16) & 255, g = (i >> 8) & 255, b = i & 255;
    return `rgba(${r}, ${g}, ${b}, ${clamp(Number(alpha) || 0, 0, 1)})`;
  }

  function currentViewportSize() {
    const dpr = Math.max(1, Math.min(window.devicePixelRatio || 1, 3));
    const w = clamp(Math.ceil((window.innerWidth || 1280) * dpr), 320, MAX_DIM);
    const h = clamp(Math.ceil((window.innerHeight || 720) * dpr), 240, MAX_DIM);
    return { w, h };
  }

  function buildPicsumUrl(id, opts) {
    const { w, h } = currentViewportSize();
    const params = [];
    if (opts.grayscale) params.push("grayscale");
    const blurN = clamp(parseInt(opts.blur || 0, 10) || 0, 0, 10);
    if (blurN > 0) params.push(`blur=${blurN}`);
    const qs = params.length ? `?${params.join("&")}` : "";
    return `https://picsum.photos/id/${id}/${w}/${h}${qs}`;
  }

  // --- Hent siste fullstendige config for visuelle detaljer -----------------
  // Tips: vi henter cfg sjeldent (ved start + når vi faktisk oppdaterer bilde),
  // for å få med fit/grayscale/blur/tint fra backenden.
  async function fetchCurrentConfig() {
    try {
      const r = await fetch("/api/config", { cache: "no-store" });
      const js = await r.json();
      const picsum = js?.config?.theme?.background?.picsum || {};
      const fit = (picsum.fit === "contain") ? "contain" : "cover";
      const grayscale = !!picsum.grayscale;
      const blur = clamp(parseInt(picsum.blur || 0, 10) || 0, 0, 10);
      const tint = picsum.tint || { color: "#000000", opacity: 0 };
      return { fit, grayscale, blur, tint };
    } catch {
      // Fallback: bruk forrige opts
      return lastOpts;
    }
  }

  // --- Anvend bakgrunn -------------------------------------------------------
  async function applyBackground(id) {
    const { layer, tint } = ensureLayers();
    // hent siste visuelle prefs
    lastOpts = await fetchCurrentConfig();

    const url = buildPicsumUrl(id, lastOpts);
    const size = lastOpts.fit === "contain" ? "contain" : "cover";

    // pre-load for å unngå “blink”
    try {
      await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = resolve;
        img.onerror = reject;
        img.referrerPolicy = "no-referrer";
        img.src = url;
      });
    } catch {
      // Selv ved feil – sett URL likevel; Picsum leverer ofte fallback
    }

    layer.style.backgroundImage = `url("${url}")`;
    layer.style.backgroundSize = size;

    // tint
    const rgba = hexToRGBA(lastOpts.tint?.color || "#000000", lastOpts.tint?.opacity || 0);
    tint.style.backgroundColor = rgba;

    lastAppliedUrl = url;
    currentId = id;
  }

  // --- Polling ---------------------------------------------------------------
  let pollTimer = null;

  function schedule(ms) {
    clearTimeout(pollTimer);
    pollTimer = setTimeout(tick, ms);
  }

  async function tick() {
    try {
      const r = await fetch(API_URL, { cache: "no-store" });
      const js = await r.json();

      // Forventet payload:
      // { ok, id, enabled, interval_seconds, next_in_seconds, updated }
      if (!js || js.ok === false) {
        schedule(POLL_SLOW_MS);
        return;
      }

      // Hvis auto-rotate er av, poll sjeldnere
      if (!js.enabled) {
        schedule(POLL_SLOW_MS);
        return;
      }

      // Når backend sier “updated: true” – bytt bilde nå
      if (js.updated && Number.isFinite(js.id) && js.id > 0) {
        if (js.id !== currentId) {
          await applyBackground(js.id);
        }
        // etter bytte: vent hele intervallet
        const wait = clamp(parseInt(js.interval_seconds || 0, 10) * 1000 || POLL_FAST_MS, 1000, 24 * 60 * 60 * 1000);
        schedule(wait);
        return;
      }

      // Ikke oppdatert ennå: poll oftere. Hvis next_in_seconds er oppgitt,
      // poll litt “tighter” mot slutten.
      const nextIn = clamp(parseInt(js.next_in_seconds || 0, 10) || 0, 0, 24 * 60 * 60);
      if (nextIn > 3) {
        // lang vei igjen – spar litt CPU/nett
        schedule(POLL_SLOW_MS);
      } else {
        // snart bytte – poll raskt
        schedule(POLL_FAST_MS);
      }

      // Hvis vi ikke har bilde enda (f.eks. ved første start), og backend gir id,
      // men updated=false: bruk id uten å vente.
      if (!currentId && Number.isFinite(js.id) && js.id > 0) {
        await applyBackground(js.id);
      }
    } catch {
      // Nett/JSON-feil: prøv igjen etter en liten stund
      schedule(POLL_SLOW_MS);
    }
  }

  // --- Responssiv oppskalering ved resize/DPR-endring -----------------------
  let resizeTimer = null;
  function onResize() {
    if (!currentId || !lastAppliedUrl) return;
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(() => applyBackground(currentId).catch(() => {}), 250);
  }
  window.addEventListener("resize", onResize);
  // Ikke pålitelig å “lytte” på DPR, men et periodisk sanity-reload skader ikke.
  setInterval(() => {
    if (!currentId) return;
    const { w, h } = currentViewportSize();
    // hvis URL-størrelse er utdatert, re-appliser
    if (!lastAppliedUrl.includes(`/${w}/${h}`)) {
      applyBackground(currentId).catch(() => {});
    }
  }, 5000);

  // --- Start ---------------------------------------------------------------
  // Sørg for at lag finnes (og står under annet innhold)
  ensureLayers();
  // Start polling
  tick();
})();
