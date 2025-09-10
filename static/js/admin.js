// static/js/admin.js
import { ui } from '/static/js/ui.js';

const state = { password: '' };

function v(id){ return ui.qs('#'+id); }
function valNum(id, d=0){ const n = Number(v(id).value); return Number.isFinite(n) ? n : d; }

async function loadConfig(){
  const res = await ui.get('/api/config');
  const cfg = res.config || res;

  v('show_primary').checked = !!cfg.show_message_primary;
  v('show_secondary').checked = !!cfg.show_message_secondary;
  v('msg_primary').value = cfg.message_primary || '';
  v('msg_secondary').value = cfg.message_secondary || '';

  v('warn_minutes').value = cfg.warn_minutes ?? 4;
  v('alert_minutes').value = cfg.alert_minutes ?? 2;
  v('blink_seconds').value = cfg.blink_seconds ?? 10;
  v('overrun_minutes').value = cfg.overrun_minutes ?? 1;

  const hasDaily = !!cfg.daily_time;
  v('daily_time').value = hasDaily ? cfg.daily_time : '';
  v('mode-daily').checked = hasDaily;
  v('mode-single').checked = !hasDaily;

  // naive ISO → datetime-local
  const iso = cfg.target_datetime || cfg.target_iso || '';
  if (iso) {
    try {
      const dt = new Date(iso);
      const off = dt.getTimezoneOffset();
      const local = new Date(dt.getTime() - off*60000);
      v('single_dt').value = local.toISOString().slice(0,16);
    } catch {}
  } else {
    v('single_dt').value = '';
  }

  v('cfg-path').textContent = res.__config_path || '(ukjent sti)';
}

function collectPatch(){
  const patch = {
    show_message_primary: v('show_primary').checked,
    show_message_secondary: v('show_secondary').checked,
    message_primary: v('msg_primary').value,
    message_secondary: v('msg_secondary').value,
    warn_minutes: valNum('warn_minutes', 4),
    alert_minutes: valNum('alert_minutes', 2),
    blink_seconds: valNum('blink_seconds', 10),
    overrun_minutes: valNum('overrun_minutes', 1),
  };

  const mode = v('mode-daily').checked ? 'daily' : 'single';
  if (mode === 'daily') {
    const hhmm = v('daily_time').value;
    patch.daily_time = hhmm || '';
    patch.target_datetime = "__clear__"; // rydde engangstidspunkt
  } else {
    patch.daily_time = "";
    const sdt = v('single_dt').value; // "YYYY-MM-DDTHH:MM"
    if (sdt) patch.target_datetime = sdt;
  }
  return patch;
}

async function saveChanges(){
  state.password = v('admin_password').value || '';
  const patch = collectPatch();
  await ui.post('/api/config', patch, { password: state.password });
  ui.toast('Lagret', 'ok');
  await loadConfig();
}

async function startNow(minutes){
  state.password = v('admin_password').value || '';
  const m = Number(minutes ?? v('start_minutes').value || 0);
  if (!Number.isFinite(m) || m <= 0) { ui.toast('Ugyldig varighet', 'bad'); return; }
  await ui.post('/api/start', { minutes: Math.floor(m) }, { password: state.password });
  ui.toast('Startet +' + Math.floor(m) + ' min', 'ok');
}

function init(){
  ui.activateNav('/admin');

  v('btn-load').addEventListener('click', () => loadConfig().then(()=>ui.toast('Oppdatert', 'ok')).catch(e=>ui.toast(e.message||String(e),'bad')));
  v('btn-save').addEventListener('click', () => saveChanges().catch(e=>ui.toast(e.message||String(e),'bad')));
  v('start_now').addEventListener('click', () => startNow().catch(e=>ui.toast(e.message||String(e),'bad')));
  document.querySelectorAll('button[data-qs]').forEach(b => b.addEventListener('click', () => startNow(b.getAttribute('data-qs')).catch(e=>ui.toast(e.message||String(e),'bad'))));

  loadConfig().catch(e=>ui.toast(e.message||String(e),'bad'));
}
document.addEventListener('DOMContentLoaded', init, { once:true });
