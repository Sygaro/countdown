// static/js/ui.js
// Felles hjelper: fetch, toast, mm:ss (og signed), og nav-aktiv.
// Både som ESM-export og på window for enkel feilsøking.

export const ui = (function () {
  function qs(sel, root) {
    if (!root) root = document;
    return root.querySelector(sel);
  }
  function qsa(sel, root) {
    if (!root) root = document;
    return Array.prototype.slice.call(root.querySelectorAll(sel));
  }

  function toast(msg, tone) {
    var el = qs("#_toast");
    if (!el) {
      el = document.createElement("div");
      el.id = "_toast";
      el.className = "toast";
      el.style.position = "fixed";
      el.style.left = "50%";
      el.style.transform = "translateX(-50%)";
      el.style.bottom = "20px";
      el.style.padding = "8px 12px";
      el.style.background = "rgba(0,0,0,.75)";
      el.style.color = "#fff";
      el.style.borderRadius = "10px";
      el.style.font = "14px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial";
      el.style.zIndex = "9999";
      el.style.transition = "opacity .25s ease";
      el.style.opacity = "0";
      document.body.appendChild(el);
    }
    el.textContent = String(msg);
    el.style.border =
      "1px solid " + (tone === "bad" ? "rgba(255,80,80,.6)" : "rgba(255,255,255,.4)");
    el.style.opacity = "1";
    setTimeout(function () {
      el.style.opacity = "0";
    }, 1600);
  }

  function _handle(r) {
    if (!r.ok) throw new Error("HTTP " + r.status);
    var ct = r.headers.get("content-type") || "";
    if (ct.indexOf("application/json") !== -1) return r.json();
    return r.text();
  }

  function get(url) {
    return fetch(url, { cache: "no-store" }).then(_handle);
  }

  function post(url, body, opts) {
    opts = opts || {};
    var headers = { "Content-Type": "application/json" };
    if (opts.password) headers["X-Admin-Password"] = opts.password;
    return fetch(url, { method: "POST", headers: headers, body: JSON.stringify(body || {}) }).then(
      _handle,
    );
  }

  function activateNav(path) {
    qsa(".nav a.link").forEach(function (a) {
      if (a.getAttribute("href") === path) a.classList.add("active");
      else a.classList.remove("active");
    });
  }

  function mmss(ms) {
    var s = Math.max(0, Math.floor(Number(ms || 0) / 1000));
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    return (mm < 10 ? "0" + mm : mm) + ":" + (ss < 10 ? "0" + ss : ss);
  }

  function signedMmss(ms, unicodeMinus) {
    if (unicodeMinus == null) unicodeMinus = true;
    var n = Number(ms || 0);
    var neg = n < 0;
    var abs = Math.abs(n);
    var s = Math.floor(abs / 1000);
    var mm = Math.floor(s / 60);
    var ss = s % 60;
    var sign = neg ? (unicodeMinus ? "−" : "-") : "";
    return sign + (mm < 10 ? "0" + mm : mm) + ":" + (ss < 10 ? "0" + ss : ss);
  }

  return {
    qs: qs,
    qsa: qsa,
    toast: toast,
    get: get,
    post: post,
    activateNav: activateNav,
    mmss: mmss,
    signedMmss: signedMmss,
  };
})();

try {
  window.ui = window.ui || ui;
} catch (e) {}
