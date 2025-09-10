/* static/app.js
   Jevn nedtelling: klienten slewer små tidsavvik i stedet for å hoppe.
   Endre terskler nederst i CFG om ønskelig. */

(function(){
  // --- Klientkonfig (juster ved behov) ---
  var CFG = {
    syncIntervalMs: 7500,          // sjeldnere sync
    smallSlewThresholdMs: 120,     // små avvik slewes
    bigJumpThresholdMs: 1500,      // store avvik hoppes
    slewWindowMs: 5000,            // hvor lenge små avvik fordeles
    midSlewWindowMs: 2000,         // medium avvik
    targetChangeThresholdMs: 1000, // ignorér små «bevegelser» i target
    paintIntervalMs: 200
  };

  // --- DOM ---
  var clockEl = document.getElementById('clock');
  var msg1 = document.getElementById('msg1');
  var msg2 = document.getElementById('msg2');

  // --- Tilstand ---
  var cfg = null;
  var syncTimer = null;
  var paintTimer = null;
  var cfgTimer = null;

  // Tid/offset
  var offsetMs = 0;        // serverNow - clientNow (glattes)
  var pendingSlewMs = 0;   // rest som skal slewes
  var slewEndPerf = 0;     // når slewing skal være ferdig
  var lastPaintPerf = performance.now();

  // Serverfelt
  var targetMs = 0;
  var warnMs = 0;
  var alertMs = 0;
  var overrunMs = 0;
  var blinkSeconds = 10;

  function setMode(mode){ document.body.setAttribute('data-mode', mode); } // normal|warn|alert|over|ended
  function setBlink(on){ document.body.setAttribute('data-blink', on ? '1' : '0'); }

  async function getJSON(url){
    const r = await fetch(url, {cache:'no-store'});
    if (!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }

  function loadConfig(){
    return getJSON('/api/config').then(function(json){
      cfg = json.config || json;
      if (cfg.show_message_primary) {
        msg1.textContent = String(cfg.message_primary || '');
        msg1.style.display = '';
      } else { msg1.textContent = ''; msg1.style.display = 'none'; }
    }).catch(function(){});
  }

  function applySlewScheduling(newOffset){
    var delta = newOffset - offsetMs;

    // Hvorfor: smoothe små forskjeller for å unngå visuell hakk.
    if (Math.abs(delta) <= CFG.smallSlewThresholdMs) {
      pendingSlewMs = delta;
      slewEndPerf = performance.now() + CFG.slewWindowMs;
      return;
    }

    // Medium avvik → kortere slew
    if (Math.abs(delta) < CFG.bigJumpThresholdMs) {
      pendingSlewMs = delta;
      slewEndPerf = performance.now() + CFG.midSlewWindowMs;
      return;
    }

    // Store avvik → hopp
    offsetMs = newOffset;
    pendingSlewMs = 0;
    slewEndPerf = 0;
  }

  function syncTick(){
    getJSON('/tick').then(function(t){
      // Beregn ny anbefalt offset
      var newOffset = Number(t.now_ms || 0) - Date.now();
      applySlewScheduling(newOffset);

      // Oppdater terskler/konstanter
      warnMs = Number(t.warn_ms || 0);
      alertMs = Number(t.alert_ms || 0);
      overrunMs = Number(t.overrun_ms || 0);
      blinkSeconds = (cfg && typeof cfg.blink_seconds === 'number') ? cfg.blink_seconds : 10;

      // Oppdater targetMs kun ved reell endring (unngå mikrojitter)
      var tm = Number(t.target_ms || 0);
      if (targetMs === 0 || Math.abs(tm - targetMs) > CFG.targetChangeThresholdMs) {
        targetMs = tm;
      }

      // Sekundær melding med HH:MM
      if (cfg && cfg.show_message_secondary) {
        var base = String(cfg.message_secondary || '');
        var hhmm = t.target_hhmm ? String(t.target_hhmm) : '';
        msg2.textContent = base + (hhmm ? ' ' + hhmm : '');
        msg2.style.display = '';
      } else {
        msg2.textContent = '';
        msg2.style.display = 'none';
      }
    }).catch(function(){});
  }

  function nowMs(){
    // Slew: gradvis flytt offset
    var nowPerf = performance.now();
    var dt = nowPerf - lastPaintPerf;
    lastPaintPerf = nowPerf;

    if (pendingSlewMs !== 0) {
      var remaining = Math.max(1, slewEndPerf - nowPerf);
      var rate = pendingSlewMs / remaining;     // ms korr per ms
      var add = rate * dt;
      if (Math.sign(add) !== Math.sign(pendingSlewMs) || Math.abs(add) >= Math.abs(pendingSlewMs)) {
        offsetMs += pendingSlewMs;              // ferdig
        pendingSlewMs = 0;
      } else {
        pendingSlewMs -= add;
        offsetMs += add;
      }
    }
    return Date.now() + offsetMs;
  }

  function paint(){
    var n = nowMs();
    var rem = targetMs > 0 ? (targetMs - n) : 0;

    var mode = 'ended';
    var show = 0;
    var blink = false;

    if (targetMs <= 0) {/* static/app.js — jevn klokke (slew) + minus-prefiks i overrun */
(function(){
  var CFG = {
    syncIntervalMs: 7500,
    smallSlewThresholdMs: 120,
    bigJumpThresholdMs: 1500,
    slewWindowMs: 5000,
    midSlewWindowMs: 2000,
    targetChangeThresholdMs: 1000,
    paintIntervalMs: 200
  };

  var clockEl = document.getElementById('clock');
  var msg1 = document.getElementById('msg1');
  var msg2 = document.getElementById('msg2');

  var cfg = null;
  var syncTimer = null, paintTimer = null, cfgTimer = null;

  var offsetMs = 0, pendingSlewMs = 0, slewEndPerf = 0;
  var lastPaintPerf = performance.now();

  var targetMs = 0, warnMs = 0, alertMs = 0, overrunMs = 0, blinkSeconds = 10;

  function setMode(mode){ document.body.setAttribute('data-mode', mode); }
  function setBlink(on){ document.body.setAttribute('data-blink', on ? '1' : '0'); }

  async function getJSON(url){
    const r = await fetch(url, {cache:'no-store'});
    if (!r.ok) throw new Error('HTTP '+r.status);
    return r.json();
  }

  function loadConfig(){
    return getJSON('/api/config').then(function(json){
      cfg = json.config || json;
      if (cfg.show_message_primary) {
        msg1.textContent = String(cfg.message_primary || '');
        msg1.style.display = '';
      } else { msg1.textContent = ''; msg1.style.display = 'none'; }
    }).catch(function(){});
  }

  function applySlewScheduling(newOffset){
    var delta = newOffset - offsetMs;
    if (Math.abs(delta) <= CFG.smallSlewThresholdMs) {
      pendingSlewMs = delta; slewEndPerf = performance.now() + CFG.slewWindowMs; return;
    }
    if (Math.abs(delta) < CFG.bigJumpThresholdMs) {
      pendingSlewMs = delta; slewEndPerf = performance.now() + CFG.midSlewWindowMs; return;
    }
    offsetMs = newOffset; pendingSlewMs = 0; slewEndPerf = 0; // stor feil → hopp
  }

  function syncTick(){
    getJSON('/tick').then(function(t){
      var newOffset = Number(t.now_ms || 0) - Date.now();
      applySlewScheduling(newOffset);

      warnMs = Number(t.warn_ms || 0);
      alertMs = Number(t.alert_ms || 0);
      overrunMs = Number(t.overrun_ms || 0);
      blinkSeconds = (cfg && typeof cfg.blink_seconds === 'number') ? cfg.blink_seconds : 10;

      var tm = Number(t.target_ms || 0);
      if (targetMs === 0 || Math.abs(tm - targetMs) > CFG.targetChangeThresholdMs) {
        targetMs = tm;
      }

      if (cfg && cfg.show_message_secondary) {
        var base = String(cfg.message_secondary || '');
        var hhmm = t.target_hhmm ? String(t.target_hhmm) : '';
        msg2.textContent = base + (hhmm ? ' ' + hhmm : '');
        msg2.style.display = '';
      } else { msg2.textContent = ''; msg2.style.display = 'none'; }
    }).catch(function(){});
  }

  function nowMs(){
    var nowPerf = performance.now();
    var dt = nowPerf - lastPaintPerf; lastPaintPerf = nowPerf;

    if (pendingSlewMs !== 0) {
      var remaining = Math.max(1, slewEndPerf - nowPerf);
      var rate = pendingSlewMs / remaining;
      var add = rate * dt;
      if (Math.sign(add) !== Math.sign(pendingSlewMs) || Math.abs(add) >= Math.abs(pendingSlewMs)) {
        offsetMs += pendingSlewMs; pendingSlewMs = 0;
      } else {
        pendingSlewMs -= add; offsetMs += add;
      }
    }
    return Date.now() + offsetMs;
  }

  function paint(){
    var n = nowMs();
    var rem = targetMs > 0 ? (targetMs - n) : 0;

    var mode = 'ended', show = 0, blink = false, sign = '';
    if (targetMs <= 0) {
      mode = 'ended'; show = 0;
    } else if (rem > 0) {
      show = rem;
      mode = rem <= alertMs ? 'alert' : (rem <= warnMs ? 'warn' : 'normal');
      blink = rem <= (blinkSeconds * 1000);
    } else if (-rem <= overrunMs) {
      show = -rem; mode = 'over'; sign = '-';
    } else {
      show = 0; mode = 'ended';
    }

    var totalSec = Math.max(0, Math.floor(show / 1000));
    var mm = Math.floor(totalSec / 60);
    var ss = totalSec % 60;
    clockEl.textContent = sign + (mm<10?'0'+mm:mm) + ':' + (ss<10?'0'+ss:ss);

    setMode(mode);
    setBlink(!!blink);
  }

  loadConfig().finally(function(){
    if (paintTimer) clearInterval(paintTimer);
    paintTimer = setInterval(paint, CFG.paintIntervalMs);

    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(syncTick, CFG.syncIntervalMs);
    syncTick();

    if (cfgTimer) clearInterval(cfgTimer);
    cfgTimer = setInterval(function(){ loadConfig(); }, 10_000);
  });
})();

      mode = 'ended'; show = 0;
    } else if (rem > 0) {
      show = rem;
      mode = rem <= alertMs ? 'alert' : (rem <= warnMs ? 'warn' : 'normal');
      blink = rem <= (blinkSeconds * 1000);
    } else if (-rem <= overrunMs) {
      show = -rem;
      mode = 'over';
    } else {
      show = 0;
      mode = 'ended';
    }

    var totalSec = Math.max(0, Math.floor(show / 1000));
    var mm = Math.floor(totalSec / 60);
    var ss = totalSec % 60;
    clockEl.textContent = (mm<10?'0'+mm:mm) + ':' + (ss<10?'0'+ss:ss);

    setMode(mode);
    setBlink(!!blink);
  }

  // Oppstart
  loadConfig().finally(function(){
    if (paintTimer) clearInterval(paintTimer);
    paintTimer = setInterval(paint, CFG.paintIntervalMs);

    if (syncTimer) clearInterval(syncTimer);
    syncTimer = setInterval(syncTick, CFG.syncIntervalMs);
    syncTick();

    if (cfgTimer) clearInterval(cfgTimer);
    cfgTimer = setInterval(function(){ loadConfig(); }, 10_000);
  });
})();
