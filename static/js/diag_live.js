// static/js/diag_live.js
(function () {
  const qs = (s, r) => (r || document).querySelector(s);

  const fmtBoth = (ms) => {
    const sgn = ms < 0 ? "-" : "";
    ms = Math.abs(ms);
    let s = Math.floor(ms / 1000);
    const h = Math.floor(s / 3600);
    s %= 3600;
    const m = Math.floor(s / 60);
    s %= 60;
    const pad = (n) => String(n).padStart(2, "0");
    return {
      mmss: `${sgn}${Math.floor(h * 60 + m)}:${pad(s)}`,
      hms: `${sgn}${h}:${pad(m)}:${pad(s)}`,
    };
  };

  async function poll() {
    const t0 = performance.now();
    const r = await fetch("/tick", { cache: "no-store" });
    const t = await r.json();
    const dt = performance.now() - t0;
    const both = fmtBoth(t.signed_display_ms);
    qs("#countdown").textContent = both.mmss;
    qs("#phase").textContent = `fase: ${t.mode} · state: ${t.state}`;
    qs("#meta").textContent = `mål: ${t.target_hhmm || t.target_ms} · nå: ${new Date(t.now_ms).toLocaleTimeString()}`;
    qs("#both").textContent = `format: ${both.hms} / ${both.mmss}`;
    qs("#lat").textContent = `latency: ${dt.toFixed(0)} ms`;
    qs("#live").textContent = JSON.stringify(t, null, 2);
  }

  async function selftest() {
    const r = await fetch("/debug/selftest", { cache: "no-store" });
    const js = await r.json();
    const ul = qs("#selftest");
    ul.innerHTML = "";
    js.tests.forEach((t) => {
      const li = document.createElement("li");
      li.textContent = `${t.ok ? "✔" : "✖"} ${t.name}${t.info ? " — " + t.info : ""}`;
      li.className = t.ok ? "ok" : "fail";
      ul.appendChild(li);
    });
  }

  async function dump(url) {
    const r = await fetch(url, { cache: "no-store" });
    const js = await r.json();
    qs("#raw").textContent = JSON.stringify(js, null, 2);
  }

  document.addEventListener("DOMContentLoaded", () => {
    qs("#refresh").addEventListener("click", () => poll().catch(console.error));
    qs("#run_selftest").addEventListener("click", () => selftest().catch(console.error));
    document.querySelectorAll("[data-dump]").forEach((btn) => {
      btn.addEventListener("click", () => dump(btn.dataset.dump).catch(console.error));
    });

    poll().catch(console.error);
    setInterval(poll, 1000);
  });
  window.__runSelftest = selftest;
})();
