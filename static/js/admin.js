// static/js/admin.js
import { ui } from '/static/js/ui.js';

(function(){
  function el(id){ return document.getElementById(id); }
  function val(id){ var e=el(id); return e?e.value:''; }
  function setVal(id, v){ var e=el(id); if(e) e.value = v; }
  function setChecked(id, on){ var e=el(id); if(e) e.checked = !!on; }
  function numOr(v, d){ var n = Number(v); return isFinite(n) ? n : d; }

  var state = { password: '' };

  function loadConfig(){
    return ui.get('/api/config').then(function(resp){
      var cfg = resp.config || resp;

      setChecked('show_primary', !!cfg.show_message_primary);
      setChecked('show_secondary', !!cfg.show_message_secondary);
      setVal('msg_primary', String(cfg.message_primary || ''));
      setVal('msg_secondary', String(cfg.message_secondary || ''));

      setVal('warn_minutes',    String(isFinite(cfg.warn_minutes)    ? cfg.warn_minutes    : 4));
      setVal('alert_minutes',   String(isFinite(cfg.alert_minutes)   ? cfg.alert_minutes   : 2));
      setVal('blink_seconds',   String(isFinite(cfg.blink_seconds)   ? cfg.blink_seconds   : 10));
      setVal('overrun_minutes', String(isFinite(cfg.overrun_minutes) ? cfg.overrun_minutes : 1));

      var hasDaily = !!cfg.daily_time;
      el('mode-daily').checked = hasDaily;
      el('mode-single').checked = !hasDaily;
      setVal('daily_time', hasDaily ? (cfg.daily_time || '') : '');

      var iso = cfg.target_datetime || cfg.target_iso || '';
      if (iso) {
        try {
          var dt = new Date(iso);
          var off = dt.getTimezoneOffset();
          var local = new Date(dt.getTime() - off*60000);
          setVal('single_dt', local.toISOString().slice(0,16));
        } catch(e) { setVal('single_dt', ''); }
      } else {
        setVal('single_dt', '');
      }

      var badge = document.getElementById('cfg-path');
      if (badge) badge.textContent = resp.__config_path || '(ukjent sti)';

      ui.toast('Konfig lastet', 'ok');
    }).catch(function(err){
      ui.toast('Kunne ikke laste /api/config: ' + (err && err.message ? err.message : String(err)), 'bad');
    });
  }

  function collectPatch(){
    var patch = {
      show_message_primary:   !!el('show_primary').checked,
      show_message_secondary: !!el('show_secondary').checked,
      message_primary:  val('msg_primary'),
      message_secondary: val('msg_secondary'),
      warn_minutes:    numOr(val('warn_minutes'), 4),
      alert_minutes:   numOr(val('alert_minutes'), 2),
      blink_seconds:   numOr(val('blink_seconds'), 10),
      overrun_minutes: numOr(val('overrun_minutes'), 1),
    };

    var daily = !!el('mode-daily').checked;
    if (daily) {
      patch.daily_time = val('daily_time') || '';
      patch.target_datetime = '__clear__'; // rydder engangsmål
    } else {
      patch.daily_time = '';
      var sdt = val('single_dt');
      if (sdt) patch.target_datetime = sdt;
    }
    return patch;
  }

  function saveChanges(){
    state.password = val('admin_password') || '';
    var patch = collectPatch();
    return ui.post('/api/config', patch, { password: state.password })
      .then(function(){ ui.toast('Lagret', 'ok'); return loadConfig(); })
      .catch(function(err){ ui.toast('Lagre feilet: ' + (err && err.message ? err.message : String(err)), 'bad'); });
  }

  function startNow(minutes){
    state.password = val('admin_password') || '';
    var m = minutes != null ? Number(minutes) : Number(val('start_minutes'));
    if (!isFinite(m) || m <= 0) { ui.toast('Ugyldig varighet', 'bad'); return Promise.resolve(); }
    return ui.post('/api/start-duration', { minutes: Math.floor(m) }, { password: state.password })
      .then(function(){ ui.toast('Startet +' + Math.floor(m) + ' min', 'ok'); })
      .catch(function(err){ ui.toast('Start feilet: ' + (err && err.message ? err.message : String(err)), 'bad'); });
  }

  function wire(){
    var btnLoad = el('btn-load');
    var btnSave = el('btn-save');
    var btnStart = el('start_now');

    if (btnLoad) btnLoad.addEventListener('click', function(){ loadConfig(); });
    if (btnSave) btnSave.addEventListener('click', function(){ saveChanges(); });
    if (btnStart) btnStart.addEventListener('click', function(){ startNow(); });

    Array.prototype.forEach.call(document.querySelectorAll('button[data-qs]'), function(b){
      b.addEventListener('click', function(){
        startNow(b.getAttribute('data-qs'));
      });
    });

    // Debug
    var sbox = document.getElementById('debug-status');
    var dbgR = document.getElementById('btn-debug-refresh');
    var dbgW = document.getElementById('btn-debug-write');

    function showDebug(write){
      var url = write ? '/debug/config?write_test=1' : '/debug/config';
      fetch(url, { cache: 'no-store' })
        .then(function(r){ return r.json(); })
        .then(function(j){
          if (sbox) sbox.textContent = JSON.stringify(j, null, 2);
          ui.toast(write ? (j.write_test_ok ? 'Skrivetest: OK' : 'Skrivetest: FEIL') : 'Status oppdatert', (write && !j.write_test_ok) ? 'bad' : 'ok');
        })
        .catch(function(e){ ui.toast('Debug-feil: ' + (e && e.message ? e.message : String(e)), 'bad'); });
    }
    if (dbgR) dbgR.addEventListener('click', function(){ showDebug(false); });
    if (dbgW) dbgW.addEventListener('click', function(){ showDebug(true); });
  }

  function init(){
    ui.activateNav('/admin');
    wire();
    loadConfig();
    console.info('[admin] initialized');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    init();
  }
})();
