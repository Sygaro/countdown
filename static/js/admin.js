// static/js/admin.js
import { ui } from '/static/js/ui.js';

const state = { password: '' };

function el(id) { return ui.qs('#' + id); }
function toIntOr(id, d = 0) {
  const v = Number(el(id)?.value);
  return Number.isFinite(v) ? v : d;
}

async function loadConfig() {
  const resp = await ui.get('/api/config');
  const cfg = resp.config || resp;

  el('show_primary').checked = !!cfg.show_message_primary;
  el('show_secondary').checked = !!cfg.show_message_secondary;
  el('msg_primary').value = cfg.message_primary || '';
  el('msg_secondary').value = cfg.message_secondary || '';

  el('warn_minutes').value    = Number.isFinite(cfg.warn_minutes)    ? cfg.warn_minutes    : 4;
  el('alert_minutes').value   = Number.isFinite(cfg.alert_minutes)   ? cfg.alert_minutes   : 2;
  el('blink_seconds').value   = Number.isFinite(cfg.blink_seconds)   ? cfg.blink_seconds   : 10;
  el('overrun_minutes').value = Number.isFinite(cfg.overrun_minutes) ? cfg.overrun_minutes : 1;

  const hasDaily = !!cfg.daily_time;
  el('mode-daily').checked = hasDaily;
  el('mode-single').checked = !hasDaily;
  el('daily_time').value = hasDaily ? (cfg.daily_time || '') : '';

  const iso = cfg.target_datetime || cfg.target_iso || '';
  if (iso) {
    try {
      const dt = new Date(iso);
      const off = dt.getTimezoneOffset();
      const local = new Date(dt.getTime() - off * 60000);
      el('single_dt').value = local.toISOString().slice(0, 16);
    } catch { el('single_dt').value = ''; }
  } else {
    el('single_dt').value = '';
  }

  const badge = ui.qs('#cfg-path');
  if (badge) badge.textContent = resp.__config_path || '(ukjent sti)';
}

function collectPatch() {
  const patch = {
    show_message_primary:   el('show_primary').checked,
    show_message_secondary: el('show_secondary').checked,
    message_primary:  el('msg_primary').value,
    message_secondary: el('msg_secondary').value,
    warn_minutes:     toIntOr('warn_minutes', 4),
    alert_minutes:    toIntOr('alert_minutes', 2),
    blink_seconds:    toIntOr('blink_seconds', 10),
    overrun_minutes:  toIntOr('overrun_minutes', 1),
  };

  const daily = el('mode-daily').checked;
  if (daily) {
    const hhmm = el('daily_time').value;
    patch.daily_time = hhmm || '';
    patch.target_datetime = '__clear__'; // rydde engangstidspunkt
  } else {
    patch.daily_time = '';
    const sdt = el('single_dt').value; // "YYYY-MM-DDTHH:MM"
    if (sdt) patch.target_datetime = sdt;
  }
  return patch;
}

async function saveChanges() {
  state.password = el('admin_password').value || '';
  const patch = collectPatch();
  await ui.post('/api/config', patch, { password: state.password });
  ui.toast('Lagret', 'ok');
  await loadConfig();
}

async function startNow(minutes) {
  state.password = el('admin_password').value || '';
  const m = Number(minutes ?? el('start_minutes').value || 0);
  if (!Number.isFinite(m) || m <= 0) { ui.toast('Ugyldig varighet', 'bad'); return; }
  await ui.post('/api/start', { minutes: Math.floor(m) }, { password: state.password });
  ui.toast(`Startet +${Math.floor(m)} min`, 'ok');
}

function wireEvents() {
  const btnLoad = ui.qs('#btn-load');
  const btnSave = ui.qs('#btn-save');
  const btnStart = ui.qs('#start_now');

  if (btnLoad) btnLoad.addEventListener('click', () => { loadConfig().catch(e => ui.toast(String(e?.message || e), 'bad')); });
  if (btnSave) btnSave.addEventListener('click', () => { saveChanges().catch(e => ui.toast(String(e?.message || e), 'bad')); });
  if (btnStart) btnStart.addEventListener('click', () => { startNow().catch(e => ui.toast(String(e?.message || e), 'bad')); });

  document.querySelectorAll('button[data-qs]').forEach(b => {
    b.addEventListener('click', () => { startNow(b.getAttribute('data-qs')).catch(e => ui.toast(String(e?.message || e), 'bad')); });
  });

  // Debug-kort
  const sbox = ui.qs('#debug-status');
  const dbgR = ui.qs('#btn-debug-refresh');
  const dbgW = ui.qs('#btn-debug-write');

  async function showDebug(write = false) {
    const url = write ? '/debug/config?write_test=1' : '/debug/config';
    try {
      const j = await (await fetch(url, { cache: 'no-store' })).json();
      if (sbox) sbox.textContent = JSON.stringify(j, null, 2);
      ui.toast(write ? (j.write_test_ok ? 'Skrivetest: OK' : 'Skrivetest: FEIL') : 'Status oppdatert', write && !j.write_test_ok ? 'bad' : 'ok');
    } catch (e) {
      ui.toast('Debug-feil: ' + (e?.message || String(e)), 'bad');
    }
  }
  if (dbgR) dbgR.addEventListener('click', () => { void showDebug(false); });
  if (dbgW) dbgW.addEventListener('click', () => { void showDebug(true); });
}

function init() {
  ui.activateNav('/admin');
  wireEvents();
  loadConfig().catch(e => ui.toast(String(e?.message || e), 'bad'));
}

document.addEventListener('DOMContentLoaded', init, { once: true });
