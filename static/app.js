/* static/app.js — dum klient: poll /tick hvert 250 ms og tegn */
(function(){
  var clockEl = document.getElementById('clock');
  var msg1 = document.getElementById('msg1');
  var msg2 = document.getElementById('msg2');

  var cfg = null;
  var pollTimer = null;
  var cfgTimer = null;

  function pad(n){ return n < 10 ? '0' + n : '' + n; }
  function setMode(mode){ document.body.setAttribute('data-mode', mode); } // normal|warn|alert|over|ended
  function setBlink(on){ document.body.setAttribute('data-blink', on ? '1' : '0'); }

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
      if (!err) {
        cfg = json.config || json;
        // Meldinger
        if (cfg.show_message_primary) {
          msg1.textContent = String(cfg.message_primary || '');
          msg1.style.display = '';
        } else { msg1.textContent = ''; msg1.style.display = 'none'; }
      }
      if (cb) cb(err);
    });
  }

  function pollTick(){
    getJSON('/tick', function(err, t){
      if (err || !t) return;

      // Sekundær melding: viser alltid target_hhmm fra server
      if (cfg && cfg.show_message_secondary) {
        var base = String(cfg.message_secondary || '');
        var hhmm = t.target_hhmm ? String(t.target_hhmm) : '';
        msg2.textContent = base + (hhmm ? ' ' + hhmm : '');
        msg2.style.display = '';
      } else {
        msg2.textContent = '';
        msg2.style.display = 'none';
      }

      // Klokke
      var totalSec = Math.max(0, Math.floor((t.display_ms || 0) / 1000));
      var mm = Math.floor(totalSec / 60);
      var ss = totalSec % 60;
      clockEl.textContent = (mm<10?'0'+mm:mm) + ':' + (ss<10?'0'+ss:ss);

      // Farge/blink
      setMode(t.mode || 'ended');
      setBlink(!!t.blink);
    });
  }

  // Start polle-løkker
  loadConfig(function(){
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollTick, 250);   // skjermoppdatering

    if (cfgTimer) clearInterval(cfgTimer);
    cfgTimer = setInterval(function(){ loadConfig(function(){}); }, 5000); // hyppigere tekst-refresh
  });

})();
