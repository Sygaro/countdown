// static/js/statusbar.js
(function () {
  const qs = (s, r) => (r || document).querySelector(s);

  function authHeaders() {
    const pwd = localStorage.getItem("admin_password") || qs('meta[name="admin-password"]')?.content || "";
    const h = { Accept: "application/json" };
    if (pwd) h["X-Admin-Password"] = pwd;
    return h;
  }

  function setDot(name, state) {
    const el = qs(`.sb-services .svc[data-svc="${name}"] .dot`);
    if (!el) return;
    el.className = "dot " + (state === true ? "ok" : state === false ? "bad" : "warn");
  }

  function fmtClock(d) {
    const pad = (n) => String(n).padStart(2, "0");
    return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  }

  function fmtMMSS(ms) {
    const neg = ms < 0,
      abs = Math.abs(ms);
    const s = Math.floor(abs / 1000);
    const mm = Math.floor(s / 60),
      ss = s % 60;
    const pad = (n) => String(n).padStart(2, "0");
    return (neg ? "−" : "") + `${mm}:${pad(ss)}`;
  }

  async function pollTick() {
    try {
      const r = await fetch("/tick", { cache: "no-store" });
      const t = await r.json();
      qs("#sb_cd").textContent = fmtMMSS(t.signed_display_ms);
    } catch (_) {
      /* ignore */
    }
  }

  async function pollServices() {
    try {
      const r = await fetch("/api/sys/about-status", { headers: authHeaders() });
      const js = await r.json();
      if (!r.ok || js.ok === false) throw new Error(js.error || r.status);
      const s = js.about?.services || {};
      // app, kiosk (web er alias)
      setDot("app", !!s.app?.active);
      setDot("kiosk", !!s.kiosk?.active);
    } catch (_) {
      setDot("app", null);
      setDot("kiosk", null);
    }
  }

  function startClock() {
    const el = qs("#sb_clock");
    const tick = () => {
      el.textContent = fmtClock(new Date());
    };
    tick();
    setInterval(tick, 1000);
  }

  document.addEventListener("DOMContentLoaded", () => {
    startClock();
    pollTick();
    setInterval(pollTick, 1000);
    pollServices();
    setInterval(pollServices, 10000);
  });
})();
