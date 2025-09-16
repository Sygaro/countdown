// static/js/ui.js
// Felles helpers: fetch, toast, DOM utils, mm:ss-formattering, nav-aktiv.
// Tilbys både som ESM-export og på window for enkel feilsøking.

export const ui = (function () {
  // DOM helpers
  function qs(sel, root) {
    return (root || document).querySelector(sel);
  }
  function qsa(sel, root) {
    return Array.from((root || document).querySelectorAll(sel));
  }
  function el(id) {
    return document.getElementById(id);
  }
  function val(sel) {
    const e = qs(sel);
    return e ? e.value : "";
  }
  function setVal(sel, v) {
    const e = qs(sel);
    if (e) e.value = v;
  }
  function setChecked(sel, on) {
    const e = qs(sel);
    if (e) e.checked = !!on;
  }

  // Toast notifications
  function toast(msg, tone) {
    let el = qs("#_toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "_toast";
      el.className = "toast";
      document.body.appendChild(el);
    }
    el.textContent = String(msg);
    el.classList.remove("ok", "bad");
    if (tone) el.classList.add(tone);
    el.style.opacity = "1";
    setTimeout(() => (el.style.opacity = "0"), 1600);
  }

  // Fetch helpers
  function _handle(r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    const ct = r.headers.get("content-type") || "";
    if (ct.includes("application/json")) return r.json();
    return r.text();
  }

  function get(url) {
    return fetch(url, { cache: "no-store" }).then(_handle);
  }

  function post(url, body, opts) {
    opts = opts || {};
    const headers = { "Content-Type": "application/json" };
    if (opts.password) headers["X-Admin-Password"] = opts.password;
    return fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body || {}),
    }).then(_handle);
  }

  // Navigation highlighting
  function activateNav(path) {
    qsa("nav a").forEach((a) => {
      const href = a.getAttribute("href") || "";
      if (href === path || (path !== "/" && href.startsWith(path))) {
        a.classList.add("active");
      } else {
        a.classList.remove("active");
      }
    });
  }

  // Time formatting
  function mmss(ms) {
    const s = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    return (mm < 10 ? "0" + mm : mm) + ":" + (ss < 10 ? "0" + ss : ss);
  }

  function signedMmss(ms, unicodeMinus = true) {
    const n = Number(ms || 0);
    const neg = n < 0;
    const abs = Math.abs(n);
    const s = Math.floor(abs / 1000);
    const mm = Math.floor(s / 60);
    const ss = s % 60;
    const sign = neg ? (unicodeMinus ? "−" : "-") : "";
    return sign + (mm < 10 ? "0" + mm : mm) + ":" + (ss < 10 ? "0" + ss : ss);
  }

  return {
    qs,
    qsa,
    el,
    val,
    setVal,
    setChecked,
    toast,
    get,
    post,
    activateNav,
    mmss,
    signedMmss,
  };
})();

try {
  window.ui = window.ui || ui;
} catch {}
