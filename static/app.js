// /home/reidar/countdown/static/app.js
(() => {
  const clockEl = document.getElementById('clock');
  const msg1 = document.getElementById('msg1');
  const msg2 = document.getElementById('msg2');

  let snapshot = null;      // last /state payload
  let sseConnected = false; // current SSE status
  let lastUpdate = 0;
  let msg2Base = '';


  function pad(n){ return n < 10 ? '0' + n : '' + n; }

  function fmtRemaining(ms){
    const neg = ms < 0;
    ms = Math.abs(ms);
    const s = Math.floor(ms / 1000);
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return (neg ? '-' : '') + pad(m) + ':' + pad(sec);
  }

  function applyMode(state){
    // state.warn_ms, state.alert_ms, state.remaining_ms, state.blink
    let mode = 'normal';
    if (state.state === 'overrun') mode = 'over';
    else if (state.state === 'running') {
      if (state.remaining_ms <= state.alert_ms) mode = 'alert';
      else if (state.remaining_ms <= state.warn_ms) mode = 'warn';
    }
    document.body.setAttribute('data-mode', mode);
    document.body.setAttribute('data-blink', state.blink ? '1' : '0');
  }

  async function loadConfigAndState(){
    try{
      const r = await fetch('/api/config', {cache:'no-store'});
      if(!r.ok) throw new Error(await r.text());
      const data = await r.json();
      const cfg = data.config || {};

      msg1.textContent = cfg.show_message_primary ? (cfg.message_primary || '') : '';
      msg2Base = cfg.show_message_secondary ? (cfg.message_secondary || '') : '';
      msg2.textContent = msg2Base;
      const r2 = await fetch('/state', {cache:'no-store'});
      snapshot = await r2.json();
      lastUpdate = performance.now();
      const hhmm = snapshot && snapshot.target_ms
        ? new Date(snapshot.target_ms).toLocaleTimeString('nb-NO', {hour: '2-digit', minute: '2-digit'})
        : '';
      msg2.textContent = msg2Base + (hhmm ? ' ' + hhmm : '');

    }catch(e){
      console.error('Init load failed:', e);
    }
  }

  // Render loop — updates every 200ms using last snapshot
  function tick(){
    try{
      if (!snapshot) {
        clockEl.textContent = '00:00';
        return;
      }
      const nowMs = Date.now();
      const target = snapshot.target_ms || 0;
      const remaining = target ? (target - nowMs) : 0;

      const state = {
        ...snapshot,
        remaining_ms: remaining
      };
      clockEl.textContent = fmtRemaining(remaining);
      applyMode(state);
    }catch(e){
      // keep going
    }
  }

  // SSE: refresh snapshot when backend pushes updates
  function startSSE(){
    try{
      const es = new EventSource('/sse');
      es.onopen = () => { sseConnected = true; };
      es.onerror = () => { sseConnected = false; };
      es.onmessage = async ev => {
        try{
          const evt = JSON.parse(ev.data);
          if (evt.type === 'config_update') {
            const r = await fetch('/state', {cache:'no-store'});
            snapshot = await r.json();
            lastUpdate = performance.now();
          const hhmm = snapshot && snapshot.target_ms
            ? new Date(snapshot.target_ms).toLocaleTimeString('nb-NO', {hour: '2-digit', minute: '2-digit'})
            : '';
          msg2.textContent = msg2Base + (hhmm ? ' ' + hhmm : '');
          }
        }catch(e){ /* ignore */ }
      };
    }catch(e){
      console.warn('SSE unavailable:', e);
      sseConnected = false;
    }
  }

  // Fallback poller — if SSE drops, poll /state every 3s
  setInterval(async () => {
    if (!sseConnected || (performance.now() - lastUpdate) > 10000) {
      try{
        const r = await fetch('/state', {cache:'no-store'});
        if (r.ok) {
          snapshot = await r.json();
          lastUpdate = performance.now();
          const hhmm = snapshot && snapshot.target_ms
            ? new Date(snapshot.target_ms).toLocaleTimeString('nb-NO', {hour: '2-digit', minute: '2-digit'})
            : '';
          msg2.textContent = msg2Base + (hhmm ? ' ' + hhmm : '');
        }
      }catch(e){ /* ignore */ }
    }
  }, 3000);

  // Kick off
  loadConfigAndState().then(startSSE);
  setInterval(tick, 200);
})();
