/* /home/reidar/countdown/static/app.js — server-clock synced, stable rendering */
(function(){
  var clockEl = document.getElementById('clock');
  var msg1 = document.getElementById('msg1');
  var msg2 = document.getElementById('msg2');

  var cfg = null;
  var snapshot = null;
  var es = null;
  var pollTimer = null;
  var refreshTimer = null;

  // offset slik at (Date.now() + serverOffsetMs) ≈ serverens nåtid (ms)
  var serverOffsetMs = 0;
  function syncOffsetFromState(s){
    if (!s || typeof s.now_ms !== 'number') return;
    // enkel glatting for å unngå jitter
    var estimate = s.now_ms - Date.now();
    serverOffsetMs = (serverOffsetMs === 0) ? estimate : (serverOffsetMs*0.9 + estimate*0.1);
  }

  function pad(n){ return n < 10 ? '0' + n : '' + n; }
  function setMode(mode){ document.body.setAttribute('data-mode', mode); }
  function setBlink(on){ document.body.setAttribute('data-blink', on ? '1' : '0'); }

  function setMessagesFromConfig(){
    if(!cfg) return;
    if (cfg.show_message_primary) {
      msg1.textContent = String(cfg.message_primary || '');
      msg1.style.display = '';
    } else { msg1.textContent = ''; msg1.style.display = 'none'; }

    var base = cfg.show_message_secondary ? String(cfg.message_secondary || '') : '';
    var hhmm = (snapshot && snapshot.target_ms)
      ? new Date(snapshot.target_ms).toLocaleTimeString('nb-NO', {hour:'2-digit', minute:'2-digit'})
      : '';
    msg2.textContent = cfg.show_message_secondary ? (base + (hhmm ? ' ' + hhmm : '')) : '';
    msg2.style.display = cfg.show_message_secondary ? '' : 'none';
  }

  function getJSON(url, cb){
    if (window.fetch) {
      window.fetch(url, {cache:'no-store'})
        .then(function(r){ return r.json(); })
        .then(function(j){ cb(null, j); })
        .catch(function(e){ cb(e); });
    } else {
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.setRequestHeader('Accept','application/json');
      xhr.onreadystatechange = function(){
        if (xhr.readyState === 4){
          if (xhr.status >= 200 && xhr.status < 300){
            try { cb(null, JSON.parse(xhr.responseText)); } catch(e){ cb(e); }
          } else { cb(new Error('HTTP '+xhr.status)); }
        }
      };
      xhr.send();
    }
  }

  function loadConfig(cb){
    getJSON('/api/config', function(err, json){
      if (!err) cfg = json.config || json;
      if (cb) cb(err);
    });
  }
  function loadState(cb){
    getJSON('/state', function(err, s){
      if (!err) {
        snapshot = s;
        syncOffsetFromState(s);
      }
      if (cb) cb(err);
    });
  }
  function initLoad(cb){ loadConfig(function(){ loadState(function(){ setMessagesFromConfig(); renderOnce(); if (cb) cb(); }); }); }

  function getOverrunMs(){
    if (snapshot && typeof snapshot.overrun_ms === 'number') return snapshot.overrun_ms;
    if (cfg && typeof cfg.overrun_minutes !== 'undefined') {
      var m = parseInt(cfg.overrun_minutes, 10);
      if (isFinite(m) && m >= 0) return m * 60 * 1000;
    }
    return 5 * 60 * 1000;
  }

  function renderOnce(){
    if (!snapshot) return;

    // remaining = target_ms - server_now_estimate
    var targetMs = (typeof snapshot.target_ms === 'number') ? snapshot.target_ms : 0;
    var serverNow = Date.now() + serverOffsetMs;
    var rem = targetMs ? (targetMs - serverNow) : 0;

    var warn = (typeof snapshot.warn_ms === 'number') ? snapshot.warn_ms : (3*60*1000);
    var alert = (typeof snapshot.alert_ms === 'number') ? snapshot.alert_ms : (1*60*1000);
    var overMs = getOverrunMs();

    var dispMs, inOverrun = false, isEnded = false;

    if (rem <= 0) {
      var overSoFar = -rem; // positivt
      if (overSoFar <= overMs) {
        inOverrun = true;
        dispMs = overMs - overSoFar; // teller NED til 0 i minus-vindu
      } else {
        isEnded = true;
        dispMs = 0;
      }
    } else {
      dispMs = rem;
    }

    var totalSec = Math.max(0, Math.floor(dispMs / 1000));
    var mm = Math.floor(totalSec / 60);
    var ss = totalSec % 60;
    clockEl.textContent = (mm<10?'0'+mm:mm) + ':' + (ss<10?'0'+ss:ss);

    // farger + blink
    setBlink(false);
    if (isEnded) { setMode('ended'); return; }
    if (inOverrun){ setMode('over'); return; }

    if (rem <= alert) setMode('alert');
    else if (rem <= warn) setMode('warn');
    else setMode('normal');

    var blinkSec = (cfg && typeof cfg.blink_seconds !== 'undefined') ? Math.max(0, parseInt(cfg.blink_seconds,10)) : 15;
    if (rem > 0 && rem <= blinkSec * 1000) setBlink(true);
  }

  function startSSE(){
    if (pollTimer) { clearInterval(pollTimer); pollTimer=null; }
    if (!window.EventSource) { startPolling(); return; }
    if (es) try { es.close(); } catch(_){}
    es = new EventSource('/sse');

    es.onmessage = function(ev){
      if (!ev.data) return;
      try {
        var msg = JSON.parse(ev.data);
        if (msg && msg.type === 'config_update') {
          // Hent alltid fersk config + state for å unngå heng
          loadConfig(function(){ loadState(function(){ setMessagesFromConfig(); renderOnce(); }); });
        }
      } catch(e){ /* keepalives/kommentarer */ }
    };
    es.onerror = function(){
      try { es.close(); } catch(_){}
      startPolling();
    };
  }

  function startPolling(){
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(function(){
      loadState(function(err){ if (!err) renderOnce(); });
    }, 1000);
  }

  // sikkerhetsnett: hver 15. sek – last config+state på nytt
  function startPeriodicRefresh(){
    if (refreshTimer) clearInterval(refreshTimer);
    refreshTimer = setInterval(function(){
      loadConfig(function(){ loadState(function(){ setMessagesFromConfig(); renderOnce(); }); });
    }, 15000);
  }

  // jevn render
  setInterval(renderOnce, 200);

  // oppstart
  initLoad(function(){ startSSE(); startPeriodicRefresh(); });
})();
