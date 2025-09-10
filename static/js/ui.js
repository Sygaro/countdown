// static/js/ui.js
// Felles småhjelpere: fetch, toast, nav-aktiv og tidformat.

export const ui = (() => {
  function qs(sel, root = document) { return root.querySelector(sel); }
  function qsa(sel, root = document) { return Array.from(root.querySelectorAll(sel)); }

  function toast(msg, tone = "info") {
    let el = qs('#_toast');
    if (!el) {
      el = document.createElement('div');
      el.id = '_toast';
      el.className = 'toast';
      document.body.appendChild(el);
    }
    el.textContent = String(msg);
    el.setAttribute('data-tone', tone || 'info');
    el.style.opacity = '1';
    setTimeout(() => { el.style.opacity = '0'; }, 1600);
  }

  async function get(url) {
    const r = await fetch(url, { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  }

  async function post(url, body, { password } = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (password) headers['X-Admin-Password'] = password;
    const r = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    try { return await r.json(); } catch { return {}; }
  }

  function activateNav(path) {
    qsa('.nav a.link').forEach(a => {
      if (a.getAttribute('href') === path) a.classList.add('active');
      else a.classList.remove('active');
    });
  }

  function mmss(ms) {
    const s = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return (mm < 10 ? '0' + mm : String(mm)) + ':' + (ss < 10 ? '0' + ss : String(ss));
  }

  function signedMmss(ms, useUnicodeMinus = true) {
    const n = Number(ms || 0);
    const negative = n < 0;
    const absMs = Math.abs(n);
    const s = Math.floor(absMs / 1000);
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    const sign = negative ? (useUnicodeMinus ? '−' : '-') : '';
    return sign + (mm < 10 ? '0' + mm : String(mm)) + ':' + (ss < 10 ? '0' + ss : String(ss));
  }

  return { qs, qsa, toast, get, post, activateNav, mmss, signedMmss };
})();

try { window.ui = window.ui || ui; } catch {}
